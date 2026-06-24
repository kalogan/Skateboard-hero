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
import { seedRng, nextRange, nextInt, nextWeightedIndex } from './rng.js';

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
  const base: WorldState = {
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
  // Lane mode starts in the middle lane with the lateral position settled on it.
  // Classic mode is left untouched (no `lane`/`lateral` fields — byte-identical).
  if (config.mode === 'lanes') {
    const laneCount = laneCountOf(config);
    const startLane = Math.floor(laneCount / 2);
    return { ...base, lane: startLane, lateral: startLane };
  }
  return base;
}

/** Resolve the configured lane count, clamped to at least one lane. */
function laneCountOf(config: SimConfig): number {
  const n = config.laneCount ?? 3;
  return n >= 1 ? n : 1;
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
  // Frozen once bailed — deterministic no-op (both modes).
  if (world.status === 'bailed') return world;

  // Dispatch on the movement model. `undefined` is treated as `'classic'` so
  // existing worlds/configs keep the shipped horizontal behaviour untouched.
  if (config.mode === 'lanes') return stepLanes(world, input, config);

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

  // ── Board physics (ollie arc + variable jump) ──
  let { y, vy, grounded, rotation, trick, jumpSustain } = world.board;

  // Ollie only fires from the ground (no double-jump). On take-off, select the
  // trick for this hop from the player's gesture (no RNG): the catalog entry
  // matching `input.gesture`, defaulting to the `'tap'` trick (ollie) when the
  // gesture is omitted or flicks a direction no trick maps to. Takeoff also
  // opens the variable-jump sustain window (`jumpHoldMaxTime`), if configured.
  if (input.ollie && grounded) {
    vy = config.ollieImpulse;
    grounded = false;
    trick = trickIdForGesture(config, input.gesture ?? 'tap');
    // Only arm the float when the hold config is present; otherwise leave the
    // field ABSENT so a fixed-hop config behaves exactly as before (and worlds
    // that never set `jumpHeld` stay byte-identical — see the golden fixture).
    jumpSustain = config.jumpHoldMaxTime;
  } else if (!grounded && input.gesture != null) {
    // Any mid-air gesture (re)selects the trick from the catalog — directional →
    // its trick, `doubleTap` → heelflip, `tap` → ollie. This lets the app take
    // off plain on press and apply the flicked trick when it resolves on release.
    // Idempotent: the same gesture resolves to the same trick, so it won't thrash.
    trick = trickIdForGesture(config, input.gesture);
  }

  let landedTrickId: TrickId | null = null;
  if (!grounded) {
    // Variable jump (Super-Mario style): while the button is HELD, the board is
    // still ASCENDING (vy > 0), and the sustain window has time left, integrate
    // with REDUCED gravity (a longer hold floats higher, capped by the window).
    // Releasing, starting to descend, or exhausting the window restores full
    // gravity → the board falls normally. When the hold config is unset
    // (`jumpSustain` absent) this branch never takes and the arc is the legacy
    // fixed hop.
    const scale = config.jumpHoldGravityScale;
    const floating =
      input.jumpHeld === true &&
      vy > 0 &&
      jumpSustain !== undefined &&
      jumpSustain > 0 &&
      scale !== undefined;
    const gravity = floating ? config.gravity * scale! : config.gravity;
    if (floating) jumpSustain = jumpSustain! - dt;
    // Integrate the arc; gravity is negative (pulls toward ground).
    vy = vy + gravity * dt;
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
      jumpSustain = undefined;
    }
  }

  const board = { y, vy, grounded, rotation, trick, jumpSustain };

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
    // Entry point: a fixed lead distance (`spawnAhead`, set by the app to just
    // off the right edge) when configured, else the rolled gap (legacy). Either
    // way `nextSpawnIn += gap` below keeps spacing = gap. The overshoot term
    // keeps spacing exact across frames.
    const lead = config.spawnAhead ?? gap;
    const spawnX = config.boardX + config.boardWidth + lead + Math.max(0, -nextSpawnIn);
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

/**
 * Advance the world one fixed timestep in `'lanes'` mode — the vertical,
 * Temple-Run-like lane-dodge runner. PURE, like `step`: returns a brand-new
 * `WorldState`; never mutates `world`, `input`, or `config`.
 *
 * Mechanic (the renderer + preview code to this exact shape):
 *  - Lanes are indexed `0..laneCount-1` (0 = leftmost). `world.lane` is the
 *    discrete TARGET lane; `world.lateral` is the continuous position that
 *    animates toward `lane` at `config.laneShiftSpeed` lanes/sec for a smooth
 *    slide (cosmetic — collision uses the integer target lane).
 *  - Forward axis is `distance` (renders vertically). The forward model is the
 *    SAME as classic: the board's fixed forward position is `config.boardX`;
 *    obstacles spawn ahead (`x > boardX`) and their `x` DECREASES toward the
 *    board as the world advances. Speed/ramp, the spawner gap window, and the
 *    vertical (jump) collision test are all reused from classic.
 *  - Input: a discrete `'left'`/`'right'` gesture shifts the TARGET lane by one
 *    (clamped at the edges); `input.ollie` while grounded does a plain hop
 *    (reusing board.y/vy/gravity/ollieImpulse) to clear jumpable obstacles.
 *  - Collision/bail: an obstacle bails the run when its forward span overlaps
 *    the board AND `obstacle.lane === world.lane` (the integer target lane) AND
 *    the board isn't airborne above the obstacle's height. A lane change or a
 *    well-timed jump both let you survive.
 *
 *  Design choices (documented per the brief):
 *   - MID-SLIDE MERCY: collision compares against the integer TARGET `lane`, not
 *     the continuous `lateral`. The instant the player presses left/right they
 *     are treated as occupying the new lane — committing to a dodge saves you
 *     even mid-slide. This is forgiving by design (runner feel) and keeps the
 *     collision rule a clean integer compare.
 *   - JUMP IS A PLAIN HOP: the lane-mode jump selects NO catalog trick
 *     (`board.trick` stays `null`) and awards NO trick points — it's purely a
 *     "clear the obstacle" verb. `tricks`/`trickScore` stay classic concepts and
 *     remain 0 in lane mode.
 *   - SCORING: `score = floor(distance)`. Distance is the whole game.
 */
function stepLanes(
  world: WorldState,
  input: InputIntent,
  config: SimConfig,
): WorldState {
  const dt = config.dt;
  const laneCount = laneCountOf(config);
  const shiftSpeed = config.laneShiftSpeed ?? 8;

  // ── Speed + distance (difficulty ramp, identical model to classic) ──
  const speed = speedAt(config, world.distance);
  const advance = speed * dt;
  const distance = world.distance + advance;
  const time = world.time + dt;

  let rng = world.rng;

  // ── Lane shift (one discrete shift per left/right gesture, clamped) ──
  const prevLane = world.lane ?? Math.floor(laneCount / 2);
  let lane = prevLane;
  if (input.gesture === 'left') lane = Math.max(0, prevLane - 1);
  else if (input.gesture === 'right') lane = Math.min(laneCount - 1, prevLane + 1);

  // ── Lateral animation toward the target lane at `shiftSpeed` lanes/sec ──
  const prevLateral = world.lateral ?? prevLane;
  let lateral = prevLateral;
  const maxStep = shiftSpeed * dt;
  if (lateral < lane) lateral = Math.min(lane, lateral + maxStep);
  else if (lateral > lane) lateral = Math.max(lane, lateral - maxStep);

  // ── Board physics (plain hop — no trick selection in lane mode) ──
  let { y, vy, grounded } = world.board;
  if (input.ollie && grounded) {
    vy = config.ollieImpulse;
    grounded = false;
  }
  if (!grounded) {
    vy = vy + config.gravity * dt;
    y = y + vy * dt;
    if (y <= config.groundY) {
      y = config.groundY;
      vy = 0;
      grounded = true;
    }
  }
  // Lane-mode jump is a plain hop: no catalog trick, no spin score. `rotation`
  // and `trick` stay at their classic neutral values so the shape is uniform.
  const board = { y, vy, grounded, rotation: 0, trick: null };

  // ── Spawner (seeded, weighted) with a seeded lane per obstacle ──
  let nextSpawnIn = world.nextSpawnIn - advance;
  const spawned: Obstacle[] = [];
  while (nextSpawnIn <= 0) {
    const weights = config.obstacles.map((o) => o.weight);
    // Thread RNG sequentially: weighted KIND pick, lane roll, then the gap roll.
    const [idx, rngAfterPick] = nextWeightedIndex(rng, weights);
    const def = config.obstacles[idx]!;
    const [obsLane, rngAfterLane] = nextInt(rngAfterPick, 0, laneCount - 1);
    const [gap, rngAfterGap] = nextRange(
      rngAfterLane,
      config.spawnGapMin,
      config.spawnGapMax,
    );
    rng = rngAfterGap;
    const spawnX =
      config.boardX + config.boardWidth + gap + Math.max(0, -nextSpawnIn);
    spawned.push({
      kind: def.kind,
      x: spawnX,
      width: def.width,
      height: def.height,
      cleared: false,
      lane: obsLane,
    });
    nextSpawnIn += gap;
  }

  // ── Move obstacles, mark cleared, test lane collision, cull past the board ──
  let bailed = false;
  const obstacles: Obstacle[] = [];
  const moveAndCollect = (obs: Obstacle): void => {
    const x = obs.x - advance;
    if (x + obs.width < 0) return; // culled once fully past the board
    let cleared = obs.cleared;
    const moved = { ...obs, x };
    if (overlapsBoard(config, moved)) {
      // Bail only in the OCCUPIED lane (integer target) when not jumping above it.
      if (obs.lane === lane && collides(board, moved)) {
        bailed = true;
      }
    } else if (!cleared && x + obs.width < config.boardX) {
      cleared = true;
    }
    obstacles.push({ ...moved, cleared });
  };
  for (const obs of world.obstacles) moveAndCollect(obs);
  for (const obs of spawned) moveAndCollect(obs);

  // ── Scoring: distance is the whole game in lane mode ──
  const score = Math.floor(distance);

  return {
    status: bailed ? 'bailed' : 'rolling',
    time,
    distance,
    speed,
    score,
    // Lane-mode keeps tricks/trickScore as classic concepts: a hop scores nothing.
    tricks: world.tricks,
    trickScore: world.trickScore,
    board,
    obstacles,
    rng,
    nextSpawnIn,
    lane,
    lateral,
  };
}
