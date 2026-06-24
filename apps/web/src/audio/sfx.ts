/**
 * SFX layer — procedural one-shot voices for game events.
 *
 * Each function schedules a short cluster of synth voices onto a shared
 * destination (a master gain node). They are pure scheduling calls: fire and
 * forget, no state, safe to call rapidly. Sound design here is placeholder —
 * see REVIEW_QUEUE for the Director's taste pass.
 */

import { type AudioContextLike, tone, noiseBurst } from './synth.js';

/**
 * Ollie: a soft air "whoosh" — as if you jumped. Primarily filtered noise with
 * a lowpass that sweeps upward then is damped by the short decay (a gentle
 * rising "whoomp" of moving air), under a faint low body tone. Deliberately
 * quiet and dark: no bright/piercing highs.
 */
export function ollie(ctx: AudioContextLike, out: AudioNode): void {
  const t = ctx.currentTime;
  // Faint low body — felt more than heard, gives the whoosh a little weight.
  tone(ctx, out, {
    type: 'sine',
    freq: 150,
    glideTo: 90,
    peak: 0.12,
    attack: 0.01,
    decay: 0.18,
    start: t,
  });
  // Air-whoosh: lowpass noise sweeping up (~400→1100Hz) then fading. Soft and
  // dark — the dominant voice, but well below the old piercing high tone.
  noiseBurst(ctx, out, {
    seconds: 0.22,
    filter: 'lowpass',
    cutoff: 400,
    sweepTo: 1100,
    q: 0.5,
    peak: 0.18,
    attack: 0.04,
    decay: 0.16,
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
