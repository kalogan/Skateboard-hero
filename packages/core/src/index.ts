/**
 * @skate/core — the authoritative, engine-agnostic Skateboard Hero simulation.
 *
 * This is the ONLY public surface other packages may import. Internals are not
 * a contract (the arch-guard lint rule forbids reaching into `src/*`).
 *
 * Slice 0 establishes the contract: types, the deterministic RNG/Clock, and the
 * default tuning + obstacle catalog. Slice 1 adds the sim itself (`createWorld`,
 * `step`, physics/spawner/collision/scoring) and re-exports it from here.
 */

export type {
  Vec2,
  GameStatus,
  ObstacleKind,
  ObstacleDef,
  Obstacle,
  BoardState,
  InputIntent,
  WorldState,
  SimConfig,
  RngState,
} from './types.js';

export {
  seedRng,
  nextFloat,
  nextRange,
  nextInt,
  nextWeightedIndex,
} from './rng.js';

export { type Clock, ManualClock } from './clock.js';

export {
  CONTENT_VERSION,
  DEFAULT_CONFIG,
  DEFAULT_OBSTACLES,
} from './config.js';
