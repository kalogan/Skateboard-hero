# STATUS — durable memory

> Updated every slice (pipeline §G: write → persist → notify). A cold context
> (or a different agent) should be able to resume from this file alone.

## Now
- **Wave C / Slice 3 — App assembly:** next (Architect): input → InputIntent,
  fixed-timestep loop, HUD/start/game-over, high-score, then runtime smoke.

## Done
- **Wave A / Slice 0 — Scaffold:** ✅ green + pushed.
- **Wave B / Slice 1 — Core sim:** ✅ Architect-verified green. Pure
  `createWorld`/`step`, ollie physics, seeded spawner, x-span+height collision,
  bail, distance+trick scoring, difficulty ramp, golden replay fixture (seed
  `0xC0FFEE`, 600 steps, byte-identical reproduction).
- **Wave B / Slice 2 — Canvas renderer:** ✅ Architect-verified green. Board +
  trick spin, per-kind obstacles, scrolling ground, parallax backdrop, bail tint.

## Running (builders)
- _(none — Wave B verified; Slice 3 is Architect-built)_

## Queued
- **Slice 3 — App assembly** (`apps/web/src/**`): input, fixed-timestep loop,
  HUD/start/game-over, high-score; + Architect runtime smoke.

## Last known-green gate counts
- After Wave B (Architect-verified): `typecheck=0 lint=0 content=0 test=0 build=0`
  · core **32** tests (4 files) · render-canvas **11** tests (1 file) = 43 total.

## Active constraints
See `CLAUDE.md` §constraints. Enforced by eslint arch-guard + `lint:content` +
golden fixture, all run by `gate.sh`.

## Deploy
Vercel auto-deploy via `vercel.json`; one-time connect is the Director's
(credentialed) step — see `docs/DEPLOY.md`.
