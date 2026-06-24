# STATUS — durable memory

> Updated every slice (pipeline §G: write → persist → notify). A cold context
> (or a different agent) should be able to resume from this file alone.

## Now
- **Wave B fan-out:** dispatching Slice 1 (core sim) + Slice 2 (renderer) as
  disjoint background builders.

## Done
- **Wave A / Slice 0 — Scaffold:** ✅ green + pushed. Monorepo, ESLint
  arch-guards (verified firing), `gate.sh`, CI, Vercel auto-deploy config,
  `@skate/core` type contract + deterministic Rng/Clock, pipeline docs.

## Running (builders)
- _(dispatching Slice 1 + Slice 2)_

## Queued
- **Slice 1 — Core sim** (`packages/core/src/**`): `createWorld`, `step`,
  physics, spawner, collision, bail, scoring, difficulty ramp, golden fixture.
- **Slice 2 — Canvas renderer** (`packages/render-canvas/src/**`): draw board,
  obstacles, ground, parallax, trick spin, bail — from the type contract.
- **Slice 3 — App assembly** (`apps/web/src/**`): input, fixed-timestep loop,
  HUD/start/game-over, high-score; + Architect runtime smoke.

## Last known-green gate counts
- Slice 0: `typecheck=0 lint=0 content=0 test=0 build=0` · core 8 tests (2 files)

## Active constraints
See `CLAUDE.md` §constraints. Enforced by eslint arch-guard + `lint:content` +
golden fixture, all run by `gate.sh`.

## Deploy
Vercel auto-deploy via `vercel.json`; one-time connect is the Director's
(credentialed) step — see `docs/DEPLOY.md`.
