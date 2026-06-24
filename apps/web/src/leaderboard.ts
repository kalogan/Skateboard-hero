/**
 * Versioned local top-10 leaderboard (pipeline constraint #5: everything
 * persisted is versioned and degrades safely). Mirrors `storage.ts`: a bumped
 * `VERSION` or any malformed/foreign payload reads back as an empty board
 * rather than throwing. No backend, no network — localStorage only.
 */

export interface ScoreEntry {
  name: string;
  score: number;
}

const KEY = 'skate-hero-leaderboard';
const VERSION = 1;

/** Maximum entries kept on the board. */
export const MAX_ENTRIES = 10;

/** Initials length / shape: exactly 3 chars from A–Z and 0–9. */
const NAME_LEN = 3;
const DEFAULT_NAME = 'AAA';

interface Persisted {
  readonly version: number;
  readonly entries: readonly unknown[];
}

/**
 * Coerce a name to exactly 3 uppercase A–Z / 0–9 characters. Anything else is
 * stripped; a too-short result is padded with the default fill ('A'). Always
 * returns a valid 3-char tag (default "AAA").
 */
export function sanitizeName(raw: string): string {
  const cleaned = (raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, NAME_LEN);
  return (cleaned + DEFAULT_NAME).slice(0, NAME_LEN);
}

/** Type-guard for a persisted entry of the current schema. */
function isEntry(value: unknown): value is ScoreEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ScoreEntry).name === 'string' &&
    typeof (value as ScoreEntry).score === 'number' &&
    Number.isFinite((value as ScoreEntry).score)
  );
}

/** Sort descending by score (stable for equal scores) and trim to the cap. */
function normalize(entries: ScoreEntry[]): ScoreEntry[] {
  return entries
    .map((e) => ({ name: sanitizeName(e.name), score: Math.floor(e.score) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES);
}

/**
 * Read the stored board (sorted desc, ≤10), or an empty board if
 * absent/corrupt/old-version.
 */
export function loadLeaderboard(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): ScoreEntry[] {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (parsed.version !== VERSION || !Array.isArray(parsed.entries)) return [];
    const entries = parsed.entries.filter(isEntry);
    return normalize(entries);
  } catch {
    return [];
  }
}

/**
 * Would `score` make the top 10? True if the board has open slots or `score`
 * beats the current lowest entry. Non-finite/≤0 scores never qualify.
 */
export function qualifies(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  score: number,
): boolean {
  if (!Number.isFinite(score) || score <= 0) return false;
  const board = loadLeaderboard(storage);
  if (board.length < MAX_ENTRIES) return true;
  const lowest = board[board.length - 1]!.score;
  return score > lowest;
}

/**
 * Insert a sanitized entry, sort desc, trim to 10, persist, and return the
 * resulting board. Persistence failures (private mode / quota) are non-fatal —
 * the returned board still reflects the insert.
 */
export function submitScore(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  name: string,
  score: number,
): ScoreEntry[] {
  const board = loadLeaderboard(storage);
  board.push({ name: sanitizeName(name), score: Math.floor(score) });
  const next = normalize(board);
  try {
    const payload: Persisted = { version: VERSION, entries: next };
    storage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Private-mode / quota failures are non-fatal — the run still played.
  }
  return next;
}
