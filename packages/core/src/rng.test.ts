import { describe, it, expect } from 'vitest';
import { seedRng, nextFloat, nextRange, nextInt, nextWeightedIndex } from './rng.js';

describe('seeded rng (determinism)', () => {
  it('produces the same sequence for the same seed', () => {
    const seqFrom = (seed: number): number[] => {
      let s = seedRng(seed);
      const out: number[] = [];
      for (let i = 0; i < 8; i++) {
        const [v, next] = nextFloat(s);
        out.push(v);
        s = next;
      }
      return out;
    };
    expect(seqFrom(12345)).toEqual(seqFrom(12345));
  });

  it('produces different sequences for different seeds', () => {
    const first = (seed: number): number => nextFloat(seedRng(seed))[0];
    expect(first(1)).not.toEqual(first(2));
  });

  it('stays within [0, 1)', () => {
    let s = seedRng(99);
    for (let i = 0; i < 1000; i++) {
      const [v, next] = nextFloat(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      s = next;
    }
  });

  it('nextRange respects bounds', () => {
    let s = seedRng(7);
    for (let i = 0; i < 1000; i++) {
      const [v, next] = nextRange(s, 10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
      s = next;
    }
  });

  it('nextInt is inclusive on both ends and integral', () => {
    let s = seedRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const [v, next] = nextInt(s, 1, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
      s = next;
    }
    expect(seen).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  it('nextWeightedIndex honors weights roughly proportionally', () => {
    let s = seedRng(42);
    const weights = [1, 3]; // index 1 should win ~3x as often
    const counts = [0, 0];
    for (let i = 0; i < 4000; i++) {
      const [idx, next] = nextWeightedIndex(s, weights);
      counts[idx] = (counts[idx] ?? 0) + 1;
      s = next;
    }
    // index 1 clearly more frequent than index 0
    expect(counts[1]!).toBeGreaterThan(counts[0]! * 1.8);
  });
});
