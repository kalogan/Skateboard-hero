/**
 * HUD — DOM overlay above the canvas (the renderer stays purely cosmetic on its
 * own surface; text/UI is the app's job). Shows live score + best, and the
 * start / game-over overlays. Phase-driven; no game logic here.
 */

import type { WorldState } from '@skate/core';

export type Phase = 'start' | 'playing' | 'over';

export interface Hud {
  /** Update the live score/best readout from the current world. */
  update(world: WorldState, best: number): void;
  /** Switch overlays for the given phase. `score`/`best` shown on 'over'. */
  setPhase(phase: Phase, score: number, best: number): void;
  dispose(): void;
}

export function createHud(root: HTMLElement): Hud {
  root.insertAdjacentHTML(
    'beforeend',
    `
    <div class="hud" data-hud>
      <div class="hud-stats">
        <span class="hud-score" data-score>0</span>
        <span class="hud-best" data-best>best 0</span>
      </div>
      <div class="overlay" data-overlay hidden>
        <div class="overlay-card" data-card></div>
      </div>
    </div>`,
  );

  const q = <T extends Element>(sel: string): T => {
    const el = root.querySelector<T>(sel);
    if (!el) throw new Error(`HUD element missing: ${sel}`);
    return el;
  };

  const scoreEl = q<HTMLElement>('[data-score]');
  const bestEl = q<HTMLElement>('[data-best]');
  const overlayEl = q<HTMLElement>('[data-overlay]');
  const cardEl = q<HTMLElement>('[data-card]');
  const hudEl = q<HTMLElement>('[data-hud]');

  return {
    update(world, best) {
      scoreEl.textContent = String(world.score);
      bestEl.textContent = `best ${best}`;
    },
    setPhase(phase, score, best) {
      if (phase === 'playing') {
        overlayEl.hidden = true;
        return;
      }
      overlayEl.hidden = false;
      cardEl.innerHTML =
        phase === 'start'
          ? `<h1>🛹 Skateboard&nbsp;Hero</h1>
             <p class="big">tap to skate</p>
             <p class="hint">tap / Space to ollie · time it over the obstacles</p>`
          : `<h1>Bailed!</h1>
             <p class="big">${score}</p>
             <p class="hint">best ${best} · tap to retry</p>`;
    },
    dispose() {
      hudEl.remove();
    },
  };
}
