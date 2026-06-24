/**
 * Hand-rolled AudioContext stub for tests.
 *
 * vitest runs in Node with no DOM, so there is no real `AudioContext`. This
 * stub records the nodes created, the connect graph, and start/stop/gain
 * activity so tests can assert that each method schedules a voice without
 * relying on a browser. It is intentionally only as complete as the slice of
 * the Web Audio API this engine touches.
 *
 * NOTE: lives under `audio/**` (the slice's surface) rather than a shared test
 * helpers dir; it is test-only support but kept local to avoid touching other
 * builders' files.
 */

import type { AudioContextLike } from './synth.js';

export interface ParamEvent {
  kind: 'setValueAtTime' | 'linearRamp' | 'exponentialRamp';
  value: number;
  time: number;
}

export class StubParam {
  value = 0;
  events: ParamEvent[] = [];
  setValueAtTime(value: number, time: number): this {
    this.value = value;
    this.events.push({ kind: 'setValueAtTime', value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): this {
    this.value = value;
    this.events.push({ kind: 'linearRamp', value, time });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number): this {
    this.value = value;
    this.events.push({ kind: 'exponentialRamp', value, time });
    return this;
  }
}

export class StubNode {
  readonly connections: StubNode[] = [];
  connect(dest: StubNode): StubNode {
    this.connections.push(dest);
    return dest;
  }
  disconnect(): void {}
}

export class StubGain extends StubNode {
  gain = new StubParam();
}

export class StubOscillator extends StubNode {
  type = 'sine';
  frequency = new StubParam();
  detune = new StubParam();
  started = 0;
  stopped = 0;
  start(when = 0): void {
    this.started++;
    void when;
  }
  stop(when = 0): void {
    this.stopped++;
    void when;
  }
}

export class StubBiquad extends StubNode {
  type = 'lowpass';
  frequency = new StubParam();
  Q = new StubParam();
}

export class StubBufferSource extends StubNode {
  buffer: unknown = null;
  loop = false;
  started = 0;
  stopped = 0;
  start(when = 0): void {
    this.started++;
    void when;
  }
  stop(when = 0): void {
    this.stopped++;
    void when;
  }
}

export class StubBuffer {
  private readonly channel: Float32Array;
  constructor(length: number) {
    this.channel = new Float32Array(Math.max(1, length));
  }
  getChannelData(): Float32Array {
    return this.channel;
  }
}

export interface RecordingContext extends AudioContextLike {
  readonly oscillators: StubOscillator[];
  readonly bufferSources: StubBufferSource[];
  readonly gains: StubGain[];
  readonly filters: StubBiquad[];
  readonly resumeCount: number;
}

/**
 * Build a recording stub context.
 * @param state initial `state` (default 'suspended', mimicking autoplay block).
 */
export function makeStubContext(
  state: AudioContextState = 'suspended',
): RecordingContext {
  const oscillators: StubOscillator[] = [];
  const bufferSources: StubBufferSource[] = [];
  const gains: StubGain[] = [];
  const filters: StubBiquad[] = [];
  let resumeCount = 0;
  let currentState = state;
  let time = 0;

  const ctx = {
    get currentTime() {
      // Advance a touch each read so scheduled times differ.
      time += 0.001;
      return time;
    },
    destination: new StubNode(),
    sampleRate: 44100,
    get state() {
      return currentState;
    },
    get oscillators() {
      return oscillators;
    },
    get bufferSources() {
      return bufferSources;
    },
    get gains() {
      return gains;
    },
    get filters() {
      return filters;
    },
    get resumeCount() {
      return resumeCount;
    },
    createOscillator() {
      const o = new StubOscillator();
      oscillators.push(o);
      return o as unknown as OscillatorNode;
    },
    createGain() {
      const g = new StubGain();
      gains.push(g);
      return g as unknown as GainNode;
    },
    createBiquadFilter() {
      const f = new StubBiquad();
      filters.push(f);
      return f as unknown as BiquadFilterNode;
    },
    createBufferSource() {
      const s = new StubBufferSource();
      bufferSources.push(s);
      return s as unknown as AudioBufferSourceNode;
    },
    createBuffer(_channels: number, length: number) {
      return new StubBuffer(length) as unknown as AudioBuffer;
    },
    resume() {
      resumeCount++;
      currentState = 'running';
      return Promise.resolve();
    },
  };

  return ctx as unknown as RecordingContext;
}

/**
 * A context factory that throws — models a browser where `new AudioContext()`
 * fails outright (constructor unavailable / blocked).
 */
export function makeThrowingFactory(): () => AudioContext {
  return () => {
    throw new Error('AudioContext unavailable');
  };
}

/** A factory returning undefined — models feature-detection coming up empty. */
export function makeUndefinedFactory(): () => AudioContext {
  return () => undefined as unknown as AudioContext;
}
