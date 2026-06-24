# Skateboard Hero — Architect/Builder operating manual

Built with the **Architect–Builder Pipeline**. One Director (human), one
Architect (lead agent: plans, dispatches, **independently verifies**), many
Builders (background workers, one disjoint slice each). **Nothing a builder
reports is trusted until the Architect re-runs the gate with real exit codes.**

## The game
Endless one-button dodge-runner. The board auto-rolls forward; obstacles
approach; the player **taps (or presses Space) to ollie**; timing is the skill;
contact = bail. Score = distance + landed air-trick bonuses. 2D Canvas, mobile-first.

## Architecture (authoritative core ⟂ cosmetic shells)
- `packages/core` — **authoritative, pure, deterministic** sim. Public entry
  `@skate/core`; internals are not a contract.
- `packages/render-canvas` — **thin, cosmetic** Canvas2D renderer. Reads
  `WorldState`, never mutates it.
- `apps/web` — Vite app: input → `InputIntent`, fixed-timestep loop, renderer
  mount, HUD, high-score.

## Non-negotiable constraints (gated, not hoped-for)
1. **Core is engine-agnostic** — `packages/core` must not import the renderer,
   the app, or any DOM/Canvas symbol. *(eslint arch-guard)*
2. **Core is deterministic** — no `Math.random`, no `Date.now`/`new Date`/
   `performance.now`. RNG state is threaded through `WorldState`; the clock is
   injected. *(eslint arch-guard + golden replay fixture)*
3. **Core is authoritative** — renderer and input are optimistic-cosmetic; they
   never mutate sim state.
4. **Fixed-timestep sim** — `step(world, input, config)` is pure and advances by
   `config.dt`; decoupled from render frame rate (reproducible runs).
5. **Every system ships tests; content is versioned** — the obstacle catalog is
   validated by `pnpm lint:content` and pinned by the golden fixture.

A rule that isn't in the gate will be violated. If you add a rule, gate it.

## The gate (run it yourself — `bash gate.sh`)
`typecheck · lint (+arch-guard) · lint:content · test (record counts) · build`,
each `timeout`-wrapped with real exit codes. Exit 124 = HUNG (investigate), not
a pass. All must be 0 before a slice counts as done.

## Git + safety discipline
- **Targeted `git add <file>` only** — never `git add .`/`-A` (parallel builders
  share the tree; a broad add sweeps another's files).
- Commit per layer, before the final gate. No `reset --hard`, force-push, or
  history rewrite while a parallel builder is live.
- Branch: `claude/skateboard-game-scaffold-mujjsd`.
- Commit trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## Stop-and-ask boundaries (§8 — never unattended)
Force-push / hard-reset; anything external or credentialed (incl. connecting or
deploying to Vercel, see `docs/DEPLOY.md`); **opening a PR** (only on explicit
request); changing auth/secrets.

## Durable state
`STATUS.md` (what's done/running/queued + last green gate counts), `ROADMAP.md`
(slice ordering), `REVIEW_QUEUE.md` (taste items for the Director). Update
`STATUS.md` every slice so a cold context can resume.
