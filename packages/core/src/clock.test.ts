import { describe, it, expect } from 'vitest';
import { ManualClock } from './clock.js';

describe('ManualClock', () => {
  it('starts at 0 by default and advances deterministically', () => {
    const clock = new ManualClock();
    expect(clock.now()).toBe(0);
    clock.advance(16);
    clock.advance(16);
    expect(clock.now()).toBe(32);
  });

  it('honors a custom start time', () => {
    const clock = new ManualClock(1000);
    expect(clock.now()).toBe(1000);
  });
});
