/**
 * Content lint (pipeline §B: "always run content/data lint — easiest to skip,
 * cheapest to catch"). Validates the versioned obstacle + trick catalogs so a
 * malformed content edit fails the gate instead of shipping a broken table.
 *
 * Run: `pnpm lint:content` (tsx). Exit 0 = clean, exit 1 = violations.
 */

import {
  CONTENT_VERSION,
  DEFAULT_OBSTACLES,
  DEFAULT_TRICKS,
  type ObstacleDef,
  type ObstacleKind,
  type TrickDef,
  type TrickFlipAxis,
  type TrickGesture,
} from '@skate/core';

const VALID_KINDS: readonly ObstacleKind[] = ['cone', 'rail', 'crack', 'bench'];
const VALID_FLIP_AXES: readonly TrickFlipAxis[] = ['none', 'kick', 'shuv'];
const VALID_GESTURES: readonly TrickGesture[] = ['tap', 'up', 'down', 'left', 'right', 'doubleTap'];

const errors: string[] = [];

function check(condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

check(
  Number.isInteger(CONTENT_VERSION) && CONTENT_VERSION > 0,
  `CONTENT_VERSION must be a positive integer, got ${String(CONTENT_VERSION)}`,
);

check(DEFAULT_OBSTACLES.length > 0, 'obstacle catalog must not be empty');

const seenIds = new Set<string>();
for (const [i, def] of DEFAULT_OBSTACLES.entries()) {
  const where = `obstacle[${i}] (${def.id ?? '<no id>'})`;
  check(typeof def.id === 'string' && def.id.length > 0, `${where}: id must be a non-empty string`);
  check(!seenIds.has(def.id), `${where}: duplicate id "${def.id}"`);
  seenIds.add(def.id);
  check(
    VALID_KINDS.includes(def.kind),
    `${where}: invalid kind "${def.kind}" (expected one of ${VALID_KINDS.join(', ')})`,
  );
  check(def.width > 0, `${where}: width must be > 0`);
  check(def.height > 0, `${where}: height must be > 0`);
  check(def.weight > 0, `${where}: weight must be > 0`);
}

// ── Trick catalog ──
check(DEFAULT_TRICKS.length > 0, 'trick catalog must not be empty');

const seenTrickIds = new Set<string>();
const seenGestures = new Set<string>();
for (const [i, def] of DEFAULT_TRICKS.entries()) {
  const where = `trick[${i}] (${def.id ?? '<no id>'})`;
  check(typeof def.id === 'string' && def.id.length > 0, `${where}: id must be a non-empty string`);
  check(!seenTrickIds.has(def.id), `${where}: duplicate id "${def.id}"`);
  seenTrickIds.add(def.id);
  check(
    VALID_GESTURES.includes(def.gesture),
    `${where}: invalid gesture "${def.gesture}" (expected one of ${VALID_GESTURES.join(', ')})`,
  );
  check(
    !seenGestures.has(def.gesture),
    `${where}: gesture "${def.gesture}" already maps to another trick (must be unique)`,
  );
  seenGestures.add(def.gesture);
  check(typeof def.name === 'string' && def.name.length > 0, `${where}: name must be a non-empty string`);
  check(typeof def.points === 'number' && def.points > 0, `${where}: points must be > 0`);
  check(typeof def.weight === 'number' && def.weight > 0, `${where}: weight must be > 0`);
  check(
    VALID_FLIP_AXES.includes(def.flipAxis),
    `${where}: invalid flipAxis "${def.flipAxis}" (expected one of ${VALID_FLIP_AXES.join(', ')})`,
  );
  check(Number.isFinite(def.flipTurns) && def.flipTurns >= 0, `${where}: flipTurns must be >= 0`);
  check(Number.isFinite(def.spinTurns) && def.spinTurns >= 0, `${where}: spinTurns must be >= 0`);
  check(def.spinDir === 1 || def.spinDir === -1, `${where}: spinDir must be 1 or -1`);
}

// Surface unused imports defensively so tsx/tsc flag drift in the type contract.
const _typecheck: ObstacleDef = DEFAULT_OBSTACLES[0]!;
void _typecheck;
const _typecheckTrick: TrickDef = DEFAULT_TRICKS[0]!;
void _typecheckTrick;

if (errors.length > 0) {
  console.error(`content lint: ${errors.length} violation(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `content lint: ok (version ${CONTENT_VERSION}, ${DEFAULT_OBSTACLES.length} obstacles, ${DEFAULT_TRICKS.length} tricks)`,
);
