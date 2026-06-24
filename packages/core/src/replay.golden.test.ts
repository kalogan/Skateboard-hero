/**
 * GOLDEN REPLAY FIXTURE — the determinism proof (pipeline constraint #4/#5).
 *
 * Runs the sim for 600 fixed steps from a pinned seed under a deterministic,
 * obstacle-aware "pilot" input policy, then asserts the trajectory at fixed
 * checkpoints against a committed inline snapshot. Three guarantees:
 *
 *  1. The committed run reproduces this exact trajectory (snapshot match).
 *  2. Re-running the SAME seed yields byte-identical world states.
 *  3. A DIFFERENT seed yields a different trajectory (the RNG actually drives it).
 *
 * If a physics/spawner/scoring change shifts behaviour, the inline snapshot
 * here will fail loudly — regenerate it intentionally, never blindly.
 */

import { describe, it, expect } from 'vitest';
import { createWorld, step } from './sim.js';
import { DEFAULT_CONFIG } from './config.js';
import type { InputIntent, WorldState } from './types.js';

const SEED = 0xc0ffee;
const STEPS = 600;
/** Ollie when the nearest unpassed obstacle enters this lead distance. */
const TRIGGER = 100;

/**
 * Deterministic input policy: ollie when grounded and the nearest obstacle that
 * still overlaps-or-leads the board is within the trigger window. Pure function
 * of `WorldState` — no clock, no randomness — so the whole replay is fixed.
 */
function pilot(world: WorldState): InputIntent {
  let nearest = Infinity;
  for (const o of world.obstacles) {
    if (o.x + o.width < DEFAULT_CONFIG.boardX) continue; // already behind the board
    const lead = o.x - DEFAULT_CONFIG.boardX;
    if (lead < nearest) nearest = lead;
  }
  return { ollie: world.board.grounded && nearest > 0 && nearest < TRIGGER };
}

/** A compact, snapshot-friendly digest of a world (floats rounded for stability). */
function digest(w: WorldState) {
  return {
    status: w.status,
    time: round(w.time),
    distance: round(w.distance),
    speed: round(w.speed),
    score: w.score,
    tricks: w.tricks,
    boardY: round(w.board.y),
    boardVy: round(w.board.vy),
    rotation: round(w.board.rotation),
    grounded: w.board.grounded,
    obstacles: w.obstacles.length,
    rng: w.rng,
    nextSpawnIn: round(w.nextSpawnIn),
  };
}

function round(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** Run the full replay, returning checkpoint digests + the final world. */
function replay(seed: number): {
  checkpoints: Record<number, ReturnType<typeof digest>>;
  final: WorldState;
} {
  let w = createWorld(DEFAULT_CONFIG, seed);
  const checkpoints: Record<number, ReturnType<typeof digest>> = {};
  for (let i = 0; i < STEPS; i++) {
    w = step(w, pilot(w), DEFAULT_CONFIG);
    if (i === 0 || i === 99 || i === 299 || i === 599) {
      checkpoints[i + 1] = digest(w);
    }
  }
  return { checkpoints, final: w };
}

describe('golden replay (determinism proof)', () => {
  it('matches the committed trajectory snapshot at fixed checkpoints', () => {
    const { checkpoints } = replay(SEED);
    expect(checkpoints).toEqual({
      1: {
        status: 'rolling',
        time: 0.0167,
        distance: 5.3333,
        speed: 320,
        score: 5,
        tricks: 0,
        boardY: 0,
        boardVy: 0,
        rotation: 0,
        grounded: true,
        obstacles: 1,
        rng: 3675780056,
        nextSpawnIn: 427.8553,
      },
      100: {
        status: 'rolling',
        time: 1.6667,
        distance: 542.2299,
        speed: 330.7344,
        score: 542,
        tricks: 0,
        boardY: 106.3333,
        boardVy: -246.6667,
        rotation: 3.0369,
        grounded: false,
        obstacles: 2,
        rng: 3043944386,
        nextSpawnIn: 343.2506,
      },
      300: {
        status: 'rolling',
        time: 5,
        distance: 1682.44,
        speed: 353.531,
        score: 2132,
        tricks: 3,
        boardY: 119,
        boardVy: 153.3333,
        rotation: 1.7802,
        grounded: false,
        obstacles: 2,
        rng: 1148437376,
        nextSpawnIn: 285.358,
      },
      600: {
        status: 'rolling',
        time: 10,
        distance: 3541.7929,
        speed: 390.7056,
        score: 4741,
        tricks: 8,
        boardY: 123.4444,
        boardVy: -13.3333,
        rotation: 2.3038,
        grounded: false,
        obstacles: 2,
        rng: 2284226322,
        nextSpawnIn: 278.9967,
      },
    });
  });

  it('reproduces byte-identical results for the same seed', () => {
    const a = replay(SEED);
    const b = replay(SEED);
    expect(b.checkpoints).toEqual(a.checkpoints);
    expect(b.final).toEqual(a.final);
  });

  it('produces a different trajectory for a different seed', () => {
    const same = replay(SEED).checkpoints;
    const other = replay(SEED + 1).checkpoints;
    // The RNG drives spawns, so the trajectories must diverge.
    expect(other).not.toEqual(same);
  });

  it('survives the full pinned run (the pilot policy clears every obstacle)', () => {
    const { final } = replay(SEED);
    expect(final.status).toBe('rolling');
    expect(final.score).toBeGreaterThan(0);
  });
});
