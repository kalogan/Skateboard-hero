/**
 * Default simulation tuning + the obstacle catalog.
 *
 * Slice 0 seeds reasonable values so the app can boot and `lint:content` has a
 * real catalog to validate; Slice 1 (core sim) owns tuning these for feel.
 * Content is versioned: every `ObstacleDef` is checked by `scripts/lint-content.ts`
 * and pinned by the golden replay fixture.
 */

import type { ObstacleDef, SimConfig } from './types.js';

export const CONTENT_VERSION = 1;

export const DEFAULT_OBSTACLES: readonly ObstacleDef[] = [
  { id: 'cone', kind: 'cone', width: 14, height: 18, weight: 5 },
  { id: 'crack', kind: 'crack', width: 22, height: 8, weight: 4 },
  { id: 'rail', kind: 'rail', width: 40, height: 22, weight: 3 },
  { id: 'bench', kind: 'bench', width: 48, height: 30, weight: 2 },
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
  trickBonus: 150,
  obstacles: DEFAULT_OBSTACLES,
};
