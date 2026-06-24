/**
 * Versioned local top-5 leaderboard (pipeline constraint #5: everything
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

interface Persisted {
  readonly version: number;
  readonly entries: readonly unknown[];
}

/** Maximum entries kept on the board. */
export const MAX_ENTRIES = 5;

/** Maximum length of a typed player name (matches the UI input maxlength). */
export const NAME_MAX_LEN = 12;
const DEFAULT_NAME = 'YOU';

/**
 * Match control characters to strip them: the C0 range (U+0000–U+001F), DEL
 * (U+007F), and the C1 range (U+0080–U+009F). Built from escapes so the source
 * stays pure ASCII. Whitespace is normalized separately, before this runs.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * Coerce a typed name into a readable, storable label: collapse whitespace runs
 * (incl. tabs/newlines) to a single space, strip any remaining control chars,
 * trim the ends, and cap to `NAME_MAX_LEN`. Empty / all-whitespace /
 * all-control input falls back to the default ("YOU"). Pure and versioned-safe:
 * never throws, always returns a non-empty string of length ≤ NAME_MAX_LEN.
 */
export function sanitizeName(raw: string): string {
  const cleaned = (raw ?? '')
    .replace(/\s+/g, ' ') // collapse whitespace (incl. tabs/newlines) first…
    .replace(CONTROL_CHARS, '') // …then strip any remaining control chars
    .trim()
    .slice(0, NAME_MAX_LEN)
    .trim();
  return cleaned.length > 0 ? cleaned : DEFAULT_NAME;
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
 * Read the stored board (sorted desc, ≤5), or an empty board if
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
 * Would `score` make the top 5? True if the board has open slots or `score`
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
 * Insert a sanitized entry, sort desc, trim to 5, persist, and return the
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
