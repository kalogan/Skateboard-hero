/**
 * Input layer — one button. A pointer press (touch or mouse) or Space/ArrowUp/↑
 * is a single "tap" intent. The app decides what a tap MEANS by phase (start the
 * run, ollie, or retry); this module only normalizes the raw events and
 * dedupes, calling `onTap` once per discrete press.
 */

export type DisposeInput = () => void;

export function createInput(target: Window, onTap: () => void): DisposeInput {
  const handlePointer = (e: PointerEvent): void => {
    // Primary button / any touch. Prevent the synthetic mouse + scroll/zoom.
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    onTap();
  };

  const handleKey = (e: KeyboardEvent): void => {
    if (e.repeat) return; // hold = one ollie, not a buzzsaw
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      onTap();
    }
  };

  target.addEventListener('pointerdown', handlePointer, { passive: false });
  target.addEventListener('keydown', handleKey);

  return () => {
    target.removeEventListener('pointerdown', handlePointer);
    target.removeEventListener('keydown', handleKey);
  };
}
