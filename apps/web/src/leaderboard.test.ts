import { describe, it, expect } from 'vitest';
import {
  loadLeaderboard,
  qualifies,
  submitScore,
  sanitizeName,
  MAX_ENTRIES,
  NAME_MAX_LEN,
  type ScoreEntry,
} from './leaderboard.js';

/** Minimal in-memory Storage stand-in (mirrors storage.test.ts). */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string): string | null => map.get(k) ?? null,
    setItem: (k: string, v: string): void => void map.set(k, v),
  };
}

const KEY = 'skate-hero-leaderboard';

/** Seed a storage with a valid board of the given entries (unsorted ok). */
function seed(entries: ScoreEntry[]) {
  return fakeStorage({
    [KEY]: JSON.stringify({ version: 1, entries }),
  });
}

describe('leaderboard — load / persist', () => {
  it('reads an empty board when absent', () => {
    expect(loadLeaderboard(fakeStorage())).toEqual([]);
  });

  it('round-trips a submitted score', () => {
    const s = fakeStorage();
    submitScore(s, 'ABC', 1200);
    expect(loadLeaderboard(s)).toEqual([{ name: 'ABC', score: 1200 }]);
  });

  it('returns the board sorted descending', () => {
    const s = seed([
      { name: 'LOW', score: 100 },
      { name: 'TOP', score: 900 },
      { name: 'MID', score: 500 },
    ]);
    expect(loadLeaderboard(s).map((e) => e.score)).toEqual([900, 500, 100]);
  });
});

describe('leaderboard — sort & trim to 5', () => {
  it('top-5 cap is exactly 5', () => {
    expect(MAX_ENTRIES).toBe(5);
  });

  it('keeps only the top 5 after inserts', () => {
    const s = fakeStorage();
    // Insert 12 distinct scores in arbitrary order.
    const scores = [50, 900, 120, 770, 300, 640, 10, 480, 200, 560, 999, 30];
    for (const sc of scores) submitScore(s, 'AAA', sc);

    const board = loadLeaderboard(s);
    expect(board).toHaveLength(MAX_ENTRIES);
    const sorted = [...scores].sort((a, b) => b - a).slice(0, MAX_ENTRIES);
    expect(board.map((e) => e.score)).toEqual(sorted);
  });

  it('submitScore returns the trimmed board it persisted', () => {
    const s = fakeStorage();
    let board: ScoreEntry[] = [];
    for (let i = 1; i <= 7; i++) board = submitScore(s, 'AAA', i * 10);
    expect(board).toHaveLength(MAX_ENTRIES);
    expect(board).toEqual(loadLeaderboard(s));
    // Lowest two (10, 20) were trimmed; 30 is now the floor.
    expect(board[board.length - 1]!.score).toBe(30);
    expect(board.map((e) => e.score)).toEqual([70, 60, 50, 40, 30]);
  });

  it('a seed of more than 5 entries loads back trimmed to 5', () => {
    const s = seed(
      Array.from({ length: 9 }, (_, i) => ({ name: 'AAA', score: (i + 1) * 100 })),
    );
    const board = loadLeaderboard(s);
    expect(board).toHaveLength(MAX_ENTRIES);
    expect(board.map((e) => e.score)).toEqual([900, 800, 700, 600, 500]);
  });
});

describe('leaderboard — qualifies at boundaries (top 5)', () => {
  it('any positive score qualifies on an empty board', () => {
    expect(qualifies(fakeStorage(), 1)).toBe(true);
  });

  it('qualifies while the board has open slots', () => {
    const s = fakeStorage();
    for (let i = 0; i < MAX_ENTRIES - 1; i++) submitScore(s, 'AAA', 500);
    expect(loadLeaderboard(s)).toHaveLength(MAX_ENTRIES - 1); // 4 entries
    expect(qualifies(s, 1)).toBe(true); // slot free
  });

  it('the 5th slot is still open with 4 entries', () => {
    const s = seed(Array.from({ length: 4 }, () => ({ name: 'AAA', score: 1000 })));
    expect(loadLeaderboard(s)).toHaveLength(4);
    expect(qualifies(s, 1)).toBe(true); // 5th slot is open
  });

  it('on a full board of 5, must strictly beat the lowest', () => {
    const entries = Array.from({ length: MAX_ENTRIES }, (_, i) => ({
      name: 'AAA',
      score: 100 + i * 10, // lowest = 100
    }));
    const s = seed(entries);
    expect(loadLeaderboard(s)).toHaveLength(MAX_ENTRIES);
    expect(qualifies(s, 100)).toBe(false); // ties the floor → no
    expect(qualifies(s, 99)).toBe(false); // below floor → no
    expect(qualifies(s, 101)).toBe(true); // above floor → yes
  });

  it('rejects zero, negative, and non-finite scores', () => {
    const s = fakeStorage();
    expect(qualifies(s, 0)).toBe(false);
    expect(qualifies(s, -5)).toBe(false);
    expect(qualifies(s, Number.NaN)).toBe(false);
    expect(qualifies(s, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('leaderboard — name sanitization (typed names)', () => {
  it('keeps readable free-text names, trimming the ends', () => {
    expect(sanitizeName('Kevin')).toBe('Kevin');
    expect(sanitizeName('  Tony Hawk  ')).toBe('Tony Hawk');
    expect(sanitizeName('rad_dude!')).toBe('rad_dude!');
  });

  it('collapses internal whitespace runs to a single space', () => {
    expect(sanitizeName('a\t\tb')).toBe('a b');
    expect(sanitizeName('x   y   z')).toBe('x y z');
    expect(sanitizeName('line\nbreak')).toBe('line break');
  });

  it('caps the name to NAME_MAX_LEN characters', () => {
    expect(NAME_MAX_LEN).toBe(12);
    expect(sanitizeName('ABCDEFGHIJKLMNOP')).toBe('ABCDEFGHIJKL');
    expect(sanitizeName('ABCDEFGHIJKL')).toHaveLength(NAME_MAX_LEN);
    // Trailing whitespace exposed by the cap is trimmed away.
    expect(sanitizeName('Hello World Wide')).toBe('Hello World');
  });

  it('strips control characters', () => {
    const NUL = String.fromCharCode(0x00);
    const BEL = String.fromCharCode(0x07);
    const DEL = String.fromCharCode(0x7f);
    const C1 = String.fromCharCode(0x9b);
    expect(sanitizeName(`a${NUL}b${BEL}c`)).toBe('abc'); // C0 controls
    expect(sanitizeName(`x${DEL}y`)).toBe('xy'); // DEL
    expect(sanitizeName(`p${C1}q`)).toBe('pq'); // C1 control
    expect(sanitizeName('plain')).toBe('plain');
  });

  it('falls back to the default for empty / whitespace / control-only input', () => {
    const DEL = String.fromCharCode(0x7f);
    expect(sanitizeName('')).toBe('YOU');
    expect(sanitizeName('   ')).toBe('YOU');
    expect(sanitizeName('\t\n')).toBe('YOU');
    expect(sanitizeName(DEL + DEL)).toBe('YOU');
  });

  it('sanitizes names on submit', () => {
    const s = fakeStorage();
    submitScore(s, '  Rad \t Skater  ', 400);
    expect(loadLeaderboard(s)[0]!.name).toBe('Rad Skater');
  });

  it('empty submitted name becomes the default', () => {
    const s = fakeStorage();
    submitScore(s, '', 400);
    expect(loadLeaderboard(s)[0]!.name).toBe('YOU');
  });
});

describe('leaderboard — version / corruption → empty', () => {
  it('treats a wrong-version payload as empty (forward-safe)', () => {
    const s = fakeStorage({
      [KEY]: JSON.stringify({ version: 999, entries: [{ name: 'WIN', score: 9000 }] }),
    });
    expect(loadLeaderboard(s)).toEqual([]);
  });

  it('treats corrupt JSON as empty rather than throwing', () => {
    const s = fakeStorage({ [KEY]: 'not json{' });
    expect(loadLeaderboard(s)).toEqual([]);
  });

  it('treats a non-array entries field as empty', () => {
    const s = fakeStorage({ [KEY]: JSON.stringify({ version: 1, entries: 'nope' }) });
    expect(loadLeaderboard(s)).toEqual([]);
  });

  it('drops malformed entries but keeps valid ones', () => {
    const s = fakeStorage({
      [KEY]: JSON.stringify({
        version: 1,
        entries: [
          { name: 'OK1', score: 300 },
          { name: 'NOSCORE' }, // missing score
          { score: 500 }, // missing name
          { name: 'OK2', score: 'high' }, // wrong score type
          { name: 'OK3', score: 800 },
        ],
      }),
    });
    expect(loadLeaderboard(s)).toEqual([
      { name: 'OK3', score: 800 },
      { name: 'OK1', score: 300 },
    ]);
  });
});
