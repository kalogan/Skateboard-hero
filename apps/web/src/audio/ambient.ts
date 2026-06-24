/**
 * Ambient layer — a sustained background bed that loops until stopped.
 *
 * Procedural drone: a couple of detuned low oscillators plus a filtered,
 * looping noise pad for "wind/road" texture, summed into a gain we fade in and
 * out. Holds the live nodes so `stop()` can release them. Mood here is a
 * placeholder — see REVIEW_QUEUE for the Director's taste pass.
 */

import { type AudioContextLike, noiseBuffer } from './synth.js';

/** Handle to a running ambient bed; `stop()` is idempotent. */
export interface AmbientVoice {
  stop(): void;
}

interface AmbientNodes {
  oscillators: OscillatorNode[];
  noise: AudioBufferSourceNode;
  gain: GainNode;
}

/**
 * Start the ambient bed routed into `out`. Returns a handle whose `stop()`
 * fades out and tears down the nodes. Any scheduling error is swallowed so a
 * degenerate context can never break gameplay; a no-op handle is returned.
 */
export function startAmbient(ctx: AudioContextLike, out: AudioNode): AmbientVoice {
  let nodes: AmbientNodes | undefined;
  try {
    nodes = build(ctx, out);
  } catch {
    return { stop: () => {} };
  }

  const live = nodes;
  let stopped = false;

  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      try {
        // Short fade-out to avoid a click, then stop sources.
        live.gain.gain.setValueAtTime(live.gain.gain.value, now);
        live.gain.gain.linearRampToValueAtTime(0.0001, now + 0.4);
        for (const osc of live.oscillators) osc.stop(now + 0.45);
        live.noise.stop(now + 0.45);
      } catch {
        // Best-effort teardown; never throw on stop.
      }
    },
  };
}

function build(ctx: AudioContextLike, out: AudioNode): AmbientNodes {
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  // Fade in gently.
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.12, now + 1.5);
  gain.connect(out);

  // Two detuned low drones for a slow beating texture.
  const droneFreqs = [55, 55 * 1.5];
  const detune = [-6, 6];
  const oscillators: OscillatorNode[] = [];
  droneFreqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.detune.setValueAtTime(detune[i] ?? 0, now);
    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(0.5, now);
    osc.connect(voiceGain);
    voiceGain.connect(gain);
    osc.start(now);
    oscillators.push(osc);
  });

  // Looping filtered noise pad — "road/wind" hush.
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 2);
  noise.loop = true;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.setValueAtTime(400, now);
  noiseFilter.Q.setValueAtTime(0.5, now);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.25, now);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(gain);
  noise.start(now);

  return { oscillators, noise, gain };
}
