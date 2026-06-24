/**
 * SFX layer — procedural one-shot voices for game events.
 *
 * Each function schedules a short cluster of synth voices onto a shared
 * destination (a master gain node). They are pure scheduling calls: fire and
 * forget, no state, safe to call rapidly. Sound design here is placeholder —
 * see REVIEW_QUEUE for the Director's taste pass.
 */

import { type AudioContextLike, tone, noiseBurst } from './synth.js';

/** Ollie: a rising "whip" — upward pitch glide plus a short scrape of grit. */
export function ollie(ctx: AudioContextLike, out: AudioNode): void {
  const t = ctx.currentTime;
  tone(ctx, out, {
    type: 'triangle',
    freq: 220,
    glideTo: 660,
    peak: 0.5,
    attack: 0.005,
    decay: 0.18,
    start: t,
  });
  // Griptape scrape on the pop.
  noiseBurst(ctx, out, {
    seconds: 0.12,
    filter: 'highpass',
    cutoff: 2000,
    peak: 0.25,
    attack: 0.002,
    decay: 0.1,
    start: t,
  });
}

/** Land: a low "slap" thud plus a brief wheel-roll noise. */
export function land(ctx: AudioContextLike, out: AudioNode): void {
  const t = ctx.currentTime;
  tone(ctx, out, {
    type: 'sine',
    freq: 180,
    glideTo: 70,
    peak: 0.6,
    attack: 0.002,
    decay: 0.16,
    start: t,
  });
  noiseBurst(ctx, out, {
    seconds: 0.1,
    filter: 'lowpass',
    cutoff: 1200,
    peak: 0.3,
    attack: 0.001,
    decay: 0.08,
    start: t,
  });
}

/**
 * Trick flourish: a short two-note arpeggio. The optional trick name (from the
 * core's scoring) seeds a tiny pitch offset so different tricks feel distinct,
 * without a per-trick sound bank.
 */
export function trick(ctx: AudioContextLike, out: AudioNode, name?: string): void {
  const t = ctx.currentTime;
  const offset = name ? (hash(name) % 5) * 40 : 0;
  const base = 520 + offset;
  tone(ctx, out, {
    type: 'square',
    freq: base,
    peak: 0.22,
    attack: 0.004,
    decay: 0.1,
    start: t,
  });
  tone(ctx, out, {
    type: 'square',
    freq: base * 1.5,
    peak: 0.18,
    attack: 0.004,
    decay: 0.12,
    start: t + 0.08,
  });
}

/** Bail: a harsh descending crash — sawtooth fall plus a noisy splat. */
export function bail(ctx: AudioContextLike, out: AudioNode): void {
  const t = ctx.currentTime;
  tone(ctx, out, {
    type: 'sawtooth',
    freq: 400,
    glideTo: 50,
    peak: 0.55,
    attack: 0.002,
    decay: 0.45,
    start: t,
  });
  noiseBurst(ctx, out, {
    seconds: 0.4,
    filter: 'bandpass',
    cutoff: 900,
    q: 0.7,
    peak: 0.4,
    attack: 0.001,
    decay: 0.38,
    start: t,
  });
}

/** Tiny deterministic string hash → non-negative int. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
