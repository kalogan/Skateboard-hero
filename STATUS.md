# STATUS — durable memory

> Updated every slice (pipeline §G: write → persist → notify). A cold context
> (or a different agent) should be able to resume from this file alone.

## Now
- **Feature wave COMPLETE** ✅ — SFX + ambient audio, scored named tricks, and a
  local top-10 leaderboard, all integrated. Gate green (93 tests) + runtime-smoke
  green (start→play→bail→initials→retry, no console errors). Playable: `pnpm dev`.

## Done (feature wave)
- **Audio** (`apps/web/src/audio/**`): procedural Web Audio — ollie/land/trick/bail
  SFX + ambient bed, mute toggle, injectable context. Wired into the loop by event.
- **Tricks** (`packages/core` + `render-canvas`): deterministic per-ollie trick
  selection, per-trick scoring (ollie 100 → 360-shuv 400), distinct visuals,
  golden fixture regenerated.
- **Leaderboard** (`apps/web/src/leaderboard.ts` + `ui/**`): versioned local top-10
  with touch initials entry; replaces the old single-best `storage.ts` (removed).

## Done (earlier)
- **Wave C / Slice 3 — App assembly:** ✅ Architect-built + verified. One-button
  input (tap/Space → ollie), pure fixed-timestep accumulator loop, phase machine
  (start→playing→over), DOM HUD, versioned localStorage high-score, restart.
  Runtime smoke harness (`pnpm smoke`, Playwright) drives the real built app.
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
- Feature wave (Architect-verified): `typecheck=0 lint=0 content=0 test=0 build=0`
  · core **37** · render-canvas **14** · web **42** = **93** tests.
- Runtime smoke: ✅ start→play→bail→initials→retry, zero console/page errors.

## Active constraints
See `CLAUDE.md` §constraints. Enforced by eslint arch-guard + `lint:content` +
golden fixture, all run by `gate.sh`.

## Deploy
Vercel auto-deploy via `vercel.json`; one-time connect is the Director's
(credentialed) step — see `docs/DEPLOY.md`.
