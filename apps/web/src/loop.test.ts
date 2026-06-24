import { describe, it, expect } from 'vitest';
import { createWorld, DEFAULT_CONFIG, type InputIntent } from '@skate/core';
import { advance } from './loop.js';

const config = DEFAULT_CONFIG;
const stepMs = config.dt * 1000;

const idle: InputIntent = { ollie: false };
const pop: InputIntent = { ollie: true };

describe('advance (fixed-timestep accumulator)', () => {
  it('runs the whole-number of steps that fit, carrying the remainder', () => {
    const w0 = createWorld(config, 1);
    // 2.5 steps' worth of time → 2 steps run, 0.5 step carried.
    const { world, carryMs } = advance(w0, config, stepMs * 2.5, 0, idle);
    expect(world.time).toBeCloseTo(config.dt * 2, 6);
    expect(carryMs).toBeCloseTo(stepMs * 0.5, 6);
  });

  it('is frame-rate independent: many small frames == one big frame', () => {
    const seed = 7;
    // Stay within the single-frame spiral clamp (250ms) so the big frame runs
    // the same number of steps the small frames accumulate to.
    const steps = 10;
    const total = stepMs * steps;

    const big = advance(createWorld(config, seed), config, total, 0, idle).world;

    let w = createWorld(config, seed);
    let carry = 0;
    for (let i = 0; i < steps; i++) {
      const r = advance(w, config, stepMs, carry, idle);
      w = r.world;
      carry = r.carryMs;
    }
    expect(w.distance).toBeCloseTo(big.distance, 6);
    expect(w.score).toBe(big.score);
  });

  it('clamps a huge delta so a pause cannot spiral', () => {
    const w0 = createWorld(config, 1);
    const huge = advance(w0, config, 10_000, 0, idle);
    const oneFrame = advance(w0, config, 250, 0, idle);
    expect(huge.world.time).toBeCloseTo(oneFrame.world.time, 6);
  });

  it('applies an ollie only to the first sub-step (one tap = one ollie)', () => {
    const grounded = createWorld(config, 3);
    // A frame with several steps + an ollie: the board should leave the ground.
    const r = advance(grounded, config, stepMs * 5, 0, pop);
    expect(r.world.board.grounded).toBe(false);
  });

  it('threads the takeoff gesture to the first sub-step (flick → directional trick)', () => {
    const grounded = createWorld(config, 3);
    // A left flick on take-off selects the kickflip (catalog: left → kickflip).
    const r = advance(grounded, config, stepMs * 5, 0, { ollie: true, gesture: 'left' });
    expect(r.world.board.grounded).toBe(false);
    expect(r.world.board.trick).toBe('kickflip');
  });

  it('a plain pop with no gesture selects the tap trick (ollie)', () => {
    const grounded = createWorld(config, 3);
    const r = advance(grounded, config, stepMs * 5, 0, pop);
    expect(r.world.board.trick).toBe('ollie');
  });

  it('applies the intent to the first sub-step only (one pop per frame)', () => {
    // The intent (ollie + gesture) must flow ONLY through the first sub-step;
    // later sub-steps in the same frame get a neutral intent. A single-step
    // frame and a multi-step frame fed the same pop both leave the ground once
    // — they do not double-pop. Compare a 1-step pop vs a 5-step pop: the
    // multi-step run simply integrates more gravity, never re-launching.
    const grounded = createWorld(config, 3);
    const oneStep = advance(grounded, config, stepMs, 0, pop).world;
    const fiveSteps = advance(grounded, config, stepMs * 5, 0, pop).world;
    expect(oneStep.board.grounded).toBe(false);
    expect(fiveSteps.board.grounded).toBe(false);
    // Both popped from the same first sub-step → identical launch velocity sign;
    // the longer frame has fallen further (vy decreased under gravity), proving
    // no second pop reset it back to the impulse.
    expect(fiveSteps.board.vy).toBeLessThan(oneStep.board.vy);
  });
});
