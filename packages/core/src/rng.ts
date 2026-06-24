/**
 * Deterministic, seeded PRNG (mulberry32) expressed as PURE functions over an
 * integer state. No `Math.random`, no globals — this is the only randomness the
 * sim is allowed to use, and because the state is threaded explicitly, a run is
 * perfectly replayable from its seed (see the golden fixture).
 *
 * `Math.imul` and bit-ops are deterministic and allowed; `Math.random` is not
 * (the arch-guard lint rule enforces this for `packages/core`).
 */

import type { RngState } from './types.js';

/** Normalize an arbitrary seed into a valid 32-bit RNG state. */
export function seedRng(seed: number): RngState {
  return seed >>> 0;
}

/**
 * Advance the state and produce a float in [0, 1).
 * Returns the value and the NEXT state — callers thread the state forward.
 */
export function nextFloat(state: RngState): readonly [value: number, next: RngState] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

/** A float in [min, max). */
export function nextRange(
  state: RngState,
  min: number,
  max: number,
): readonly [value: number, next: RngState] {
  const [v, next] = nextFloat(state);
  return [min + v * (max - min), next];
}

/** An integer in [min, max] (inclusive). */
export function nextInt(
  state: RngState,
  min: number,
  max: number,
): readonly [value: number, next: RngState] {
  const [v, next] = nextFloat(state);
  return [min + Math.floor(v * (max - min + 1)), next];
}

/**
 * Weighted pick from a list. Returns the chosen index and the next state.
 * `weights` must be non-empty with all entries > 0.
 */
export function nextWeightedIndex(
  state: RngState,
  weights: readonly number[],
): readonly [index: number, next: RngState] {
  let total = 0;
  for (const w of weights) total += w;
  const [v, next] = nextFloat(state);
  let threshold = v * total;
  for (let i = 0; i < weights.length; i++) {
    threshold -= weights[i] as number;
    if (threshold < 0) return [i, next];
  }
  return [weights.length - 1, next];
}
