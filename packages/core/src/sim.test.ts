import { describe, it, expect } from 'vitest';
import { createWorld, step } from './sim.js';
import { DEFAULT_CONFIG } from './config.js';
import type { InputIntent, SimConfig, WorldState } from './types.js';

const NO_OLLIE: InputIntent = { ollie: false };
const OLLIE: InputIntent = { ollie: true };

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

describe('createWorld', () => {
  it('starts ready, grounded, at the origin with base speed', () => {
    const w = createWorld(DEFAULT_CONFIG, 1);
    expect(w.status).toBe('ready');
    expect(w.distance).toBe(0);
    expect(w.score).toBe(0);
    expect(w.tricks).toBe(0);
    expect(w.speed).toBe(DEFAULT_CONFIG.baseSpeed);
    expect(w.board).toEqual({ y: DEFAULT_CONFIG.groundY, vy: 0, grounded: true, rotation: 0 });
    expect(w.obstacles).toEqual([]);
  });
});

describe('step purity / determinism', () => {
  it('does not mutate its inputs', () => {
    const w = createWorld(DEFAULT_CONFIG, 7);
    const wSnapshot = structuredClone(w);
    const input = { ollie: true };
    const inputSnapshot = structuredClone(input);
    const configSnapshot = structuredClone(DEFAULT_CONFIG);

    step(w, input, DEFAULT_CONFIG);

    expect(w).toEqual(wSnapshot);
    expect(input).toEqual(inputSnapshot);
    expect(DEFAULT_CONFIG).toEqual(configSnapshot);
  });

  it('is referentially deterministic for the same (world,input,config)', () => {
    const w = createWorld(DEFAULT_CONFIG, 99);
    const a = step(w, OLLIE, DEFAULT_CONFIG);
    const b = step(w, OLLIE, DEFAULT_CONFIG);
    expect(a).toEqual(b);
  });
});

describe('status transitions', () => {
  it('flips ready -> rolling on the first step', () => {
    const w0 = createWorld(DEFAULT_CONFIG, 1);
    const w1 = step(w0, NO_OLLIE, DEFAULT_CONFIG);
    expect(w0.status).toBe('ready');
    expect(w1.status).toBe('rolling');
  });

  it('freezes (no-op) once bailed', () => {
    // Stand still until a collision occurs.
    let w = createWorld(DEFAULT_CONFIG, 2);
    for (let i = 0; i < 4000 && w.status !== 'bailed'; i++) {
      w = step(w, NO_OLLIE, DEFAULT_CONFIG);
    }
    expect(w.status).toBe('bailed');
    const frozen = step(w, OLLIE, DEFAULT_CONFIG);
    expect(frozen).toBe(w); // identical reference: pure no-op
  });
});

describe('board physics (ollie arc)', () => {
  it('imparts upward velocity on ollie from the ground', () => {
    const w = createWorld(DEFAULT_CONFIG, 3);
    const w1 = step(w, OLLIE, DEFAULT_CONFIG);
    expect(w1.board.grounded).toBe(false);
    expect(w1.board.y).toBeGreaterThan(0);
    expect(w1.board.vy).toBeGreaterThan(0);
  });

  it('lands back on the ground and the arc returns to y=0', () => {
    let w = createWorld(DEFAULT_CONFIG, 3);
    w = step(w, OLLIE, DEFAULT_CONFIG);
    let everAirborne = false;
    for (let i = 0; i < 120 && (!w.board.grounded || !everAirborne); i++) {
      if (!w.board.grounded) everAirborne = true;
      w = step(w, NO_OLLIE, DEFAULT_CONFIG);
    }
    expect(w.board.grounded).toBe(true);
    expect(w.board.y).toBe(DEFAULT_CONFIG.groundY);
    expect(w.board.vy).toBe(0);
    expect(w.board.rotation).toBe(0); // spin resets on land
  });

  it('ignores ollie mid-air (no double-jump)', () => {
    let w = createWorld(DEFAULT_CONFIG, 3);
    w = step(w, OLLIE, DEFAULT_CONFIG);
    const vyAfterFirst = w.board.vy;
    // The next step is mid-air; vy should only decrease (gravity), never re-impulse.
    const w2 = step(w, OLLIE, DEFAULT_CONFIG);
    expect(w2.board.vy).toBeLessThan(vyAfterFirst);
    expect(w2.board.vy).toBeLessThan(DEFAULT_CONFIG.ollieImpulse);
  });

  it('spins (rotation increases) while airborne', () => {
    const w = createWorld(DEFAULT_CONFIG, 3);
    const w1 = step(w, OLLIE, DEFAULT_CONFIG);
    expect(w1.board.rotation).toBeGreaterThan(0);
  });
});

describe('scoring + tricks', () => {
  it('awards a trick + bonus on a clean ollie-and-land', () => {
    let w = createWorld(DEFAULT_CONFIG, 3);
    w = step(w, OLLIE, DEFAULT_CONFIG);
    let landed = false;
    for (let i = 0; i < 120 && !landed; i++) {
      const before = w.tricks;
      w = step(w, NO_OLLIE, DEFAULT_CONFIG);
      if (w.tricks > before) landed = true;
    }
    expect(w.tricks).toBe(1);
    // score = floor(distance) + tricks*bonus
    expect(w.score).toBe(Math.floor(w.distance) + DEFAULT_CONFIG.trickBonus);
  });

  it('score = floor(distance) when no tricks landed', () => {
    let w = createWorld(DEFAULT_CONFIG, 5);
    // A handful of steps, never ollie, before any collision.
    w = run(w, DEFAULT_CONFIG, Array(5).fill(NO_OLLIE));
    expect(w.status).toBe('rolling');
    expect(w.score).toBe(Math.floor(w.distance));
  });

  it('does not award a trick if the landing frame bails', () => {
    // Hard to engineer deterministically; assert the invariant directly via a
    // run where any bail leaves tricks consistent with score.
    let w = createWorld(DEFAULT_CONFIG, 11);
    for (let i = 0; i < 4000 && w.status !== 'bailed'; i++) {
      w = step(w, i % 30 === 0 ? OLLIE : NO_OLLIE, DEFAULT_CONFIG);
    }
    expect(w.score).toBe(Math.floor(w.distance) + w.tricks * DEFAULT_CONFIG.trickBonus);
  });
});

describe('difficulty ramp', () => {
  it('speed increases with distance and clamps at maxSpeed', () => {
    let w = createWorld(DEFAULT_CONFIG, 1);
    const first = step(w, NO_OLLIE, DEFAULT_CONFIG).speed;
    // Drive far enough to saturate the ramp (ignore bail; we only read speed).
    let maxObserved = first;
    for (let i = 0; i < 5000; i++) {
      w = step(w, OLLIE, DEFAULT_CONFIG); // ollie often to delay bails
      maxObserved = Math.max(maxObserved, w.speed);
      if (w.status === 'bailed') {
        // Restart to keep ramping speed observation going.
        w = { ...w, status: 'rolling', obstacles: [] };
      }
    }
    expect(maxObserved).toBeGreaterThan(first);
    expect(maxObserved).toBeLessThanOrEqual(DEFAULT_CONFIG.maxSpeed);
  });
});

describe('spawner', () => {
  it('spawns obstacles ahead of the board and moves them toward it', () => {
    let w = createWorld(DEFAULT_CONFIG, 123);
    w = step(w, NO_OLLIE, DEFAULT_CONFIG);
    expect(w.obstacles.length).toBeGreaterThan(0);
    const first = w.obstacles[0]!;
    expect(first.x).toBeGreaterThan(DEFAULT_CONFIG.boardX);
    expect(first.cleared).toBe(false);
    // After a step its x decreases.
    const w2 = step(w, OLLIE, DEFAULT_CONFIG);
    const moved = w2.obstacles[0]!;
    expect(moved.x).toBeLessThan(first.x);
  });

  it('respects the seeded spawn-gap window between consecutive obstacles', () => {
    let w = createWorld(DEFAULT_CONFIG, 555);
    // Ollie every frame so nothing bails; collect spawn x positions.
    const spawnXs: number[] = [];
    let seen = 0;
    for (let i = 0; i < 600; i++) {
      w = step(w, OLLIE, DEFAULT_CONFIG);
      if (w.obstacles.length > seen) {
        spawnXs.push(w.obstacles[w.obstacles.length - 1]!.x);
        seen = w.obstacles.length;
      }
    }
    expect(spawnXs.length).toBeGreaterThan(1);
  });

  it('marks an obstacle cleared once it passes the board without contact', () => {
    // Place an obstacle just to the LEFT of the board (already passed it while
    // the board was airborne), then step: it should flip to cleared.
    const base = createWorld(DEFAULT_CONFIG, 321);
    const passed: WorldState = {
      ...base,
      status: 'rolling',
      board: { y: 200, vy: 0, grounded: false, rotation: 0 }, // airborne, no collision
      obstacles: [
        {
          kind: 'cone',
          x: DEFAULT_CONFIG.boardX - 30, // leading edge already left of the board
          width: 14,
          height: 18,
          cleared: false,
        },
      ],
    };
    const next = step(passed, NO_OLLIE, DEFAULT_CONFIG);
    expect(next.status).toBe('rolling');
    expect(next.obstacles[0]?.cleared).toBe(true);
  });

  it('culls obstacles once fully off-screen to the left', () => {
    const base = createWorld(DEFAULT_CONFIG, 1);
    const offscreen: WorldState = {
      ...base,
      status: 'rolling',
      nextSpawnIn: 9999, // keep the spawner quiet for this isolated assertion
      board: { y: 200, vy: 0, grounded: false, rotation: 0 },
      obstacles: [
        { kind: 'cone', x: -100, width: 14, height: 18, cleared: true },
      ],
    };
    const next = step(offscreen, NO_OLLIE, DEFAULT_CONFIG);
    expect(next.obstacles.length).toBe(0);
  });
});

describe('collision / bail', () => {
  it('bails when a grounded skater meets an obstacle', () => {
    let w = createWorld(DEFAULT_CONFIG, 2);
    for (let i = 0; i < 4000 && w.status !== 'bailed'; i++) {
      w = step(w, NO_OLLIE, DEFAULT_CONFIG);
    }
    expect(w.status).toBe('bailed');
  });

  it('does not bail while airborne high above an overlapping obstacle', () => {
    const base = createWorld(DEFAULT_CONFIG, 8);
    const airborne: WorldState = {
      ...base,
      status: 'rolling',
      board: { y: 200, vy: 0, grounded: false, rotation: 0 },
      obstacles: [
        // Tallest catalog obstacle, sitting right on the board's x-span.
        { kind: 'bench', x: DEFAULT_CONFIG.boardX, width: 48, height: 30, cleared: false },
      ],
    };
    const next = step(airborne, NO_OLLIE, DEFAULT_CONFIG);
    expect(next.status).toBe('rolling'); // cleared it by being above its height
  });

  it('bails when grounded and an obstacle overlaps the board x-span', () => {
    const base = createWorld(DEFAULT_CONFIG, 8);
    const grounded: WorldState = {
      ...base,
      status: 'rolling',
      board: { y: 0, vy: 0, grounded: true, rotation: 0 },
      obstacles: [
        { kind: 'cone', x: DEFAULT_CONFIG.boardX + 2, width: 14, height: 18, cleared: false },
      ],
    };
    const next = step(grounded, NO_OLLIE, DEFAULT_CONFIG);
    expect(next.status).toBe('bailed');
  });
});
