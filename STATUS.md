# STATUS — durable memory

> Updated every slice (pipeline §G: write → persist → notify). A cold context
> (or a different agent) should be able to resume from this file alone.

## Now
- **Wave A / Slice 0 — Scaffold:** IN PROGRESS (Architect). Monorepo, tooling,
  arch-guard, gate, CI, Vercel config, type contract + Rng/Clock, docs.

## Done
- _(none yet — slice 0 lands first)_

## Running (builders)
- _(none — fan-out begins after slice 0 is green + pushed)_

## Queued
- **Slice 1 — Core sim** (`packages/core/src/**`): `createWorld`, `step`,
  physics, spawner, collision, bail, scoring, difficulty ramp, golden fixture.
- **Slice 2 — Canvas renderer** (`packages/render-canvas/src/**`): draw board,
  obstacles, ground, parallax, trick spin, bail — from the type contract.
- **Slice 3 — App assembly** (`apps/web/src/**`): input, fixed-timestep loop,
  HUD/start/game-over, high-score; + Architect runtime smoke.

## Last known-green gate counts
- _pending first gate run_

## Active constraints
See `CLAUDE.md` §constraints. Enforced by eslint arch-guard + `lint:content` +
golden fixture, all run by `gate.sh`.

## Deploy
Vercel auto-deploy via `vercel.json`; one-time connect is the Director's
(credentialed) step — see `docs/DEPLOY.md`.
