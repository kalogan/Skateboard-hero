import { describe, it, expect } from 'vitest';
import { createWorld, step } from './sim.js';
import { DEFAULT_CONFIG } from './config.js';
import type { InputIntent, Obstacle, SimConfig, WorldState } from './types.js';

/** A lane-mode config: same tuning as classic, just the movement model flipped. */
const LANES: SimConfig = { ...DEFAULT_CONFIG, mode: 'lanes' };

const NO_INPUT: InputIntent = { ollie: false };
const LEFT: InputIntent = { ollie: false, gesture: 'left' };
const RIGHT: InputIntent = { ollie: false, gesture: 'right' };
const JUMP: InputIntent = { ollie: true };

/** Run a scripted input sequence and return the final world. */
function run(
  world: WorldState,
  config: SimConfig,
  inputs: readonly InputIntent[],
): WorldState {
  let w = world;
  for (const input of inputs) w = step(w, input, config);
  return w;
}

/** Build a rolling lane world with a single hand-placed obstacle. */
function withObstacle(
  config: SimConfig,
  lane: number,
  obstacle: Partial<Obstacle>,
  worldPatch: Partial<WorldState> = {},
): WorldState {
  const base = createWorld(config, 1);
  return {
    ...base,
    status: 'rolling',
    lane,
    lateral: lane,
    nextSpawnIn: 1e9, // keep the spawner quiet for isolated assertions
    obstacles: [
      {
        kind: 'cone',
        x: config.boardX,
        width: 14,
        height: 18,
        cleared: false,
        lane: 0,
        ...obstacle,
      },
    ],
    ...worldPatch,
  };
}

describe('lane mode — createWorld', () => {
  it('starts in the middle lane with lateral settled on it', () => {
    const w = createWorld(LANES, 1);
    const mid = Math.floor((LANES.laneCount ?? 3) / 2);
    expect(w.lane).toBe(mid);
    expect(w.lateral).toBe(mid);
    expect(w.status).toBe('ready');
    expect(w.distance).toBe(0);
    expect(w.board.grounded).toBe(true);
  });

  it('classic createWorld carries NO lane fields (additive, undefined in classic)', () => {
    const w = createWorld(DEFAULT_CONFIG, 1);
    expect(w.lane).toBeUndefined();
    expect(w.lateral).toBeUndefined();
  });

  it('respects a custom laneCount for the middle start', () => {
    const fiveLanes: SimConfig = { ...LANES, laneCount: 5 };
    const w = createWorld(fiveLanes, 1);
    expect(w.lane).toBe(2);
    expect(w.lateral).toBe(2);
  });
});

describe('lane mode — determinism / purity', () => {
  it('does not mutate its inputs', () => {
    const w = createWorld(LANES, 7);
    const wSnap = structuredClone(w);
    const input = { ollie: true, gesture: 'left' as const };
    const inSnap = structuredClone(input);
    const cfgSnap = structuredClone(LANES);
    step(w, input, LANES);
    expect(w).toEqual(wSnap);
    expect(input).toEqual(inSnap);
    expect(LANES).toEqual(cfgSnap);
  });

  it('is referentially deterministic for the same (world,input,config)', () => {
    const w = createWorld(LANES, 99);
    const a = step(w, LEFT, LANES);
    const b = step(w, LEFT, LANES);
    expect(a).toEqual(b);
  });

  it('a full seeded run reproduces byte-identically', () => {
    const drive = (seed: number): WorldState => {
      let w = createWorld(LANES, seed);
      for (let i = 0; i < 400 && w.status !== 'bailed'; i++) {
        const input = i % 7 === 0 ? LEFT : i % 11 === 0 ? RIGHT : NO_INPUT;
        w = step(w, input, LANES);
      }
      return w;
    };
    expect(drive(0xbeef)).toEqual(drive(0xbeef));
  });

  it('a different seed yields a different trajectory (RNG drives spawns)', () => {
    const drive = (seed: number): readonly Obstacle[] => {
      let w = createWorld(LANES, seed);
      for (let i = 0; i < 200; i++) w = step(w, NO_INPUT, LANES);
      return w.obstacles;
    };
    expect(drive(1)).not.toEqual(drive(2));
  });
});

describe('lane mode — status transitions', () => {
  it('flips ready -> rolling on the first step', () => {
    const w0 = createWorld(LANES, 1);
    const w1 = step(w0, NO_INPUT, LANES);
    expect(w0.status).toBe('ready');
    expect(w1.status).toBe('rolling');
  });

  it('freezes (no-op) once bailed', () => {
    const hit = withObstacle(LANES, 0, { lane: 0, x: LANES.boardX + 1 });
    const bailed = step(hit, NO_INPUT, LANES);
    expect(bailed.status).toBe('bailed');
    const frozen = step(bailed, RIGHT, LANES);
    expect(frozen).toBe(bailed); // identical reference: pure no-op
  });
});

describe('lane mode — lane shift + clamping', () => {
  it("a 'left' gesture shifts the target lane down by one", () => {
    const w = step(createWorld(LANES, 1), LEFT, LANES); // mid (1) -> 0
    expect(w.lane).toBe(0);
  });

  it("a 'right' gesture shifts the target lane up by one", () => {
    const w = step(createWorld(LANES, 1), RIGHT, LANES); // mid (1) -> 2
    expect(w.lane).toBe(2);
  });

  it('one shift per discrete gesture (not per tick of holding)', () => {
    // Two explicit RIGHT gestures move two lanes; an idle tick between does not.
    let w = createWorld({ ...LANES, laneCount: 5 }, 1); // start lane 2
    w = step(w, RIGHT, { ...LANES, laneCount: 5 }); // -> 3
    w = step(w, NO_INPUT, { ...LANES, laneCount: 5 }); // stays 3
    w = step(w, RIGHT, { ...LANES, laneCount: 5 }); // -> 4
    expect(w.lane).toBe(4);
  });

  it('clamps at the left edge (cannot go below 0)', () => {
    let w = createWorld(LANES, 1);
    w = run(w, LANES, [LEFT, LEFT, LEFT, LEFT]);
    expect(w.lane).toBe(0);
  });

  it('clamps at the right edge (cannot exceed laneCount-1)', () => {
    let w = createWorld(LANES, 1);
    w = run(w, LANES, [RIGHT, RIGHT, RIGHT, RIGHT]);
    expect(w.lane).toBe((LANES.laneCount ?? 3) - 1);
  });

  it('lateral animates toward the target at laneShiftSpeed lanes/sec', () => {
    // Slow the slide so it does not snap in one tick; assert it is mid-slide.
    const slow: SimConfig = { ...LANES, laneShiftSpeed: 2 };
    const w0 = createWorld(slow, 1); // lane 1, lateral 1
    const w1 = step(w0, LEFT, slow); // target lane 0; lateral eases down
    expect(w1.lane).toBe(0);
    expect(w1.lateral).toBeGreaterThan(0); // not yet arrived
    expect(w1.lateral).toBeLessThan(1);
    expect(w1.lateral).toBeCloseTo(1 - 2 * slow.dt, 6);
  });

  it('lateral eventually settles exactly on the target lane', () => {
    const slow: SimConfig = { ...LANES, laneShiftSpeed: 2 };
    let w = step(createWorld(slow, 1), LEFT, slow);
    for (let i = 0; i < 200 && w.lateral !== w.lane; i++) {
      w = step(w, NO_INPUT, slow);
    }
    expect(w.lateral).toBe(0);
    expect(w.lane).toBe(0);
  });
});

describe('lane mode — collision / bail (occupied lane only)', () => {
  it('bails when a grounded obstacle in the SAME lane overlaps the board', () => {
    const w = withObstacle(LANES, 1, { lane: 1, x: LANES.boardX + 1 });
    const next = step(w, NO_INPUT, LANES);
    expect(next.status).toBe('bailed');
  });

  it('does NOT bail when the obstacle is in a DIFFERENT lane', () => {
    const w = withObstacle(LANES, 1, { lane: 0, x: LANES.boardX + 1 });
    const next = step(w, NO_INPUT, LANES);
    expect(next.status).toBe('rolling');
  });

  it('dodging into a clear lane survives an obstacle ahead in your lane', () => {
    // Obstacle in lane 1 (the start lane), placed a little ahead. Shift to lane 0
    // before it reaches the board → the integer-lane compare spares us.
    const w = withObstacle(LANES, 1, { lane: 1, x: LANES.boardX + 30 });
    let next = step(w, LEFT, LANES); // commit to lane 0 immediately
    expect(next.lane).toBe(0);
    for (let i = 0; i < 60 && next.status === 'rolling'; i++) {
      next = step(next, NO_INPUT, LANES);
    }
    expect(next.status).toBe('rolling');
  });

  it('mid-slide MERCY: committing to a lane change spares you the same tick', () => {
    // Obstacle directly on the board in lane 1; we start in lane 1 but press LEFT
    // this tick. lateral is still ~1 (mid-slide) but the integer target is 0, so
    // no bail — the documented forgiving rule.
    const slow: SimConfig = { ...LANES, laneShiftSpeed: 2 };
    const w = withObstacle(slow, 1, { lane: 1, x: slow.boardX + 1 });
    const next = step(w, LEFT, slow);
    expect(next.lane).toBe(0);
    expect(next.lateral).toBeGreaterThan(0.5); // still physically mid-slide
    expect(next.status).toBe('rolling'); // mercy granted
  });

  it('jumping clears a same-lane obstacle (airborne above its height)', () => {
    const w = withObstacle(LANES, 1, { lane: 1, x: LANES.boardX + 5 }, {
      board: { y: 200, vy: 0, grounded: false, rotation: 0, trick: null },
    });
    const next = step(w, NO_INPUT, LANES);
    expect(next.status).toBe('rolling'); // above the obstacle height
  });

  it('a grounded skater in the same lane under an overlapping obstacle bails', () => {
    const w = withObstacle(LANES, 2, { lane: 2, x: LANES.boardX + 2 });
    const next = step(w, NO_INPUT, LANES);
    expect(next.status).toBe('bailed');
  });
});

describe('lane mode — spawner', () => {
  it('spawns obstacles ahead of the board with a valid seeded lane', () => {
    const w = step(createWorld(LANES, 123), NO_INPUT, LANES);
    expect(w.obstacles.length).toBeGreaterThan(0);
    const laneCount = LANES.laneCount ?? 3;
    for (const o of w.obstacles) {
      expect(o.x).toBeGreaterThan(LANES.boardX);
      expect(o.lane).toBeGreaterThanOrEqual(0);
      expect(o.lane).toBeLessThan(laneCount);
      expect(Number.isInteger(o.lane)).toBe(true);
    }
  });

  it('moves obstacles toward the board and culls them once past it', () => {
    let w = createWorld(LANES, 5);
    w = step(w, NO_INPUT, LANES);
    const first = w.obstacles[0]!;
    const w2 = step(w, NO_INPUT, LANES);
    expect(w2.obstacles[0]!.x).toBeLessThan(first.x);

    const offscreen: WorldState = {
      ...createWorld(LANES, 1),
      status: 'rolling',
      nextSpawnIn: 1e9,
      obstacles: [{ kind: 'cone', x: -100, width: 14, height: 18, cleared: true, lane: 0 }],
    };
    expect(step(offscreen, NO_INPUT, LANES).obstacles.length).toBe(0);
  });

  it('produces a spread of lanes across many spawns (RNG actually varies lane)', () => {
    let w = createWorld(LANES, 777);
    const lanes = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const before = w.obstacles.length;
      // Keep airborne enough to avoid early bails skewing the sample.
      w = step(w, i % 2 === 0 ? JUMP : NO_INPUT, LANES);
      if (w.status === 'bailed') w = { ...w, status: 'rolling', obstacles: [] };
      for (const o of w.obstacles) if (o.lane !== undefined) lanes.add(o.lane);
      if (w.obstacles.length < before) {
        /* culling — fine */
      }
    }
    expect(lanes.size).toBeGreaterThan(1);
  });
});

describe('lane mode — jump is a plain hop (no trick)', () => {
  it('ollie imparts upward velocity but selects no trick', () => {
    const w = step(createWorld(LANES, 3), JUMP, LANES);
    expect(w.board.grounded).toBe(false);
    expect(w.board.vy).toBeGreaterThan(0);
    expect(w.board.trick).toBeNull();
    expect(w.board.rotation).toBe(0); // no cosmetic trick spin in lane mode
  });

  it('lands back to the ground and awards no trick points', () => {
    let w = step(createWorld(LANES, 3), JUMP, LANES);
    for (let i = 0; i < 120 && !w.board.grounded; i++) {
      w = step(w, NO_INPUT, LANES);
    }
    expect(w.board.grounded).toBe(true);
    expect(w.board.y).toBe(LANES.groundY);
    expect(w.tricks).toBe(0);
    expect(w.trickScore).toBe(0);
  });

  it('ignores ollie mid-air (no double-jump)', () => {
    const w = step(createWorld(LANES, 3), JUMP, LANES);
    const vy1 = w.board.vy;
    const w2 = step(w, JUMP, LANES);
    expect(w2.board.vy).toBeLessThan(vy1); // only gravity, no re-impulse
  });
});

describe('lane mode — scoring', () => {
  it('score = floor(distance), trickScore stays 0', () => {
    const w = run(createWorld(LANES, 5), LANES, Array(20).fill(NO_INPUT));
    expect(w.status).toBe('rolling');
    expect(w.trickScore).toBe(0);
    expect(w.score).toBe(Math.floor(w.distance));
  });

  it('keeps score = floor(distance) even after jumps', () => {
    let w = createWorld(LANES, 11);
    for (let i = 0; i < 300 && w.status !== 'bailed'; i++) {
      w = step(w, i % 20 === 0 ? JUMP : NO_INPUT, LANES);
    }
    expect(w.score).toBe(Math.floor(w.distance));
    expect(w.trickScore).toBe(0);
  });
});

describe('classic mode — unchanged by the lane work', () => {
  it('classic worlds never gain lane/lateral fields through step', () => {
    let w = createWorld(DEFAULT_CONFIG, 42);
    for (let i = 0; i < 50; i++) w = step(w, { ollie: i % 10 === 0 }, DEFAULT_CONFIG);
    expect(w.lane).toBeUndefined();
    expect(w.lateral).toBeUndefined();
    for (const o of w.obstacles) expect(o.lane).toBeUndefined();
  });

  it('undefined mode behaves exactly like classic', () => {
    const noMode: SimConfig = { ...DEFAULT_CONFIG };
    delete (noMode as { mode?: unknown }).mode;
    const drive = (config: SimConfig): WorldState => {
      let w = createWorld(config, 314);
      for (let i = 0; i < 100; i++) w = step(w, { ollie: i % 8 === 0 }, config);
      return w;
    };
    expect(drive(noMode)).toEqual(drive(DEFAULT_CONFIG));
  });
});
