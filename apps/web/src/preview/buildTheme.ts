/**
 * Pure knob → `RenderTheme` derivation for the preview harness.
 *
 * Production-truthful: this NEVER forks the renderer's theme. It clones
 * `DEFAULT_THEME` (the one source of art-direction truth, exported by
 * `@skate/render-canvas`) and overlays the live knob values — spread + override,
 * never a hand-kept copy. The resulting `RenderTheme` is fed to the REAL
 * `createRenderer`, so what the harness shows is what the product would ship.
 *
 * Mirrors `buildConfig.ts` (the sim-side knob helper): a small, pure function
 * worth a unit test (see `buildTheme.test.ts`) — the spread/override discipline
 * is easy to get subtly wrong (e.g. dropping a palette key the renderer reads).
 */

import { DEFAULT_THEME, type RenderTheme } from '@skate/render-canvas';

/**
 * The live, inspectable art knobs the panel exposes over a `RenderTheme`.
 *
 * Only the palette entries + parallax/layout numbers worth tuning live here;
 * every key NOT named falls back to `DEFAULT_THEME` via the spread in
 * `buildTheme`, so the renderer always receives a complete theme.
 */
export interface ThemeKnobs {
  // ── Palette (the key entries) ──
  readonly skyTop: string;
  readonly skyBottom: string;
  readonly hillsFar: string;
  readonly hillsNear: string;
  readonly buildings: string;
  readonly ground: string;
  readonly groundEdge: string;
  readonly board: string;
  readonly riderAccent: string;
  readonly obstacle: string;
  readonly cone: string;
  // ── Parallax ──
  readonly farFactor: number;
  readonly farAmplitude: number;
  readonly nearFactor: number;
  readonly nearAmplitude: number;
  readonly buildingFactor: number;
  // ── Layout ──
  readonly groundLineRatio: number;
  readonly groundStripeSpan: number;
}

/** Default theme knobs, read straight from the production `DEFAULT_THEME`. */
export function defaultThemeKnobs(): ThemeKnobs {
  const { palette, parallax } = DEFAULT_THEME;
  return {
    skyTop: palette.skyTop,
    skyBottom: palette.skyBottom,
    hillsFar: palette.hillsFar,
    hillsNear: palette.hillsNear,
    buildings: palette.buildings,
    ground: palette.ground,
    groundEdge: palette.groundEdge,
    board: palette.board,
    riderAccent: palette.riderAccent,
    obstacle: palette.obstacle,
    cone: palette.cone,
    farFactor: parallax.farFactor,
    farAmplitude: parallax.farAmplitude,
    nearFactor: parallax.nearFactor,
    nearAmplitude: parallax.nearAmplitude,
    buildingFactor: parallax.buildingFactor,
    groundLineRatio: DEFAULT_THEME.groundLineRatio,
    groundStripeSpan: DEFAULT_THEME.groundStripeSpan,
  };
}

/**
 * Build a derived `RenderTheme` from the knobs. Pure (no I/O, no clock): the
 * same knobs always yield the same theme.
 *
 * Discipline: spread `DEFAULT_THEME` (and its nested `palette`/`parallax`) first,
 * then overlay the tuned keys — so any theme field the harness does NOT expose
 * still carries the production default. Never fork the theme object.
 */
export function buildTheme(knobs: ThemeKnobs): RenderTheme {
  return {
    ...DEFAULT_THEME,
    palette: {
      ...DEFAULT_THEME.palette,
      skyTop: knobs.skyTop,
      skyBottom: knobs.skyBottom,
      hillsFar: knobs.hillsFar,
      hillsNear: knobs.hillsNear,
      buildings: knobs.buildings,
      ground: knobs.ground,
      groundEdge: knobs.groundEdge,
      board: knobs.board,
      riderAccent: knobs.riderAccent,
      obstacle: knobs.obstacle,
      cone: knobs.cone,
    },
    parallax: {
      ...DEFAULT_THEME.parallax,
      farFactor: knobs.farFactor,
      farAmplitude: knobs.farAmplitude,
      nearFactor: knobs.nearFactor,
      nearAmplitude: knobs.nearAmplitude,
      buildingFactor: knobs.buildingFactor,
    },
    groundLineRatio: knobs.groundLineRatio,
    groundStripeSpan: knobs.groundStripeSpan,
  };
}

/**
 * A named preset = a full set of `ThemeKnobs` derived from `DEFAULT_THEME`.
 * Presets only override colors/parallax/layout; they are never a separate theme
 * fork (each spreads `defaultThemeKnobs()` so unspecified keys stay default).
 */
export interface ThemePreset {
  readonly id: string;
  readonly label: string;
  readonly knobs: ThemeKnobs;
}

/** Built-in presets. "Default" is the identity (the on-disk DEFAULT_THEME). */
export function themePresets(): readonly ThemePreset[] {
  const base = defaultThemeKnobs();
  return [
    { id: 'default', label: 'Default', knobs: base },
    {
      id: 'night',
      label: 'Night',
      knobs: {
        ...base,
        skyTop: '#05060f',
        skyBottom: '#13203b',
        hillsFar: '#0c1426',
        hillsNear: '#101d38',
        buildings: '#070d1c',
        ground: '#0f0d14',
        groundEdge: '#34304a',
        riderAccent: '#7ad7ff',
        cone: '#ffb347',
        farAmplitude: base.farAmplitude * 1.2,
      },
    },
    {
      id: 'sunset',
      label: 'Sunset',
      knobs: {
        ...base,
        skyTop: '#3a1d5c',
        skyBottom: '#ff8b5e',
        hillsFar: '#7b3f6e',
        hillsNear: '#a85a63',
        buildings: '#321a3e',
        ground: '#2c1c22',
        groundEdge: '#8a6048',
        board: '#ffd23a',
        riderAccent: '#ff4d6d',
        cone: '#ff5e3a',
      },
    },
  ];
}
