/**
 * Render theme — the cosmetic art knobs the renderer reads (colors, parallax,
 * ground line). Lives here, not in core: the sim is engine-agnostic and never
 * sees colors. `createRenderer` takes a `theme` (defaulting to `DEFAULT_THEME`);
 * the preview harness builds variations of it to tune look/feel live.
 */

export interface RenderPalette {
  readonly skyTop: string;
  readonly skyBottom: string;
  readonly hillsFar: string;
  readonly hillsNear: string;
  readonly buildings: string;
  readonly ground: string;
  readonly groundStripe: string;
  readonly groundEdge: string;
  readonly board: string;
  readonly boardGrip: string;
  readonly wheel: string;
  readonly rider: string;
  readonly riderAccent: string;
  readonly obstacle: string;
  readonly obstacleShadow: string;
  readonly cone: string;
  readonly coneStripe: string;
  readonly bailTint: string;
}

/** Parallax + scroll tuning. Factors scale `world.distance` per layer. */
export interface ParallaxTheme {
  readonly farFactor: number;
  readonly farAmplitude: number;
  readonly nearFactor: number;
  readonly nearAmplitude: number;
  readonly buildingFactor: number;
  readonly hillSpan: number;
  readonly buildingSpan: number;
}

export interface RenderTheme {
  readonly palette: RenderPalette;
  /** Ground line as a fraction of canvas height from the top (0..1). */
  readonly groundLineRatio: number;
  readonly parallax: ParallaxTheme;
  /** Spacing (px) of the scrolling ground speed-stripes. */
  readonly groundStripeSpan: number;
}

/** The default art direction (placeholder — tune via the preview harness). */
export const DEFAULT_THEME: RenderTheme = {
  palette: {
    skyTop: '#1b2a4a',
    skyBottom: '#3a5a86',
    hillsFar: '#2c3f63',
    hillsNear: '#24496b',
    buildings: '#1a2740',
    ground: '#2a2320',
    groundStripe: '#3a322c',
    groundEdge: '#6b5d4f',
    board: '#e8a13a',
    boardGrip: '#211b16',
    wheel: '#d8d8e0',
    rider: '#e8e8f0',
    riderAccent: '#ff5a7a',
    obstacle: '#c8d0dc',
    obstacleShadow: '#7c8696',
    cone: '#ff7a3c',
    coneStripe: '#ffe0c8',
    bailTint: 'rgba(20, 8, 8, 0.45)',
  },
  groundLineRatio: 0.78,
  parallax: {
    farFactor: 0.04,
    farAmplitude: 0.2,
    nearFactor: 0.08,
    nearAmplitude: 0.13,
    buildingFactor: 0.16,
    hillSpan: 220,
    buildingSpan: 90,
  },
  groundStripeSpan: 48,
};
