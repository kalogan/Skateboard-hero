/**
 * Default simulation tuning + the obstacle catalog.
 *
 * Slice 0 seeds reasonable values so the app can boot and `lint:content` has a
 * real catalog to validate; Slice 1 (core sim) owns tuning these for feel.
 * Content is versioned: every `ObstacleDef` is checked by `scripts/lint-content.ts`
 * and pinned by the golden replay fixture.
 */

import type { ObstacleDef, SimConfig, TrickDef } from './types.js';

export const CONTENT_VERSION = 2;

export const DEFAULT_OBSTACLES: readonly ObstacleDef[] = [
  { id: 'cone', kind: 'cone', width: 14, height: 18, weight: 5 },
  { id: 'crack', kind: 'crack', width: 22, height: 8, weight: 4 },
  { id: 'rail', kind: 'rail', width: 40, height: 22, weight: 3 },
  { id: 'bench', kind: 'bench', width: 48, height: 30, weight: 2 },
];

/**
 * The trick catalog. Each clean ollie-and-land scores its `points`. Visual
 * params (`flipAxis`/`flipTurns`/`spinTurns`/`spinDir`) are cosmetic hints the
 * renderer animates over the airborne arc; the sim only reads `points`/`weight`.
 *
 * Balance: the plain ollie is the common, low-value baseline; flips and the
 * 360-shuv are rarer and worth progressively more (harder trick = more points).
 */
export const DEFAULT_TRICKS: readonly TrickDef[] = [
  { id: 'ollie',    name: 'Ollie',       points: 100, weight: 5, flipAxis: 'none', flipTurns: 0, spinTurns: 0, spinDir: 1 },
  { id: 'popshuv',  name: 'Pop Shuvit',  points: 150, weight: 4, flipAxis: 'shuv', flipTurns: 0, spinTurns: 0.5, spinDir: 1 },
  { id: 'kickflip', name: 'Kickflip',    points: 250, weight: 3, flipAxis: 'kick', flipTurns: 1, spinTurns: 0, spinDir: -1 },
  { id: 'heelflip', name: 'Heelflip',    points: 250, weight: 3, flipAxis: 'kick', flipTurns: 1, spinTurns: 0, spinDir: 1 },
  { id: 'shuv360',  name: '360 Shuvit',  points: 400, weight: 2, flipAxis: 'shuv', flipTurns: 0, spinTurns: 1, spinDir: 1 },
];

export const DEFAULT_CONFIG: SimConfig = {
  dt: 1 / 60,
  gravity: -2000,
  ollieImpulse: 720,
  baseSpeed: 320,
  speedRamp: 0.02,
  maxSpeed: 760,
  groundY: 0,
  boardX: 120,
  boardWidth: 44,
  boardHeight: 16,
  spawnGapMin: 260,
  spawnGapMax: 520,
  obstacles: DEFAULT_OBSTACLES,
  tricks: DEFAULT_TRICKS,
};
