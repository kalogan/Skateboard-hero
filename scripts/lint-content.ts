/**
 * Content lint (pipeline §B: "always run content/data lint — easiest to skip,
 * cheapest to catch"). Validates the versioned obstacle catalog so a malformed
 * content edit fails the gate instead of shipping a broken spawn table.
 *
 * Run: `pnpm lint:content` (tsx). Exit 0 = clean, exit 1 = violations.
 */

import {
  CONTENT_VERSION,
  DEFAULT_OBSTACLES,
  type ObstacleDef,
  type ObstacleKind,
} from '@skate/core';

const VALID_KINDS: readonly ObstacleKind[] = ['cone', 'rail', 'crack', 'bench'];

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

// Surface unused import defensively so tsx/tsc flag drift in the type contract.
const _typecheck: ObstacleDef = DEFAULT_OBSTACLES[0]!;
void _typecheck;

if (errors.length > 0) {
  console.error(`content lint: ${errors.length} violation(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`content lint: ok (version ${CONTENT_VERSION}, ${DEFAULT_OBSTACLES.length} obstacles)`);
