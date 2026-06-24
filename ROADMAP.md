# ROADMAP

Slices are sequenced by dependency and kept disjoint by file surface so the
independent ones fan out in parallel (pipeline §2).

## Wave A — foundation (serial)
- [ ] **Slice 0 — Scaffold** · surface: repo root + package skeletons
  Monorepo, TS/Vite/Vitest/ESLint, arch-guard, `gate.sh`, CI, Vercel config,
  the `@skate/core` type contract + deterministic Rng/Clock, pipeline docs.
  *Blocks everything.*

## Wave B — parallel (disjoint surfaces)
- [ ] **Slice 1 — Core sim** · surface: `packages/core/src/**`
  Pure fixed-timestep `step()`: board physics (roll + gravity + ollie arc),
  seeded obstacle spawner, AABB collision, bail/fail, scoring (distance +
  trick bonus), difficulty ramp. Golden replay fixture (seed → snapshot).
  Heaviest test surface.
- [ ] **Slice 2 — Canvas renderer** · surface: `packages/render-canvas/src/**`
  Draw `WorldState`: board + trick spin, obstacles, scrolling ground, parallax
  backdrop, bail state. Cosmetic only; codes against the Slice-0 contract.

## Wave C — assembly (serial; integrates B)
- [ ] **Slice 3 — App** · surface: `apps/web/src/**`
  Pointer/touch + keyboard input → `InputIntent`; fixed-timestep accumulator
  loop driving core; mount renderer; HUD (score/best), start + game-over
  screens; versioned `localStorage` high-score; restart. Then Architect
  **runtime smoke**: boot the built app on an alt port, drive a run,
  screenshot, scan console.

## Backlog (post-MVP)
- Audio/SFX, juice (screen shake, particles), more obstacle kinds, ducking/
  lanes (see `REVIEW_QUEUE.md`), difficulty curve tuning, leaderboard.
