import { describe, it, expect } from 'vitest';
import { createGameAudio } from './index.js';
import {
  makeStubContext,
  makeThrowingFactory,
  makeUndefinedFactory,
  type StubGain,
} from './stub.js';

/** Helper: a game-audio engine wired to a fresh recording stub. */
function withStub(state?: AudioContextState) {
  const ctx = makeStubContext(state);
  const audio = createGameAudio(() => ctx as unknown as AudioContext);
  return { ctx, audio };
}

describe('createGameAudio — lifecycle + lazy context', () => {
  it('does not create a context until the first method call', () => {
    let calls = 0;
    createGameAudio(() => {
      calls++;
      return makeStubContext() as unknown as AudioContext;
    });
    expect(calls).toBe(0);
  });

  it('creates the context once and memoizes it across calls', () => {
    let calls = 0;
    const ctx = makeStubContext();
    const audio = createGameAudio(() => {
      calls++;
      return ctx as unknown as AudioContext;
    });
    audio.ollie();
    audio.land();
    audio.bail();
    expect(calls).toBe(1);
  });
});

describe('sfx methods create + start + stop nodes', () => {
  it('ollie schedules an oscillator and a noise burst', () => {
    const { ctx, audio } = withStub();
    audio.ollie();
    expect(ctx.oscillators.length).toBeGreaterThan(0);
    expect(ctx.bufferSources.length).toBeGreaterThan(0);
    expect(ctx.oscillators.every((o) => o.started === 1 && o.stopped === 1)).toBe(
      true,
    );
    expect(ctx.bufferSources.every((s) => s.started === 1 && s.stopped === 1)).toBe(
      true,
    );
  });

  it('land schedules voices and starts/stops them', () => {
    const { ctx, audio } = withStub();
    audio.land();
    expect(ctx.oscillators.length).toBeGreaterThan(0);
    expect(ctx.oscillators.every((o) => o.started === 1 && o.stopped === 1)).toBe(
      true,
    );
  });

  it('bail schedules voices and starts/stops them', () => {
    const { ctx, audio } = withStub();
    audio.bail();
    expect(ctx.oscillators.length).toBeGreaterThan(0);
    expect(ctx.bufferSources.length).toBeGreaterThan(0);
    expect(ctx.oscillators.every((o) => o.stopped === 1)).toBe(true);
  });

  it('trick schedules voices with and without a name', () => {
    const a = withStub();
    a.audio.trick();
    expect(a.ctx.oscillators.length).toBeGreaterThan(0);

    const b = withStub();
    b.audio.trick('kickflip');
    expect(b.ctx.oscillators.length).toBeGreaterThan(0);
    expect(b.ctx.oscillators.every((o) => o.started === 1)).toBe(true);
  });

  it('different trick names produce different pitches', () => {
    const a = withStub();
    a.audio.trick('kickflip');
    const b = withStub();
    b.audio.trick('heelflip');
    const freqA = a.ctx.oscillators[0]?.frequency.value;
    const freqB = b.ctx.oscillators[0]?.frequency.value;
    expect(freqA).toBeDefined();
    expect(freqB).toBeDefined();
    // Names hash to distinct offsets (placeholder design, but deterministic).
    expect(freqA).not.toBe(freqB);
  });

  it('does not throw when fired rapidly', () => {
    const { audio } = withStub();
    expect(() => {
      for (let i = 0; i < 50; i++) {
        audio.ollie();
        audio.trick('x');
        audio.land();
        audio.bail();
      }
    }).not.toThrow();
  });
});

describe('mute', () => {
  it('isMuted reflects setMuted', () => {
    const { audio } = withStub();
    expect(audio.isMuted()).toBe(false);
    audio.setMuted(true);
    expect(audio.isMuted()).toBe(true);
    audio.setMuted(false);
    expect(audio.isMuted()).toBe(false);
  });

  it('skips scheduling sfx while muted', () => {
    const { ctx, audio } = withStub();
    audio.setMuted(true);
    audio.ollie();
    audio.land();
    audio.bail();
    expect(ctx.oscillators.length).toBe(0);
    expect(ctx.bufferSources.length).toBe(0);
  });

  it('drives the master gain to 0 when muted after init', () => {
    const { ctx, audio } = withStub();
    audio.ollie(); // forces init + master gain creation
    const master = ctx.gains[0] as StubGain;
    audio.setMuted(true);
    expect(master.gain.value).toBe(0);
    audio.setMuted(false);
    expect(master.gain.value).toBe(1);
  });

  it('starts the master gain at 0 if muted before first init', () => {
    const { ctx, audio } = withStub();
    audio.setMuted(true);
    audio.startAmbient(); // muted → should not init/create the bed
    expect(ctx.gains.length).toBe(0);
  });
});

describe('ambient bed', () => {
  it('startAmbient builds looping sources and oscillators', () => {
    const { ctx, audio } = withStub();
    audio.startAmbient();
    expect(ctx.oscillators.length).toBeGreaterThan(0);
    const loops = ctx.bufferSources.filter((s) => s.loop);
    expect(loops.length).toBeGreaterThan(0);
    expect(ctx.oscillators.every((o) => o.started === 1)).toBe(true);
  });

  it('startAmbient is idempotent (no duplicate beds)', () => {
    const { ctx, audio } = withStub();
    audio.startAmbient();
    const oscCount = ctx.oscillators.length;
    audio.startAmbient();
    expect(ctx.oscillators.length).toBe(oscCount);
  });

  it('stopAmbient stops the running sources', () => {
    const { ctx, audio } = withStub();
    audio.startAmbient();
    audio.stopAmbient();
    expect(ctx.oscillators.every((o) => o.stopped === 1)).toBe(true);
    expect(ctx.bufferSources.filter((s) => s.loop).every((s) => s.stopped === 1)).toBe(
      true,
    );
  });

  it('stopAmbient before start is a safe no-op', () => {
    const { audio } = withStub();
    expect(() => audio.stopAmbient()).not.toThrow();
  });

  it('muting stops the bed; unmuting resumes it', () => {
    const { ctx, audio } = withStub();
    audio.startAmbient();
    const firstOscCount = ctx.oscillators.length;
    audio.setMuted(true);
    expect(ctx.oscillators.every((o) => o.stopped === 1)).toBe(true);
    audio.setMuted(false);
    // A new bed is built on unmute.
    expect(ctx.oscillators.length).toBeGreaterThan(firstOscCount);
  });
});

describe('unlock', () => {
  it('resumes a suspended context', () => {
    const { ctx, audio } = withStub('suspended');
    audio.unlock();
    expect(ctx.resumeCount).toBe(1);
    expect(ctx.state).toBe('running');
  });

  it('does not resume an already-running context', () => {
    const { ctx, audio } = withStub('running');
    audio.unlock();
    expect(ctx.resumeCount).toBe(0);
  });
});

describe('degrades safely on an unavailable context', () => {
  it('a throwing factory never throws and produces no nodes', () => {
    const audio = createGameAudio(makeThrowingFactory());
    expect(() => {
      audio.unlock();
      audio.ollie();
      audio.land();
      audio.trick('x');
      audio.bail();
      audio.startAmbient();
      audio.stopAmbient();
      audio.setMuted(true);
      audio.setMuted(false);
    }).not.toThrow();
    expect(audio.isMuted()).toBe(false);
  });

  it('an undefined factory degrades to silence without throwing', () => {
    const audio = createGameAudio(makeUndefinedFactory());
    expect(() => {
      audio.unlock();
      audio.ollie();
      audio.startAmbient();
      audio.stopAmbient();
    }).not.toThrow();
  });

  it('a context whose resume() throws is tolerated', () => {
    const ctx = makeStubContext('suspended');
    (ctx as unknown as { resume: () => Promise<void> }).resume = () => {
      throw new Error('blocked');
    };
    const audio = createGameAudio(() => ctx as unknown as AudioContext);
    expect(() => audio.unlock()).not.toThrow();
  });
});
