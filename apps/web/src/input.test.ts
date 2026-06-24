import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  classifyFlick,
  keyDirection,
  resolveGesture,
  createInput,
  DOUBLE_TAP_MS,
  FLICK_DISTANCE_PX,
  type TrickGesture,
} from './input.js';

// ── Pure helpers ──────────────────────────────────────────────────────────

describe('classifyFlick', () => {
  it('reads a small/slow press as a plain tap', () => {
    expect(classifyFlick({ dx: 2, dy: -3, dtMs: 50 })).toBe('tap');
    expect(classifyFlick({ dx: 100, dy: 0, dtMs: 9999 })).toBe('tap'); // too slow
  });

  it('maps a fast directional drag to its dominant axis (screen +y is down)', () => {
    const fast = (dx: number, dy: number): TrickGesture =>
      classifyFlick({ dx, dy, dtMs: 100 });
    expect(fast(FLICK_DISTANCE_PX + 10, 0)).toBe('right');
    expect(fast(-(FLICK_DISTANCE_PX + 10), 0)).toBe('left');
    expect(fast(0, FLICK_DISTANCE_PX + 10)).toBe('down');
    expect(fast(0, -(FLICK_DISTANCE_PX + 10))).toBe('up');
  });
});

describe('keyDirection', () => {
  it('maps arrows + WASD to directions and ignores others', () => {
    expect(keyDirection('ArrowLeft')).toBe('left');
    expect(keyDirection('KeyD')).toBe('right');
    expect(keyDirection('KeyW')).toBe('up');
    expect(keyDirection('ArrowDown')).toBe('down');
    expect(keyDirection('Space')).toBeNull();
  });
});

describe('resolveGesture', () => {
  it('upgrades a quick second tap to a double-tap', () => {
    expect(resolveGesture('tap', 1000, 1000 + DOUBLE_TAP_MS - 1)).toBe('doubleTap');
  });
  it('leaves a slow second tap as a plain tap', () => {
    expect(resolveGesture('tap', 1000, 1000 + DOUBLE_TAP_MS + 1)).toBe('tap');
  });
  it('keeps a directional flick (its own intent) even when fast', () => {
    expect(resolveGesture('left', 1000, 1010)).toBe('left');
  });
});

// ── Lifecycle: press / hold / release over a fake Window ────────────────────

type Listener = (e: unknown) => void;

/** A DOM-free Window stand-in that records listeners and dispatches to them. */
function makeTarget() {
  const listeners = new Map<string, Set<Listener>>();
  const target = {
    addEventListener(type: string, fn: Listener) {
      (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn);
    },
    removeEventListener(type: string, fn: Listener) {
      listeners.get(type)?.delete(fn);
    },
  } as unknown as Window;
  const fire = (type: string, e: Record<string, unknown> = {}): void => {
    for (const fn of listeners.get(type) ?? []) fn({ preventDefault() {}, ...e });
  };
  const count = (type: string): number => listeners.get(type)?.size ?? 0;
  return { target, fire, count };
}

describe('createInput (press / hold / release)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // performance.now() advances with the fake clock so double-tap timing is
    // deterministic in tests.
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('fires onPress on pointerdown and reports held until pointerup', () => {
    const { target, fire } = makeTarget();
    const onPress = vi.fn();
    const onRelease = vi.fn();
    const input = createInput(target, { onPress, onRelease });

    expect(input.held()).toBe(false);
    fire('pointerdown', { button: 0, pointerType: 'touch', clientX: 0, clientY: 0 });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onRelease).not.toHaveBeenCalled();
    expect(input.held()).toBe(true);

    fire('pointerup', { clientX: 0, clientY: 0 });
    expect(input.held()).toBe(false);
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(onRelease).toHaveBeenCalledWith('tap');
    input.dispose();
  });

  it('resolves a directional flick on release', () => {
    const { target, fire } = makeTarget();
    const onRelease = vi.fn();
    const input = createInput(target, { onPress: vi.fn(), onRelease });

    fire('pointerdown', { button: 0, pointerType: 'touch', clientX: 0, clientY: 0 });
    fire('pointerup', { clientX: FLICK_DISTANCE_PX + 20, clientY: 0 });
    expect(onRelease).toHaveBeenCalledWith('right');
    input.dispose();
  });

  it('marks a quick press-release-press-release pair as a doubleTap', () => {
    const { target, fire } = makeTarget();
    const onRelease = vi.fn();
    const input = createInput(target, { onPress: vi.fn(), onRelease });

    fire('pointerdown', { button: 0, pointerType: 'touch', clientX: 0, clientY: 0 });
    fire('pointerup', { clientX: 0, clientY: 0 });
    expect(onRelease).toHaveBeenLastCalledWith('tap');

    vi.advanceTimersByTime(DOUBLE_TAP_MS - 50); // within the window
    fire('pointerdown', { button: 0, pointerType: 'touch', clientX: 0, clientY: 0 });
    fire('pointerup', { clientX: 0, clientY: 0 });
    expect(onRelease).toHaveBeenLastCalledWith('doubleTap');
    input.dispose();
  });

  it('keyboard: Space press → onPress + held, keyup → onRelease(tap)', () => {
    const { target, fire } = makeTarget();
    const onPress = vi.fn();
    const onRelease = vi.fn();
    const input = createInput(target, { onPress, onRelease });

    fire('keydown', { code: 'Space', repeat: false });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(input.held()).toBe(true);

    fire('keyup', { code: 'Space' });
    expect(input.held()).toBe(false);
    expect(onRelease).toHaveBeenCalledWith('tap');
    input.dispose();
  });

  it('keyboard: a held direction flavours the trick; auto-repeat does not re-press', () => {
    const { target, fire } = makeTarget();
    const onPress = vi.fn();
    const onRelease = vi.fn();
    const input = createInput(target, { onPress, onRelease });

    fire('keydown', { code: 'ArrowLeft', repeat: false }); // arrow alone never presses
    expect(onPress).not.toHaveBeenCalled();
    fire('keydown', { code: 'Space', repeat: false });
    fire('keydown', { code: 'Space', repeat: true }); // OS auto-repeat — ignored
    expect(onPress).toHaveBeenCalledTimes(1);
    fire('keyup', { code: 'Space' });
    expect(onRelease).toHaveBeenCalledWith('left');
    input.dispose();
  });

  it('dispose() detaches every listener', () => {
    const { target, count } = makeTarget();
    const input = createInput(target, { onPress: vi.fn(), onRelease: vi.fn() });
    const types = ['pointerdown', 'pointerup', 'pointercancel', 'keydown', 'keyup'];
    for (const t of types) expect(count(t)).toBe(1);
    input.dispose();
    for (const t of types) expect(count(t)).toBe(0);
  });
});
