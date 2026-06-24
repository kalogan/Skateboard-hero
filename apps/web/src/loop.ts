/**
 * Fixed-timestep accumulator (pipeline constraint #4: the sim advances by
 * `config.dt`, decoupled from the render frame rate, so runs are reproducible).
 *
 * `advance` is a PURE function over (world, elapsed, accumulator): it folds real
 * elapsed milliseconds into a whole number of fixed `config.dt` steps and
 * returns the new world plus the leftover time to carry into the next frame.
 * Keeping it pure makes the integration testable without a browser.
 */

import { step, type SimConfig, type WorldState } from '@skate/core';

/** Clamp a single frame's delta so a tab-switch / GC pause can't spiral. */
const MAX_FRAME_MS = 250;

export interface AdvanceResult {
  readonly world: WorldState;
  /** Leftover sub-step time to carry into the next frame. */
  readonly carryMs: number;
}

/**
 * Fold `elapsedMs` of real time (plus any carried remainder) into fixed steps.
 * `ollie` is applied to the FIRST sub-step only, so one tap = one ollie intent
 * regardless of how many steps a frame runs.
 */
export function advance(
  world: WorldState,
  config: SimConfig,
  elapsedMs: number,
  carryMs: number,
  ollie: boolean,
): AdvanceResult {
  const stepMs = config.dt * 1000;
  let acc = carryMs + Math.min(Math.max(elapsedMs, 0), MAX_FRAME_MS);
  let w = world;
  let pendingOllie = ollie;
  while (acc >= stepMs) {
    w = step(w, { ollie: pendingOllie }, config);
    pendingOllie = false;
    acc -= stepMs;
  }
  return { world: w, carryMs: acc };
}
