/**
 * Self-contained leaderboard panel (cosmetic shell; all logic lives in the
 * data layer `../leaderboard.ts`). Mounts into a given parent and renders two
 * faces:
 *
 *   • promptEntry — a free-text name input for a qualifying score. The player
 *     types their name (autofocused, capped at NAME_MAX_LEN); Save or Enter
 *     calls back with the raw text and the data layer sanitizes defensively.
 *   • showBoard — the ranked top-5, with an optional highlighted row (the row
 *     the player just earned).
 *
 * The panel never touches storage itself; the app/Architect wires the data
 * layer calls around these callbacks.
 */

import './leaderboard.css';
import { NAME_MAX_LEN, type ScoreEntry } from '../leaderboard.js';

export interface LeaderboardPanel {
  /** Show the free-text name entry for a qualifying `score`. */
  promptEntry(score: number, onSubmit: (name: string) => void): void;
  /** Render the ranked board; `highlightIndex` marks the player's row. */
  showBoard(entries: ScoreEntry[], opts?: { highlightIndex?: number }): void;
  /** Hide the panel without unmounting. */
  hide(): void;
  /** Unmount and release listeners. */
  dispose(): void;
}

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

    const title = el('h2', 'lb-title');
    title.textContent = 'New High Score!';
    root.appendChild(title);

    const headline = el('p', 'lb-entry-headline');
    headline.textContent = 'Enter your name';
    root.appendChild(headline);

    const scoreEl = el('p', 'lb-entry-score');
    scoreEl.textContent = String(Math.floor(score));
    root.appendChild(scoreEl);

    const input = el('input', 'lb-name-input');
    input.type = 'text';
    input.maxLength = NAME_MAX_LEN;
    input.placeholder = 'Your name';
    input.autocomplete = 'off';
    input.spellcheck = false;
    // inputmode + the ≥16px font-size in CSS keep iOS from zoom-on-focus.
    input.setAttribute('inputmode', 'text');
    input.setAttribute('enterkeyhint', 'done');
    input.setAttribute('aria-label', 'Your name');
    root.appendChild(input);

    let submitted = false;
    const submitName = (): void => {
      if (submitted) return; // guard against Enter + click double-fire
      submitted = true;
      onSubmit(input.value);
    };

    const actions = el('div', 'lb-actions');
    const submit = el('button', 'lb-btn lb-btn-primary');
    submit.type = 'button';
    submit.textContent = 'Save';
    on(submit, 'click', submitName);
    actions.appendChild(submit);
    root.appendChild(actions);

    on(input, 'keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        submitName();
      }
    });

    // Autofocus once mounted (and select any default text for quick overwrite).
    input.focus();
    input.select();
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
