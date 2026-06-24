import { describe, it, expect } from 'vitest';
import { loadBest, saveBest } from './storage.js';

/** Minimal in-memory Storage stand-in. */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string): string | null => map.get(k) ?? null,
    setItem: (k: string, v: string): void => void map.set(k, v),
  };
}

describe('versioned high-score storage', () => {
  it('reads 0 when empty', () => {
    expect(loadBest(fakeStorage())).toBe(0);
  });

  it('round-trips a saved best', () => {
    const s = fakeStorage();
    expect(saveBest(s, 1200)).toBe(1200);
    expect(loadBest(s)).toBe(1200);
  });

  it('only overwrites when the new score is higher', () => {
    const s = fakeStorage();
    saveBest(s, 1000);
    expect(saveBest(s, 500)).toBe(1000);
    expect(loadBest(s)).toBe(1000);
    expect(saveBest(s, 1500)).toBe(1500);
  });

  it('treats a wrong-version payload as 0 (forward-safe)', () => {
    const s = fakeStorage({
      'skate-hero-highscore': JSON.stringify({ version: 999, best: 9000 }),
    });
    expect(loadBest(s)).toBe(0);
  });

  it('treats corrupt JSON as 0 rather than throwing', () => {
    const s = fakeStorage({ 'skate-hero-highscore': 'not json{' });
    expect(loadBest(s)).toBe(0);
  });
});
