/**
 * Input layer — one button, modelled as PRESS / HOLD / RELEASE so the core's
 * variable jump works:
 *
 *  - **Press** (pointerdown / Space-keydown, not auto-repeat): the takeoff edge
 *    AND the start of a hold. The app decides what a press MEANS by phase (start
 *    the run, ollie, or retry).
 *  - **Hold**: while the pointer/Space is down, `held()` reports `true` so the
 *    core can sustain a higher jump (hold-to-jump-higher).
 *  - **Release** (pointerup / Space-keyup): ends the hold and resolves the trick
 *    `TrickGesture` from the press→release movement:
 *      - **Flick** (touch swipe / mouse drag): a press that travels past a small
 *        distance threshold within a short time window. The dominant axis maps to
 *        `'up' | 'down' | 'left' | 'right'`. Little movement is a plain `'tap'`.
 *      - **Keyboard**: the flick direction is whichever Arrow/WASD key is held at
 *        press (hold A/← + Space → flick left). Arrows/WASD alone never jump —
 *        only Space does.
 *      - **Double-tap**: two presses within `DOUBLE_TAP_MS` → `'doubleTap'` (a
 *        mid-air trick; the core only applies it when airborne).
 *
 * This module only normalizes raw events and dedupes. The classification math
 * lives in pure helpers so it is unit-testable without a DOM.
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

/** Callbacks for the press/hold/release lifecycle of the one jump button. */
export interface InputHandlers {
  /** The takeoff edge: a fresh press (pointerdown / Space-keydown). */
  onPress(): void;
  /**
   * The press ended (pointerup / Space-keyup); `gesture` is the trick resolved
   * from the press→release movement (or `'doubleTap'` if it followed a press
   * within `DOUBLE_TAP_MS`).
   */
  onRelease(gesture: TrickGesture): void;
}

/** Handle returned by {@link createInput}. */
export interface InputHandle {
  /** Whether the jump button is currently DOWN (continuous hold state). */
  held(): boolean;
  /** Detach all listeners. */
  dispose: DisposeInput;
}

export function createInput(target: Window, handlers: InputHandlers): InputHandle {
  // Currently-held direction keys, most-recent last (so the freshest wins).
  const heldDirs: TrickGesture[] = [];
  let pointerStart: { x: number; y: number; t: number } | null = null;
  let spaceDown = false;
  let lastPressMs: number | null = null;
  // The press that *preceded* the one we're now releasing — used for double-tap.
  let prevPressMs: number | null = null;

  const now = (): number =>
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  // A press is the takeoff edge AND the start of a hold; track the timestamp so
  // the matching release can be upgraded to a double-tap.
  const press = (): void => {
    lastPressMs = now();
    handlers.onPress();
  };

  // A release ends the hold; resolve the flick → trick (double-tap if the
  // press it closed followed a previous press within the window).
  const release = (base: TrickGesture): void => {
    handlers.onRelease(resolveGesture(base, prevPressMs, lastPressMs ?? now()));
  };

  const handlePointerDown = (e: PointerEvent): void => {
    // Primary button / any touch. Prevent the synthetic mouse + scroll/zoom.
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    prevPressMs = lastPressMs;
    pointerStart = { x: e.clientX, y: e.clientY, t: now() };
    press();
  };

  const handlePointerUp = (e: PointerEvent): void => {
    if (!pointerStart) return;
    const start = pointerStart;
    pointerStart = null;
    release(
      classifyFlick({
        dx: e.clientX - start.x,
        dy: e.clientY - start.y,
        dtMs: now() - start.t,
      }),
    );
  };

  const handlePointerCancel = (): void => {
    if (!pointerStart) return;
    pointerStart = null;
    // Treat an aborted press as a neutral release so the hold doesn't stick.
    release('tap');
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    const dir = keyDirection(e.code);
    if (dir) {
      // Track held directions for the next press; arrows/WASD never jump alone.
      if (!heldDirs.includes(dir)) heldDirs.push(dir);
      return;
    }
    if (e.repeat) return; // hold = one press edge, not a buzzsaw
    if (e.code === 'Space') {
      e.preventDefault();
      if (spaceDown) return; // already holding (defensive; repeat is handled above)
      spaceDown = true;
      prevPressMs = lastPressMs;
      press();
    }
  };

  const handleKeyUp = (e: KeyboardEvent): void => {
    const dir = keyDirection(e.code);
    if (dir) {
      const i = heldDirs.lastIndexOf(dir);
      if (i >= 0) heldDirs.splice(i, 1);
      return;
    }
    if (e.code === 'Space') {
      if (!spaceDown) return;
      spaceDown = false;
      // Freshest held direction flavours the trick; none → plain tap.
      release(heldDirs.length > 0 ? heldDirs[heldDirs.length - 1]! : 'tap');
    }
  };

  target.addEventListener('pointerdown', handlePointerDown, { passive: false });
  target.addEventListener('pointerup', handlePointerUp, { passive: false });
  target.addEventListener('pointercancel', handlePointerCancel);
  target.addEventListener('keydown', handleKeyDown);
  target.addEventListener('keyup', handleKeyUp);

  return {
    held: () => pointerStart !== null || spaceDown,
    dispose: () => {
      target.removeEventListener('pointerdown', handlePointerDown);
      target.removeEventListener('pointerup', handlePointerUp);
      target.removeEventListener('pointercancel', handlePointerCancel);
      target.removeEventListener('keydown', handleKeyDown);
      target.removeEventListener('keyup', handleKeyUp);
    },
  };
}
