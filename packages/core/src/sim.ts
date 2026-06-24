/**
 * The authoritative, deterministic Skateboard Hero simulation.
 *
 * `createWorld(config, seed)` builds the initial `WorldState`; `step(world,
 * input, config)` is a PURE function that advances the world by exactly one
 * fixed timestep (`config.dt`). No mutation of inputs, no wall-clock, no
 * `Math.random` — the only randomness is the seeded RNG threaded through
 * `world.rng`. Same `(world, input, config)` always yields an identical next
 * world (proven by the golden replay fixture).
 *
 * Coordinate convention (shared with the renderer):
 *  - World-x is the shared horizontal axis. The board sits at `config.boardX`.
 *    Obstacles spawn AHEAD (larger x) and their `x` DECREASES by `speed * dt`
 *    each step as the world scrolls toward the board.
 *  - +y is UP; `config.groundY` (0) is the ground; `board.y` is height ABOVE
 *    the ground (0 = grounded).
 *  - Collision overlaps an obstacle's x-span with `[boardX, boardX + boardWidth]`.
 *
 * Lifecycle:
 *  - `createWorld` returns status `'ready'`.
 *  - The FIRST `step()` transitions `'ready' -> 'rolling'` (the board auto-rolls
 *    immediately; you do not need to press anything to start). An ollie on that
 *    first tick is still honoured.
 *  - Collision with an obstacle transitions `'rolling' -> 'bailed'`. Once
 *    `'bailed'`, `step()` is a no-op that returns the frozen final state.
 *
 * Ollie / trick rules:
 *  - `input.ollie` while grounded imparts `config.ollieImpulse` upward velocity.
 *    Gravity integrates the arc; the board lands when `y` returns to 0 (clamped).
 *  - Ollie is IGNORED mid-air (no double-jump) — by design.
 *  - On each ollie the sim selects a NAMED TRICK from the catalog by the
 *    player's GESTURE (`input.gesture`, defaulting to `'tap'` = ollie) and
 *    stores it on `board.trick`. Selection is input-driven and consumes NO RNG.
 *    The pick happens once, on take-off; mid-air a `'doubleTap'` gesture may
 *    upgrade it once to the double-tap trick (heelflip) — otherwise unchanged.
 *  - A "trick" is one clean airborne hop that lands without bailing: each time
 *    the board lands from the air it awards THAT trick's `points` (added to
 *    `trickScore`) and increments `tricks`. If the landing frame bails, no points
 *    are awarded. `board.trick` clears to `null` on land. A cosmetic `rotation`
 *    spins while airborne and resets on land.
 *  - score = floor(distance) + trickScore (sum of landed trick points).
 */

import type {
  InputIntent,
  Obstacle,
  SimConfig,
  TrickId,
  WorldState,
} from './types.js';
import type { TrickGesture } from './types.js';
import { seedRng, nextRange, nextWeightedIndex } from './rng.js';

/** Full radians of board spin imparted per air-second (cosmetic). */
const SPIN_PER_SECOND = Math.PI * 2;

/**
 * Resolve a gesture to a catalog trick id. The player's gesture chooses the
 * trick deterministically (no RNG): the catalog entry whose `gesture` matches.
 * A flick direction with no matching trick falls back to the `'tap'` (ollie)
 * trick so an unmapped direction never produces an unselectable hop.
 */
function trickIdForGesture(
  config: SimConfig,
  gesture: TrickGesture,
): TrickId {
  const match = config.tricks.find((t) => t.gesture === gesture);
  if (match) return match.id;
  const tap = config.tricks.find((t) => t.gesture === 'tap');
  // Catalog is guaranteed non-empty; prefer the tap trick, else the first entry.
  return (tap ?? config.tricks[0]!).id;
}

/**
 * Build the initial, deterministic world for a fresh run.
 *
 * The board starts grounded at the origin; the first `step()` flips status to
 * `'rolling'`. `seed` is normalized into the in-state RNG cursor so the entire
 * run is replayable from this single integer.
 */
export function createWorld(config: SimConfig, seed: number): WorldState {
  return {
    status: 'ready',
    time: 0,
    distance: 0,
    speed: config.baseSpeed,
    score: 0,
    tricks: 0,
    trickScore: 0,
    board: {
      y: config.groundY,
      vy: 0,
      grounded: true,
      rotation: 0,
      trick: null,
    },
    obstacles: [],
    rng: seedRng(seed),
    // First spawn is scheduled on the first step from the seeded gap window.
    nextSpawnIn: 0,
  };
}

/** Forward speed at a given distance, ramped from base toward max. */
function speedAt(config: SimConfig, distance: number): number {
  const ramped = config.baseSpeed + config.speedRamp * distance;
  return ramped < config.maxSpeed ? ramped : config.maxSpeed;
}

/** True when the obstacle's x-span overlaps the board's footprint. */
function overlapsBoard(config: SimConfig, obstacle: Obstacle): boolean {
  const boardLeft = config.boardX;
  const boardRight = config.boardX + config.boardWidth;
  const obsLeft = obstacle.x;
  const obsRight = obstacle.x + obstacle.width;
  return obsRight >= boardLeft && obsLeft <= boardRight;
}

/**
 * Vertical collision test: an obstacle hits the skater only when the board's
 * underside is below the obstacle's top while their x-spans overlap. A clean
 * ollie clears the obstacle by being airborne high enough.
 */
function collides(board: { y: number }, obstacle: Obstacle): boolean {
  // The board's lowest point is its `y` (height above ground). It clears the
  // obstacle when that height meets-or-exceeds the obstacle's height.
  return board.y < obstacle.height;
}

/**
 * Advance the world by one fixed timestep. Pure: returns a brand-new
 * `WorldState`; never mutates `world`, `input`, or `config`.
 */
export function step(
  world: WorldState,
  input: InputIntent,
  config: SimConfig,
): WorldState {
  // Frozen once bailed — deterministic no-op.
  if (world.status === 'bailed') return world;

  const dt = config.dt;
  const status = 'rolling';

  // ── Speed + distance (difficulty ramp) ──
  const speed = speedAt(config, world.distance);
  const advance = speed * dt;
  const distance = world.distance + advance;
  const time = world.time + dt;

  // RNG threaded sequentially through the whole step: trick selection is now
  // INPUT-DRIVEN (the player's gesture chooses the trick) and consumes NO RNG —
  // the only RNG draws are the spawner's weighted-pick + gap rolls.
  let rng = world.rng;

  // ── Board physics (ollie arc) ──
  let { y, vy, grounded, rotation, trick } = world.board;

  // Ollie only fires from the ground (no double-jump). On take-off, select the
  // trick for this hop from the player's gesture (no RNG): the catalog entry
  // matching `input.gesture`, defaulting to the `'tap'` trick (ollie) when the
  // gesture is omitted or flicks a direction no trick maps to.
  if (input.ollie && grounded) {
    vy = config.ollieImpulse;
    grounded = false;
    trick = trickIdForGesture(config, input.gesture ?? 'tap');
  } else if (!grounded && input.gesture === 'doubleTap') {
    // Mid-air double-tap upgrades the in-progress trick to the `'doubleTap'`
    // trick (heelflip) — a single upgrade; selection by gesture won't thrash
    // because the same gesture resolves to the same trick.
    trick = trickIdForGesture(config, 'doubleTap');
  }

  let landedTrickId: TrickId | null = null;
  if (!grounded) {
    // Integrate the arc; gravity is negative (pulls toward ground).
    vy = vy + config.gravity * dt;
    y = y + vy * dt;
    rotation = rotation + SPIN_PER_SECOND * dt;
    if (y <= config.groundY) {
      // Land: clamp to ground, zero vertical state, reset spin, score the trick.
      y = config.groundY;
      vy = 0;
      grounded = true;
      rotation = 0;
      landedTrickId = trick;
      trick = null;
    }
  }

  const board = { y, vy, grounded, rotation, trick };

  // ── Spawner (seeded, weighted) ──
  let nextSpawnIn = world.nextSpawnIn - advance;
  const spawned: Obstacle[] = [];
  // `while` rather than `if` so a large `advance` (or tiny gap) can never starve
  // the field — though in practice one spawn per step is the norm.
  while (nextSpawnIn <= 0) {
    const weights = config.obstacles.map((o) => o.weight);
    // Thread RNG sequentially: weighted pick first, then the gap roll.
    const [idx, rngAfterPick] = nextWeightedIndex(rng, weights);
    const def = config.obstacles[idx]!;
    const [gap, rngAfterGap] = nextRange(
      rngAfterPick,
      config.spawnGapMin,
      config.spawnGapMax,
    );
    rng = rngAfterGap;
    // Spawn just off the right edge: ahead of the board by the rolled gap, plus
    // whatever overshoot the step produced (keeps spacing exact across frames).
    const spawnX = config.boardX + config.boardWidth + gap + Math.max(0, -nextSpawnIn);
    spawned.push({
      kind: def.kind,
      x: spawnX,
      width: def.width,
      height: def.height,
      cleared: false,
    });
    nextSpawnIn += gap;
  }

  // ── Move obstacles, mark cleared, test collision, cull off-screen-left ──
  let bailed = false;
  const obstacles: Obstacle[] = [];
  const moveAndCollect = (obs: Obstacle): void => {
    const x = obs.x - advance;
    // Cull once fully past the board on the left (off-screen).
    if (x + obs.width < 0) return;
    let cleared = obs.cleared;
    if (overlapsBoard(config, { ...obs, x })) {
      if (collides(board, { ...obs, x })) {
        bailed = true;
      }
    } else if (!cleared && x + obs.width < config.boardX) {
      // Fully past the board's left edge without contact → cleared.
      cleared = true;
    }
    obstacles.push({ ...obs, x, cleared });
  };
  for (const obs of world.obstacles) moveAndCollect(obs);
  for (const obs of spawned) moveAndCollect(obs);

  // ── Scoring (per-trick points) ──
  // A clean landing this frame awards the landed trick's catalog points; if the
  // SAME frame bails, suppress the award. Distance always scores.
  const landedCleanly = landedTrickId !== null && !bailed;
  const landedPoints = landedCleanly
    ? (config.tricks.find((t) => t.id === landedTrickId)?.points ?? 0)
    : 0;
  const tricks = world.tricks + (landedCleanly ? 1 : 0);
  const trickScore = world.trickScore + landedPoints;
  const score = Math.floor(distance) + trickScore;

  return {
    status: bailed ? 'bailed' : status,
    time,
    distance,
    speed,
    score,
    tricks,
    trickScore,
    board,
    obstacles,
    rng,
    nextSpawnIn,
  };
}
