/**
 * Versioned high-score persistence (pipeline constraint #5: everything
 * persisted is versioned and degrades safely). A bumped `VERSION` or any
 * malformed/foreign payload reads back as 0 rather than throwing.
 */

const KEY = 'skate-hero-highscore';
const VERSION = 1;

interface Persisted {
  readonly version: number;
  readonly best: number;
}

/** Read the stored best score, or 0 if absent/corrupt/old-version. */
export function loadBest(storage: Pick<Storage, 'getItem' | 'setItem'>): number {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (parsed.version !== VERSION || typeof parsed.best !== 'number') return 0;
    return parsed.best;
  } catch {
    return 0;
  }
}

/** Persist `best` if it beats the stored value; returns the resulting best. */
export function saveBest(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  best: number,
): number {
  const current = loadBest(storage);
  if (best <= current) return current;
  try {
    const payload: Persisted = { version: VERSION, best };
    storage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Private-mode / quota failures are non-fatal — the run still played.
  }
  return best;
}
