/**
 * Input layer — one button, enriched with a trick gesture.
 *
 * A pointer press (touch or mouse) or Space is a "tap": the app decides what a
 * tap MEANS by phase (start the run, ollie, or retry). On top of that we report
 * a `TrickGesture` so the core can pick a trick:
 *
 *  - **Flick** (touch swipe / mouse drag): a press that travels past a small
 *    distance threshold within a short time window. The dominant axis maps to
 *    `'up' | 'down' | 'left' | 'right'`. A press with little movement is a plain
 *    tap (`'tap'`).
 *  - **Keyboard**: Space pops/ollies; the flick direction is whichever
 *    Arrow/WASD key is held at that moment (hold A/← + Space → flick left).
 *    Arrows/WASD alone never jump — only Space does.
 *  - **Double-tap**: two taps within `DOUBLE_TAP_MS` → `'doubleTap'` (a mid-air
 *    trick; the core only applies it when airborne).
 *
 * This module only normalizes raw events and dedupes, calling `onTap(gesture)`
 * once per discrete press. The classification math lives in pure helpers so it
 * is unit-testable without a DOM.
 */

import type { InputIntent } from '@skate/core';

/**
 * The takeoff/air gesture we report. Derived from the public `InputIntent`
 * contract (its `gesture` field) so we depend only on `@skate/core`'s exported
 * surface — `TrickGesture` itself isn't re-exported from the package entry.
 */
export type TrickGesture = NonNullable<InputIntent['gesture']>;

export type DisposeInput = () => void;

/** Max travel (CSS px) for a press to still count as a plain tap, not a flick. */
export const FLICK_DISTANCE_PX = 24;
/** Max duration (ms) of a press for its travel to read as a deliberate flick. */
export const FLICK_TIME_MS = 400;
/** Two taps within this window (ms) read as a double-tap. */
export const DOUBLE_TAP_MS = 300;

/** A pointer movement sample: how far it travelled and how long it took. */
export interface FlickSample {
  /** Net horizontal travel (px); +x is rightward. */
  readonly dx: number;
  /** Net vertical travel (px); +y is downward (screen coords). */
  readonly dy: number;
  /** Elapsed time from press to release (ms). */
  readonly dtMs: number;
}

/**
 * Classify a pointer press into a takeoff gesture. Pure: same sample → same
 * result. A small or slow movement is a plain `'tap'`; a fast enough movement
 * past the distance threshold becomes a directional flick along its dominant
 * axis. Screen +y is down, so downward travel maps to `'down'`.
 */
export function classifyFlick(sample: FlickSample): TrickGesture {
  const { dx, dy, dtMs } = sample;
  const dist = Math.hypot(dx, dy);
  if (dist < FLICK_DISTANCE_PX || dtMs > FLICK_TIME_MS) return 'tap';
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}

/** Map a held key code to its flick direction, or null if it isn't one. */
export function keyDirection(code: string): TrickGesture | null {
  switch (code) {
    case 'ArrowLeft':
    case 'KeyA':
      return 'left';
    case 'ArrowRight':
    case 'KeyD':
      return 'right';
    case 'ArrowUp':
    case 'KeyW':
      return 'up';
    case 'ArrowDown':
    case 'KeyS':
      return 'down';
    default:
      return null;
  }
}

/**
 * Given the previous tap timestamp and the current one, decide whether a
 * directional gesture should be upgraded to a double-tap. A plain tap (no
 * direction) that follows another within the window becomes `'doubleTap'`; a
 * deliberate flick keeps its direction (a flick is its own intent).
 */
export function resolveGesture(
  base: TrickGesture,
  prevTapMs: number | null,
  nowMs: number,
): TrickGesture {
  if (base === 'tap' && prevTapMs !== null && nowMs - prevTapMs <= DOUBLE_TAP_MS) {
    return 'doubleTap';
  }
  return base;
}

export function createInput(
  target: Window,
  onTap: (gesture: TrickGesture) => void,
): DisposeInput {
  // Currently-held direction keys, most-recent last (so the freshest wins).
  const heldDirs: TrickGesture[] = [];
  let pointerStart: { x: number; y: number; t: number } | null = null;
  let lastTapMs: number | null = null;

  const now = (): number =>
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  const fire = (base: TrickGesture): void => {
    const t = now();
    const gesture = resolveGesture(base, lastTapMs, t);
    lastTapMs = t;
    onTap(gesture);
  };

  const handlePointerDown = (e: PointerEvent): void => {
    // Primary button / any touch. Prevent the synthetic mouse + scroll/zoom.
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    pointerStart = { x: e.clientX, y: e.clientY, t: now() };
  };

  const handlePointerUp = (e: PointerEvent): void => {
    if (!pointerStart) return;
    const start = pointerStart;
    pointerStart = null;
    const base = classifyFlick({
      dx: e.clientX - start.x,
      dy: e.clientY - start.y,
      dtMs: now() - start.t,
    });
    fire(base);
  };

  const handlePointerCancel = (): void => {
    pointerStart = null;
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    const dir = keyDirection(e.code);
    if (dir) {
      // Track held directions for the next pop; arrows/WASD never jump alone.
      if (!heldDirs.includes(dir)) heldDirs.push(dir);
      return;
    }
    if (e.repeat) return; // hold = one ollie, not a buzzsaw
    if (e.code === 'Space') {
      e.preventDefault();
      // Freshest held direction flavours the pop; none → plain tap.
      fire(heldDirs.length > 0 ? heldDirs[heldDirs.length - 1]! : 'tap');
    }
  };

  const handleKeyUp = (e: KeyboardEvent): void => {
    const dir = keyDirection(e.code);
    if (!dir) return;
    const i = heldDirs.lastIndexOf(dir);
    if (i >= 0) heldDirs.splice(i, 1);
  };

  target.addEventListener('pointerdown', handlePointerDown, { passive: false });
  target.addEventListener('pointerup', handlePointerUp, { passive: false });
  target.addEventListener('pointercancel', handlePointerCancel);
  target.addEventListener('keydown', handleKeyDown);
  target.addEventListener('keyup', handleKeyUp);

  return () => {
    target.removeEventListener('pointerdown', handlePointerDown);
    target.removeEventListener('pointerup', handlePointerUp);
    target.removeEventListener('pointercancel', handlePointerCancel);
    target.removeEventListener('keydown', handleKeyDown);
    target.removeEventListener('keyup', handleKeyUp);
  };
}
