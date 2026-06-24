# 🛹 Skateboard Hero

An endless, one-button skateboard dodge-runner for the web. The board auto-rolls
forward, obstacles approach, and you **tap to ollie** — timing is the whole game.
Score climbs with distance and the tricks you land.

**Tricks (skill-based):** a plain tap/Space is an **Ollie**. Flick a direction at
takeoff (touch swipe · mouse drag · arrows/WASD + Space) for a trick — ← Kickflip,
→ Tre Flip, ↑ 360 Shuvit, ↓ Pop Shuvit — and **double-tap in the air** for a
Heelflip. Harder tricks score more.

**Preview harness:** `/preview` is a production-truthful config workbench (skate
speed, jump, gravity, enemy size/density, points, gestures, SFX) for visual QA —
see [`docs/PREVIEW_HARNESS.md`](./docs/PREVIEW_HARNESS.md).

> Built with the [Architect–Builder Pipeline](./CLAUDE.md): a deterministic,
> authoritative core; thin cosmetic renderer + input; quality enforced by a
> gated set of constraints, not vigilance.

## Layout
```
packages/core           authoritative, pure, deterministic simulation (@skate/core)
packages/render-canvas  thin Canvas2D renderer (reads world, never mutates)
apps/web                Vite app: input + game loop + HUD
```

## Develop
```bash
pnpm install
pnpm dev          # run the web app (Vite)
bash gate.sh      # the full quality gate: typecheck · lint · content · test · build
```

## The gate
Every slice must pass `bash gate.sh` with real exit codes before it counts as
done. See [`CLAUDE.md`](./CLAUDE.md) for the constraints and discipline,
[`ROADMAP.md`](./ROADMAP.md) for what's planned, and [`STATUS.md`](./STATUS.md)
for live state.

## Deploy
Auto-deploys to Vercel on push once the repo is connected — see
[`docs/DEPLOY.md`](./docs/DEPLOY.md).
