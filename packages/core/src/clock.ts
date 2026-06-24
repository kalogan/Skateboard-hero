/**
 * Clock abstraction (pipeline §5: "inject the clock; never call wall-clock").
 *
 * The core sim itself is driven by a FIXED timestep from `SimConfig.dt`, so it
 * needs no clock at all — that is what makes it replayable. The `Clock`
 * interface exists for the layer that converts real elapsed time into a number
 * of fixed steps (the app's game loop, Slice 3). The app supplies a real clock
 * backed by `performance.now`; tests and tooling use `ManualClock`.
 */

export interface Clock {
  /** Monotonic time in milliseconds. */
  now(): number;
}

/** A deterministic clock you advance by hand. For tests and headless replay. */
export class ManualClock implements Clock {
  #ms: number;

  constructor(startMs = 0) {
    this.#ms = startMs;
  }

  now(): number {
    return this.#ms;
  }

  /** Advance the clock by `ms` milliseconds. */
  advance(ms: number): void {
    this.#ms += ms;
  }
}
