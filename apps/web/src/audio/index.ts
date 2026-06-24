/**
 * Procedural Web Audio engine (audio slice).
 *
 * Synthesizes all game SFX and an ambient bed at runtime — no asset files, no
 * network. Audio is strictly cosmetic: it never affects game state, and a
 * suspended/blocked/unavailable AudioContext degrades to silence rather than
 * throwing. The Architect wires `GameAudio` into the game loop's event points.
 *
 * Layers: `synth.ts` (primitives) → `sfx.ts` / `ambient.ts` (voices) → this
 * facade (lifecycle, mute, master gain, lazy context creation).
 */

import type { AudioContextLike } from './synth.js';
import { ollie, land, trick, bail } from './sfx.js';
import { startAmbient as startAmbientVoice, type AmbientVoice } from './ambient.js';

export type { AudioContextLike } from './synth.js';

/** Public audio surface consumed by the app/game loop. */
export interface GameAudio {
  /** Resume the AudioContext — call on first user gesture (autoplay policy). */
  unlock(): void;
  /** Takeoff sfx. */
  ollie(): void;
  /** Landing sfx. */
  land(): void;
  /** Optional per-trick flourish (name from the core's trick scoring). */
  trick(name?: string): void;
  /** Crash sfx. */
  bail(): void;
  /** Begin the ambient bed/loop (idempotent). */
  startAmbient(): void;
  /** Stop the ambient bed (idempotent). */
  stopAmbient(): void;
  /** Mute/unmute all output (ambient + sfx). */
  setMuted(muted: boolean): void;
  isMuted(): boolean;
}

/** Default factory: the real browser AudioContext, behind a feature check. */
function defaultMakeContext(): AudioContextLike | undefined {
  const Ctor =
    typeof globalThis !== 'undefined'
      ? ((globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
        (globalThis as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext)
      : undefined;
  if (!Ctor) return undefined;
  try {
    return new Ctor();
  } catch {
    return undefined;
  }
}

/**
 * Create the audio engine. `makeContext` is injectable so tests can supply a
 * stub (vitest runs in Node with no real AudioContext); when omitted the real
 * browser context is used if available.
 *
 * Context creation is lazy: nothing is created until the first method call.
 * This keeps construction cheap and avoids spawning a context the autoplay
 * policy would only suspend.
 */
export function createGameAudio(
  makeContext: () => AudioContext = (() =>
    defaultMakeContext() as AudioContext),
): GameAudio {
  let ctx: AudioContextLike | undefined;
  let master: GainNode | undefined;
  let initialized = false;
  let muted = false;
  let ambient: AmbientVoice | undefined;
  let wantAmbient = false;

  /** Lazily create + memoize the context and master gain. Never throws. */
  function ensure(): AudioContextLike | undefined {
    if (initialized) return ctx;
    initialized = true;
    try {
      const created = makeContext() as AudioContextLike | undefined;
      if (!created) return undefined;
      ctx = created;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
    } catch {
      ctx = undefined;
      master = undefined;
    }
    return ctx;
  }

  /** Run an sfx scheduler if audio is available, muted off, and routable. */
  function play(fn: (c: AudioContextLike, out: AudioNode) => void): void {
    if (muted) return;
    const c = ensure();
    if (!c || !master) return;
    try {
      fn(c, master);
    } catch {
      // Cosmetic: never let a scheduling hiccup reach gameplay.
    }
  }

  return {
    unlock(): void {
      const c = ensure();
      if (!c) return;
      // Resume is async and may reject (already running / blocked); ignore.
      try {
        if (c.state !== 'running') void c.resume().catch(() => {});
      } catch {
        // Some stubs/old contexts throw synchronously; tolerate it.
      }
    },

    ollie(): void {
      play(ollie);
    },

    land(): void {
      play(land);
    },

    trick(name?: string): void {
      play((c, out) => trick(c, out, name));
    },

    bail(): void {
      play(bail);
    },

    startAmbient(): void {
      wantAmbient = true;
      if (muted) return;
      const c = ensure();
      if (!c || !master) return;
      if (ambient) return; // already running
      ambient = startAmbientVoice(c, master);
    },

    stopAmbient(): void {
      wantAmbient = false;
      if (ambient) {
        ambient.stop();
        ambient = undefined;
      }
    },

    setMuted(next: boolean): void {
      muted = next;
      if (master && ctx) {
        try {
          master.gain.setValueAtTime(next ? 0 : 1, ctx.currentTime);
        } catch {
          master.gain.value = next ? 0 : 1;
        }
      }
      if (next) {
        // Silence the ambient bed but remember intent to resume on unmute.
        if (ambient) {
          ambient.stop();
          ambient = undefined;
        }
      } else if (wantAmbient && !ambient) {
        const c = ensure();
        if (c && master) ambient = startAmbientVoice(c, master);
      }
    },

    isMuted(): boolean {
      return muted;
    },
  };
}
