# REVIEW QUEUE — for the Director

Taste / feel / wording items surfaced instead of blocking (pipeline §G). The
Director drains this on their schedule; none of it blocks the gate.

## Open
- **Decide: Classic vs Lanes.** A/B both in `/preview` (game-mode toggle). The
  shipped game is still `'classic'`; once you pick, we wire the choice into the
  real app (input + start screen). Lane feel knobs: `laneShiftSpeed` (8), mercy
  collision (compares target lane — forgiving); switch to rounded `lateral` for a
  stricter feel. Lane jump is a plain hop (no trick/score) — could reward style.
- **Lane-mode art:** vertical view reuses flat backdrop (no parallax) + eyeballed
  constants (board at 82%, 600-unit look-ahead, 2.4× obstacle scale). Could move
  into `RenderTheme` for live tuning later.
- **Flick sensitivity:** `FLICK_DISTANCE_PX=24` / `FLICK_TIME_MS=400` in
  `apps/web/src/input.ts` — may feel too eager on small phones (accidental flicks);
  single-const tune. Double-tap window `DOUBLE_TAP_MS=300`.
- **Tre Flip juice:** the 500pt showpiece trick currently reuses the generic
  flip+spin visual; candidate for a unique trail/flash.
- **Art direction (now tunable in `/preview`):** `DEFAULT_THEME` in
  `packages/render-canvas/src/theme.ts` is placeholder — palette + parallax are
  yours to tune live in the harness (Default/Night/Sunset presets seed it). When
  you settle on a look, bake the chosen values into `DEFAULT_THEME`.
- **Sound design (placeholder):** ollie/land/trick/bail SFX frequencies+envelopes
  and the ambient bed (drone pitches, noise character, fades) are first-pass
  synth guesses. Per-trick audio is a pitch-hash, not a curated mapping.
- **Trick point balance + visuals:** point values (100/150/250/250/400) and weights
  are first guesses; kickflip vs heelflip differ only by roll-tilt sign (subtle).
  Candidates for a feel pass + richer art.
- **Leaderboard panel look/placement:** dark card + steppers; centering/backdrop is
  the integration's (currently a blurred full-screen overlay). Director's call.
- **One-button verb (Architect decision, confirm or redirect):** the single
  input is **tap/Space → ollie**; obstacles are all jumpable and skill is timing.
  Lane-switching and ducking were deferred. Change of heart? Flag it.
- **Difficulty feel:** speed ramp + spawn-gap values in `DEFAULT_CONFIG` are
  first-guess numbers — needs a playtest pass for "fun" (Slice 1 tunes, you judge).
- **Art direction:** placeholder shapes/colors in the renderer (Slice 2). Real
  look/feel (board style, palette, parallax mood) is a Director call.

## Resolved
- **Renderer theme seam** — `@skate/render-canvas` now takes a `RenderTheme`
  (palette + parallax + ground); `/preview` exposes live art knobs + presets.
