/**
 * Synth helpers — small, dependency-free Web Audio building blocks.
 *
 * Everything here is procedural: oscillators, a one-shot noise buffer source,
 * and gain/filter envelopes. No audio asset files, no network. These helpers
 * take an `AudioContext` (the real browser global, or a test stub structurally
 * compatible with the slice of the API we use) and a destination node, schedule
 * a short voice, and return so the caller can fire-and-forget.
 *
 * The whole module is written against the *structural* shape of the Web Audio
 * API we touch, so vitest (Node, no DOM) can drive it with a hand-rolled stub.
 */

/**
 * The narrow slice of `AudioContext` this engine actually uses. Declaring it
 * structurally (rather than depending on the DOM `AudioContext` class) is what
 * lets tests inject a stub — Node/vitest has no real AudioContext.
 *
 * The real browser `AudioContext` is assignable to this, so callers can pass
 * `() => new AudioContext()` directly.
 */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: AudioNode;
  readonly sampleRate: number;
  /** 'suspended' before a user gesture (autoplay policy); 'running' after. */
  readonly state: AudioContextState;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
  createBiquadFilter(): BiquadFilterNode;
  createBufferSource(): AudioBufferSourceNode;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
  resume(): Promise<void>;
}

export type OscShape = OscillatorType;

/** Apply a percussive attack→decay envelope to a gain node's `gain` param. */
export function envelope(
  gain: GainNode,
  ctx: AudioContextLike,
  opts: { peak: number; attack: number; decay: number; start?: number },
): { startAt: number; stopAt: number } {
  const start = opts.start ?? ctx.currentTime;
  const peakAt = start + Math.max(opts.attack, 0);
  const endAt = peakAt + Math.max(opts.decay, 0.001);
  const g = gain.gain;
  // Start from ~0 and ramp; exponential ramps can't hit 0 so we floor it.
  g.setValueAtTime(0.0001, start);
  g.linearRampToValueAtTime(Math.max(opts.peak, 0.0001), peakAt);
  g.exponentialRampToValueAtTime(0.0001, endAt);
  return { startAt: start, stopAt: endAt };
}

/**
 * Schedule a single oscillator voice (osc → gain → out) with an AD envelope and
 * an optional pitch glide. Starts and stops the oscillator so it self-cleans.
 */
export function tone(
  ctx: AudioContextLike,
  out: AudioNode,
  opts: {
    type: OscShape;
    freq: number;
    /** Optional target frequency to glide toward over the voice's life. */
    glideTo?: number;
    peak: number;
    attack: number;
    decay: number;
    start?: number;
  },
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type;

  const start = opts.start ?? ctx.currentTime;
  const { stopAt } = envelope(gain, ctx, {
    peak: opts.peak,
    attack: opts.attack,
    decay: opts.decay,
    start,
  });

  osc.frequency.setValueAtTime(opts.freq, start);
  if (opts.glideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(opts.glideTo, 0.0001),
      stopAt,
    );
  }

  osc.connect(gain);
  gain.connect(out);
  osc.start(start);
  osc.stop(stopAt);
}

/**
 * Build a buffer of white noise. Cached length is short; callers loop it for
 * ambience or play it once for percussive hits. Guards a 0/NaN sampleRate from
 * a degenerate stub.
 */
export function noiseBuffer(ctx: AudioContextLike, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate > 0 ? ctx.sampleRate : 44100;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * Schedule a one-shot filtered-noise burst (noise → bandpass/lowpass → gain →
 * out) with an AD envelope. Good for grit: ollie scrape, landing slap, bail.
 */
export function noiseBurst(
  ctx: AudioContextLike,
  out: AudioNode,
  opts: {
    seconds: number;
    filter: BiquadFilterType;
    cutoff: number;
    q?: number;
    peak: number;
    attack: number;
    decay: number;
    start?: number;
  },
): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, opts.seconds);

  const filter = ctx.createBiquadFilter();
  filter.type = opts.filter;
  const start = opts.start ?? ctx.currentTime;
  filter.frequency.setValueAtTime(opts.cutoff, start);
  if (opts.q !== undefined) filter.Q.setValueAtTime(opts.q, start);

  const gain = ctx.createGain();
  const { stopAt } = envelope(gain, ctx, {
    peak: opts.peak,
    attack: opts.attack,
    decay: opts.decay,
    start,
  });

  src.connect(filter);
  filter.connect(gain);
  gain.connect(out);
  src.start(start);
  src.stop(stopAt);
}
