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
  // ── Points ──
  /** Per-trick point overrides, keyed by trick id. Absent = use the default. */
  readonly trickPoints: Readonly<Record<string, number>>;
  // ── Determinism ──
  /** Seed for `createWorld`. The identity seed reproduces the on-disk run. */
  readonly seed: number;
}

/** Identity seed (doc §E): reproduces the exact on-disk/production run. */
export const IDENTITY_SEED = 0;

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
    trickPoints,
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
    obstacles,
    tricks,
  };
}
