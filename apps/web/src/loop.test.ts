import { describe, it, expect } from 'vitest';
import { createWorld, DEFAULT_CONFIG } from '@skate/core';
import { advance } from './loop.js';

const config = DEFAULT_CONFIG;
const stepMs = config.dt * 1000;

describe('advance (fixed-timestep accumulator)', () => {
  it('runs the whole-number of steps that fit, carrying the remainder', () => {
    const w0 = createWorld(config, 1);
    // 2.5 steps' worth of time → 2 steps run, 0.5 step carried.
    const { world, carryMs } = advance(w0, config, stepMs * 2.5, 0, false);
    expect(world.time).toBeCloseTo(config.dt * 2, 6);
    expect(carryMs).toBeCloseTo(stepMs * 0.5, 6);
  });

  it('is frame-rate independent: many small frames == one big frame', () => {
    const seed = 7;
    // Stay within the single-frame spiral clamp (250ms) so the big frame runs
    // the same number of steps the small frames accumulate to.
    const steps = 10;
    const total = stepMs * steps;

    const big = advance(createWorld(config, seed), config, total, 0, false).world;

    let w = createWorld(config, seed);
    let carry = 0;
    for (let i = 0; i < steps; i++) {
      const r = advance(w, config, stepMs, carry, false);
      w = r.world;
      carry = r.carryMs;
    }
    expect(w.distance).toBeCloseTo(big.distance, 6);
    expect(w.score).toBe(big.score);
  });

  it('clamps a huge delta so a pause cannot spiral', () => {
    const w0 = createWorld(config, 1);
    const huge = advance(w0, config, 10_000, 0, false);
    const oneFrame = advance(w0, config, 250, 0, false);
    expect(huge.world.time).toBeCloseTo(oneFrame.world.time, 6);
  });

  it('applies an ollie only to the first sub-step (one tap = one ollie)', () => {
    const grounded = createWorld(config, 3);
    // A frame with several steps + an ollie: the board should leave the ground.
    const r = advance(grounded, config, stepMs * 5, 0, true);
    expect(r.world.board.grounded).toBe(false);
  });
});
