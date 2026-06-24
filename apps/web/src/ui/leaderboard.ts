/**
 * Self-contained leaderboard panel (cosmetic shell; all logic lives in the
 * data layer `../leaderboard.ts`). Mounts into a given parent and renders two
 * faces:
 *
 *   • promptEntry — tappable 3-slot initials entry for a qualifying score.
 *     Each slot has +/- steppers cycling A–Z 0–9, so it works fully without a
 *     hardware keyboard (mobile-first). A submit button calls back with the
 *     chosen initials; the data layer sanitizes defensively.
 *   • showBoard — the ranked top-10, with an optional highlighted row (the row
 *     the player just earned).
 *
 * The panel never touches storage itself; the app/Architect wires the data
 * layer calls around these callbacks.
 */

import './leaderboard.css';
import type { ScoreEntry } from '../leaderboard.js';

export interface LeaderboardPanel {
  /** Show the 3-char initials entry for a qualifying `score`. */
  promptEntry(score: number, onSubmit: (name: string) => void): void;
  /** Render the ranked board; `highlightIndex` marks the player's row. */
  showBoard(entries: ScoreEntry[], opts?: { highlightIndex?: number }): void;
  /** Hide the panel without unmounting. */
  hide(): void;
  /** Unmount and release listeners. */
  dispose(): void;
}

/** The alphabet the steppers cycle through. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SLOTS = 3;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export function createLeaderboardPanel(parent: HTMLElement): LeaderboardPanel {
  const root = el('div', 'lb-panel');
  root.hidden = true;
  parent.appendChild(root);

  // Listeners registered for the current entry view, cleared on each re-render.
  let entryCleanup: Array<() => void> = [];

  function clearEntry(): void {
    for (const off of entryCleanup) off();
    entryCleanup = [];
  }

  function on<E extends keyof HTMLElementEventMap>(
    node: HTMLElement,
    type: E,
    handler: (ev: HTMLElementEventMap[E]) => void,
  ): void {
    node.addEventListener(type, handler);
    entryCleanup.push(() => node.removeEventListener(type, handler));
  }

  function promptEntry(score: number, onSubmit: (name: string) => void): void {
    clearEntry();
    root.hidden = false;
    root.innerHTML = '';

    // Start each slot at 'A'.
    const indices = [0, 0, 0];

    const title = el('h2', 'lb-title');
    title.textContent = 'New High Score!';
    root.appendChild(title);

    const headline = el('p', 'lb-entry-headline');
    headline.textContent = 'Enter your initials';
    root.appendChild(headline);

    const scoreEl = el('p', 'lb-entry-score');
    scoreEl.textContent = String(Math.floor(score));
    root.appendChild(scoreEl);

    const steppers = el('div', 'lb-steppers');
    const charEls: HTMLElement[] = [];

    for (let slot = 0; slot < SLOTS; slot++) {
      const stepper = el('div', 'lb-stepper');

      const up = el('button', 'lb-step-btn');
      up.type = 'button';
      up.textContent = '▲';
      up.setAttribute('aria-label', `slot ${slot + 1} next letter`);

      const charEl = el('div', 'lb-char');
      charEl.textContent = ALPHABET[indices[slot]!]!;
      charEls.push(charEl);

      const down = el('button', 'lb-step-btn');
      down.type = 'button';
      down.textContent = '▼';
      down.setAttribute('aria-label', `slot ${slot + 1} previous letter`);

      const bump = (delta: number): void => {
        indices[slot] =
          (indices[slot]! + delta + ALPHABET.length) % ALPHABET.length;
        charEl.textContent = ALPHABET[indices[slot]!]!;
      };
      on(up, 'click', () => bump(1));
      on(down, 'click', () => bump(-1));

      stepper.append(up, charEl, down);
      steppers.appendChild(stepper);
    }
    root.appendChild(steppers);

    const actions = el('div', 'lb-actions');
    const submit = el('button', 'lb-btn lb-btn-primary');
    submit.type = 'button';
    submit.textContent = 'Save';
    on(submit, 'click', () => {
      const name = indices.map((i) => ALPHABET[i]!).join('');
      onSubmit(name);
    });
    actions.appendChild(submit);
    root.appendChild(actions);

    // First slot reads as the active focus visually.
    charEls[0]?.classList.add('is-active');
  }

  function showBoard(
    entries: ScoreEntry[],
    opts?: { highlightIndex?: number },
  ): void {
    clearEntry();
    root.hidden = false;
    root.innerHTML = '';

    const title = el('h2', 'lb-title');
    title.textContent = 'Top Scores';
    root.appendChild(title);

    if (entries.length === 0) {
      const empty = el('p', 'lb-empty');
      empty.textContent = 'No scores yet — go skate!';
      root.appendChild(empty);
      return;
    }

    const list = el('ol', 'lb-list');
    entries.forEach((entry, i) => {
      const row = el('li', 'lb-row');
      if (opts?.highlightIndex === i) row.classList.add('is-highlight');

      const rank = el('span', 'lb-rank');
      rank.textContent = `${i + 1}.`;
      const name = el('span', 'lb-name');
      name.textContent = entry.name;
      const scoreEl = el('span', 'lb-score');
      scoreEl.textContent = String(entry.score);

      row.append(rank, name, scoreEl);
      list.appendChild(row);
    });
    root.appendChild(list);
  }

  function hide(): void {
    root.hidden = true;
  }

  function dispose(): void {
    clearEntry();
    root.remove();
  }

  return { promptEntry, showBoard, hide, dispose };
}
