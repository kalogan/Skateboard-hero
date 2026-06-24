# Deploying Skateboard Hero (Vercel)

Auto-deploy is **GitHub-integration based**: once the repo is connected to a
Vercel project, every push to a branch produces a Preview deploy and every push
to the production branch produces a Production deploy. The repo already carries
the build config (`vercel.json`), so no per-deploy setup is needed.

## One-time connection (Director — needs Vercel credentials)

This is the only step the Architect can't do for you (it touches your Vercel
account — a §8 safety boundary). Pick either path:

### A. Dashboard (simplest)
1. <https://vercel.com/new> → **Import** `kalogan/skateboard-hero`.
2. Leave **Root Directory** as the repo root (`vercel.json` handles the rest).
3. Framework preset: **Other** (config sets build/install/output explicitly).
4. **Deploy.** Vercel now auto-builds on every push.

### B. CLI
```bash
npm i -g vercel
vercel link          # connect this repo to a Vercel project
vercel --prod        # first production deploy
```

## What `vercel.json` does
| Field | Value | Why |
|---|---|---|
| `installCommand` | `pnpm install --frozen-lockfile` | pnpm workspace, reproducible install |
| `buildCommand` | `pnpm --filter @skate/web build` | build only the web app from the monorepo |
| `outputDirectory` | `apps/web/dist` | Vite's static output |
| `rewrites` | all → `/index.html` | SPA fallback (safe even single-page) |
| `github.silent` | `true` | no PR comment spam from the bot |

## Production branch
By default Vercel treats the repo's default branch as Production. Development
currently happens on `claude/skateboard-game-scaffold-mujjsd`; pushes there get
**Preview** URLs. Promote to Production by merging to the default branch (or set
the Production Branch in Vercel project settings).

## Verify a deploy
- Preview/Production URL loads the canvas (no blank page, no console errors).
- This mirrors the Architect's local **runtime smoke** — never let a green CI
  gate stand in for actually loading the deployed page.
