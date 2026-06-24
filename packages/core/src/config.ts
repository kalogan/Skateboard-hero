/**
 * Default simulation tuning + the obstacle catalog.
 *
 * Slice 0 seeds reasonable values so the app can boot and `lint:content` has a
 * real catalog to validate; Slice 1 (core sim) owns tuning these for feel.
 * Content is versioned: every `ObstacleDef` is checked by `scripts/lint-content.ts`
 * and pinned by the golden replay fixture.
 */

import type { ObstacleDef, SimConfig, TrickDef } from './types.js';

export const CONTENT_VERSION = 3;

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
  { id: 'ollie',    name: 'Ollie',       points: 100, weight: 5, flipAxis: 'none', flipTurns: 0, spinTurns: 0,   spinDir: 1,  gesture: 'tap' },
  { id: 'popshuv',  name: 'Pop Shuvit',  points: 150, weight: 4, flipAxis: 'shuv', flipTurns: 0, spinTurns: 0.5, spinDir: 1,  gesture: 'down' },
  { id: 'kickflip', name: 'Kickflip',    points: 250, weight: 3, flipAxis: 'kick', flipTurns: 1, spinTurns: 0,   spinDir: -1, gesture: 'left' },
  { id: 'heelflip', name: 'Heelflip',    points: 250, weight: 3, flipAxis: 'kick', flipTurns: 1, spinTurns: 0,   spinDir: 1,  gesture: 'doubleTap' },
  { id: 'shuv360',  name: '360 Shuvit',  points: 400, weight: 2, flipAxis: 'shuv', flipTurns: 0, spinTurns: 1,   spinDir: 1,  gesture: 'up' },
  { id: 'treflip',  name: 'Tre Flip',    points: 500, weight: 1, flipAxis: 'kick', flipTurns: 1, spinTurns: 1,   spinDir: -1, gesture: 'right' },
];

export const DEFAULT_CONFIG: SimConfig = {
  dt: 1 / 60,
  gravity: -2000,
  ollieImpulse: 720,
  // Variable jump: hold up to ~0.22s of reduced (38%) gravity while rising.
  jumpHoldMaxTime: 0.22,
  jumpHoldGravityScale: 0.38,
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
  // Movement model. The shipped game is 'classic'; 'lanes' is the vertical
  // Temple-Run-like mode, currently exercised via the /preview A/B toggle.
  mode: 'classic',
  laneCount: 3,
  laneWidth: 90,
  laneShiftSpeed: 8,
};
