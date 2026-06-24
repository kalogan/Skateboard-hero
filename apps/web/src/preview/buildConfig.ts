/**
 * Pure knob → `SimConfig` derivation for the preview harness.
 *
 * Production-truthful: this NEVER forks the sim or the obstacle catalog. It
 * clones `DEFAULT_CONFIG` and overlays the live knob values, deriving a scaled
 * obstacle catalog by mapping over `DEFAULT_OBSTACLES` (not a hand-kept copy).
 * The resulting `SimConfig` is fed to the REAL `createWorld`/`step`.
 *
 * It is the one place worth a unit test (see `buildConfig.test.ts`): obstacle
 * scaling and the spawn-gap mapping are easy to get subtly wrong.
 */

import {
  DEFAULT_CONFIG,
  type ObstacleDef,
  type SimConfig,
} from '@skate/core';

/**
 * `GameMode` is part of the core type contract but is not re-exported from the
 * `@skate/core` index, so we derive it structurally from the public
 * `SimConfig.mode` field rather than forking the union (production-truthful:
 * one source of truth, no hand-kept copy). `NonNullable` drops the `?`.
 */
export type GameMode = NonNullable<SimConfig['mode']>;

/** The live, inspectable knobs the panel exposes over a working `SimConfig`. */
export interface PreviewKnobs {
  // ── Skateboard ──
  readonly baseSpeed: number;
  readonly maxSpeed: number;
  readonly speedRamp: number;
  /** Jump height — the ollie upward impulse. */
  readonly ollieImpulse: number;
  readonly gravity: number;
  // ── Enemies (obstacles) ──
  /** Scales every obstacle def's width + height (1 = on-disk default). */
  readonly enemySize: number;
  /** Density: scales the spawn-gap window (smaller gap = denser). 1 = default. */
  readonly enemyDensity: number;
  /**
   * Lead distance (world units ahead of the board) at which obstacles ENTER.
   * Drives `SimConfig.spawnAhead` directly: bigger = props appear sooner /
   * farther right (more reaction time); smaller = they appear closer.
   */
  readonly spawnAhead: number;
  // ── Points ──
  /** Per-trick point overrides, keyed by trick id. Absent = use the default. */
  readonly trickPoints: Readonly<Record<string, number>>;
  // ── Game mode (A/B) ──
  /**
   * Movement model: `'classic'` (horizontal) or `'lanes'` (vertical
   * Temple-Run-like). Drives `SimConfig.mode`; the two are different sim models,
   * so switching restarts the run.
   */
  readonly mode: GameMode;
  // ── Lane-mode tuning (only meaningful when `mode === 'lanes'`) ──
  /** Number of lanes. */
  readonly laneCount: number;
  /** Lateral shift speed, in lanes per second. */
  readonly laneShiftSpeed: number;
  // ── Determinism ──
  /** Seed for `createWorld`. The identity seed reproduces the on-disk run. */
  readonly seed: number;
}

/** Identity seed (doc §E): reproduces the exact on-disk/production run. */
export const IDENTITY_SEED = 0;

/**
 * Default obstacle lead distance for the harness. `DEFAULT_CONFIG` leaves
 * `spawnAhead` unset (so the golden fixture stays at the legacy rolled-gap
 * behavior), so the harness picks an explicit, tunable lead — just beyond the
 * typical visible width — as its default.
 */
export const DEFAULT_SPAWN_AHEAD = DEFAULT_CONFIG.spawnAhead ?? 700;

/** Default knob values, read straight from the production `DEFAULT_CONFIG`. */
export function defaultKnobs(): PreviewKnobs {
  const trickPoints: Record<string, number> = {};
  for (const t of DEFAULT_CONFIG.tricks) trickPoints[t.id] = t.points;
  return {
    baseSpeed: DEFAULT_CONFIG.baseSpeed,
    maxSpeed: DEFAULT_CONFIG.maxSpeed,
    speedRamp: DEFAULT_CONFIG.speedRamp,
    ollieImpulse: DEFAULT_CONFIG.ollieImpulse,
    gravity: DEFAULT_CONFIG.gravity,
    enemySize: 1,
    enemyDensity: 1,
    spawnAhead: DEFAULT_SPAWN_AHEAD,
    trickPoints,
    // Identity defaults: read straight from the production DEFAULT_CONFIG, so
    // `mode === 'classic'` reproduces the shipped model untouched.
    mode: DEFAULT_CONFIG.mode ?? 'classic',
    laneCount: DEFAULT_CONFIG.laneCount ?? 3,
    laneShiftSpeed: DEFAULT_CONFIG.laneShiftSpeed ?? 8,
    seed: IDENTITY_SEED,
  };
}

/** Scale a single obstacle def's footprint. Width/height only; weight/kind/id keep. */
function scaleObstacle(def: ObstacleDef, scale: number): ObstacleDef {
  return {
    ...def,
    width: Math.max(1, Math.round(def.width * scale)),
    height: Math.max(1, Math.round(def.height * scale)),
  };
}

/**
 * Build a derived `SimConfig` from the knobs. Pure (no I/O, no clock): the same
 * knobs always yield the same config — itself a precondition for the harness's
 * determinism guarantee.
 *
 * `density` scales the spawn-gap window inversely-ish: density 2 halves the gap
 * (denser field), density 0.5 doubles it. `min` is kept <= `max`.
 */
export function buildConfig(knobs: PreviewKnobs): SimConfig {
  const density = knobs.enemyDensity > 0 ? knobs.enemyDensity : 1;
  const gapScale = 1 / density;
  const spawnGapMin = Math.max(1, Math.round(DEFAULT_CONFIG.spawnGapMin * gapScale));
  const spawnGapMaxRaw = Math.max(1, Math.round(DEFAULT_CONFIG.spawnGapMax * gapScale));
  const spawnGapMax = Math.max(spawnGapMin, spawnGapMaxRaw);

  const obstacles = DEFAULT_CONFIG.obstacles.map((o) =>
    scaleObstacle(o, knobs.enemySize),
  );

  const tricks = DEFAULT_CONFIG.tricks.map((t) => {
    const override = knobs.trickPoints[t.id];
    return typeof override === 'number' && override > 0
      ? { ...t, points: Math.round(override) }
      : t;
  });

  return {
    ...DEFAULT_CONFIG,
    baseSpeed: knobs.baseSpeed,
    maxSpeed: Math.max(knobs.baseSpeed, knobs.maxSpeed),
    speedRamp: knobs.speedRamp,
    ollieImpulse: knobs.ollieImpulse,
    gravity: knobs.gravity,
    spawnGapMin,
    spawnGapMax,
    // Lead distance at which obstacles enter; kept >= 1 world unit so a degenerate
    // knob never collapses the spawn window. Drives the REAL sim's spawnAhead.
    spawnAhead: Math.max(1, Math.round(knobs.spawnAhead)),
    obstacles,
    tricks,
    // Game-mode A/B. The lane knobs are always carried (harmless in classic;
    // the sim only reads them when `mode === 'lanes'`); laneCount is kept >= 1.
    mode: knobs.mode,
    laneCount: Math.max(1, Math.round(knobs.laneCount)),
    laneShiftSpeed: knobs.laneShiftSpeed,
  };
}
