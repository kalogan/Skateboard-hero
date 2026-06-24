/**
 * Public type contract for the Skateboard Hero simulation.
 *
 * This is the seam every layer codes against:
 *  - the core sim (Slice 1) produces and mutates these via a pure `step()`,
 *  - the renderer (Slice 2) reads `WorldState` and draws it (never mutates),
 *  - the app (Slice 3) feeds `InputIntent` in and renders `WorldState` out.
 *
 * Keep this engine-agnostic: no DOM, no Canvas, no timers. Units are in a
 * virtual coordinate space (the renderer maps them to pixels). +x is forward
 * (the direction the skater travels); +y is up.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** High-level lifecycle of a single run. */
export type GameStatus = 'ready' | 'rolling' | 'bailed';

/**
 * Kinds of obstacle. One verb (ollie) clears all of them; the skill is timing.
 * The catalog of concrete definitions lives in content (Slice 1) and is
 * validated by `lint:content`.
 */
export type ObstacleKind = 'cone' | 'rail' | 'crack' | 'bench';

/**
 * The flip axis of a trick — what the board does relative to its rolling axis
 * while airborne. The renderer maps each to a distinct visual:
 *  - `'none'`  — no board flip (e.g. a plain ollie / shuvit; spin only).
 *  - `'kick'`  — flips along the board's long (length) axis toward the heel side
 *    when negative / toe side when positive (kickflip / heelflip family).
 *  - `'shuv'`  — the board spins flat about the vertical axis (pop shuvit / 360
 *    shuvit family); no inversion, just yaw rotation.
 */
export type TrickFlipAxis = 'none' | 'kick' | 'shuv';

/**
 * Identifiers for the named tricks. The concrete catalog of `TrickDef`s lives in
 * content (`config.ts`) and is validated by `lint:content`. Kept as a string so
 * content can grow tricks without a type churn, but the default set is enumerated
 * here for ergonomics.
 */
export type TrickId = 'ollie' | 'kickflip' | 'heelflip' | 'shuv360' | 'popshuv';

/**
 * A content-authored trick template (catalog entry). Versioned content:
 * `lint:content` validates every def, the golden fixture pins selection/scoring.
 *
 * Visual params are purely cosmetic hints for the renderer — the core only reads
 * `points` and `weight`. `spinTurns`/`flipTurns` are full revolutions completed
 * over one (normalized) airborne arc; `spinDir` is the sign of the yaw spin.
 */
export interface TrickDef {
  readonly id: TrickId;
  /** Human-readable name (HUD / audio cues). */
  readonly name: string;
  /** Points awarded on a CLEAN landing. Must be > 0. */
  readonly points: number;
  /** Relative selection weight (higher = more common). Must be > 0. */
  readonly weight: number;
  /** What the board does in the air (renderer visual). */
  readonly flipAxis: TrickFlipAxis;
  /** Full board flips about `flipAxis` over the arc (>= 0). */
  readonly flipTurns: number;
  /** Full board yaw spins over the arc (>= 0). */
  readonly spinTurns: number;
  /** Sign of the yaw spin direction: +1 or -1. */
  readonly spinDir: 1 | -1;
}

/**
 * A content-authored obstacle template (the catalog entry). Versioned content:
 * `lint:content` validates every def, the golden fixture pins spawn behaviour.
 */
export interface ObstacleDef {
  readonly id: string;
  readonly kind: ObstacleKind;
  /** Footprint in world units. */
  readonly width: number;
  readonly height: number;
  /** Relative spawn weight (higher = more common). Must be > 0. */
  readonly weight: number;
}

/** A live obstacle instance in the world. */
export interface Obstacle {
  readonly kind: ObstacleKind;
  /** Leading-edge world x position (decreases as it approaches the skater). */
  readonly x: number;
  readonly width: number;
  readonly height: number;
  /** True once the skater has cleared it and it has been scored. */
  readonly cleared: boolean;
}

/** The skater + board. The board's screen x is fixed; the world scrolls past. */
export interface BoardState {
  /** Height of the board above the ground (0 = grounded). */
  readonly y: number;
  /** Vertical velocity (units/sec). */
  readonly vy: number;
  /** True while the wheels are on the ground. */
  readonly grounded: boolean;
  /** Board rotation in radians, for the air-trick spin (cosmetic-ish). */
  readonly rotation: number;
  /**
   * The trick selected for the current airborne hop (deterministically chosen
   * from the catalog on each ollie), or `null` while grounded. The renderer and
   * audio read this to draw/announce the trick; scoring reads its `points`.
   */
  readonly trick: TrickId | null;
}

/** A single tick's worth of player intent. One button → one verb. */
export interface InputIntent {
  /** The player wants to ollie (tap / Space) this tick. */
  readonly ollie: boolean;
}

/** The full, serializable world. `step()` maps one of these to the next. */
export interface WorldState {
  readonly status: GameStatus;
  /** Simulated time elapsed this run, in seconds. */
  readonly time: number;
  /** Distance travelled in world units (drives the distance score). */
  readonly distance: number;
  /** Current forward speed (units/sec); ramps with distance. */
  readonly speed: number;
  /** Total score = floor(distance) + sum of landed trick points. */
  readonly score: number;
  /** Air tricks landed cleanly this run. */
  readonly tricks: number;
  /** Sum of points from every trick landed cleanly this run. */
  readonly trickScore: number;
  readonly board: BoardState;
  readonly obstacles: readonly Obstacle[];
  /** Seeded RNG cursor — carried in-state so a run is fully replayable. */
  readonly rng: RngState;
  /** World units until the next obstacle spawn is considered. */
  readonly nextSpawnIn: number;
}

/**
 * Tunable simulation constants. Injected into `step()` so the sim never reads
 * globals — same (world, input, config) always yields the same next world.
 */
export interface SimConfig {
  /** Fixed timestep, seconds. The app accumulates real time into N of these. */
  readonly dt: number;
  /** Downward acceleration, units/sec^2. */
  readonly gravity: number;
  /** Upward velocity imparted by an ollie, units/sec. */
  readonly ollieImpulse: number;
  /** Forward speed at distance 0, units/sec. */
  readonly baseSpeed: number;
  /** Speed gained per world unit travelled (difficulty ramp). */
  readonly speedRamp: number;
  /** Maximum forward speed, units/sec. */
  readonly maxSpeed: number;
  /** Ground plane y in world units (board.y is measured above this). */
  readonly groundY: number;
  /** Board's fixed world-x (obstacles are tested for overlap against this). */
  readonly boardX: number;
  /** Board collision footprint. */
  readonly boardWidth: number;
  readonly boardHeight: number;
  /** Spawn spacing window, world units (min/max gap between obstacles). */
  readonly spawnGapMin: number;
  readonly spawnGapMax: number;
  /** The authorable obstacle catalog. */
  readonly obstacles: readonly ObstacleDef[];
  /**
   * The authorable trick catalog. On each ollie the sim deterministically picks
   * one of these (weighted) and stores it on `board.trick`; a clean landing
   * awards its `points`. Must be non-empty.
   */
  readonly tricks: readonly TrickDef[];
}

/**
 * RNG state carried inside `WorldState`. It is just a 32-bit integer cursor;
 * see `rng.ts` for the pure advance functions. Keeping it in-state (rather than
 * a stateful injected object) is what makes golden-replay determinism trivial.
 */
export type RngState = number;
