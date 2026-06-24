/**
 * Fixed-timestep accumulator (pipeline constraint #4: the sim advances by
 * `config.dt`, decoupled from the render frame rate, so runs are reproducible).
 *
 * `advance` is a PURE function over (world, elapsed, accumulator): it folds real
 * elapsed milliseconds into a whole number of fixed `config.dt` steps and
 * returns the new world plus the leftover time to carry into the next frame.
 * Keeping it pure makes the integration testable without a browser.
 */

import { step, type InputIntent, type SimConfig, type WorldState } from '@skate/core';

/** Clamp a single frame's delta so a tab-switch / GC pause can't spiral. */
const MAX_FRAME_MS = 250;

export interface AdvanceResult {
  readonly world: WorldState;
  /** Leftover sub-step time to carry into the next frame. */
  readonly carryMs: number;
}

/**
 * Fold `elapsedMs` of real time (plus any carried remainder) into fixed steps.
 * The EDGE parts of `intent` — `ollie` (the takeoff trigger) and `gesture` (the
 * trick) — are applied to the FIRST sub-step only, so one press = one ollie/
 * gesture regardless of how many steps a frame runs. The CONTINUOUS part,
 * `jumpHeld` (jump button still down → sustain a higher jump), is threaded to
 * EVERY sub-step, matching the core's variable-jump contract.
 */
export function advance(
  world: WorldState,
  config: SimConfig,
  elapsedMs: number,
  carryMs: number,
  intent: InputIntent,
): AdvanceResult {
  const stepMs = config.dt * 1000;
  let acc = carryMs + Math.min(Math.max(elapsedMs, 0), MAX_FRAME_MS);
  let w = world;
  const jumpHeld = intent.jumpHeld ?? false;
  // First sub-step carries the edge intent; the rest only the continuous hold.
  let pending: InputIntent = intent;
  const sustain: InputIntent = { ollie: false, jumpHeld };
  while (acc >= stepMs) {
    w = step(w, pending, config);
    pending = sustain;
    acc -= stepMs;
  }
  return { world: w, carryMs: acc };
}
