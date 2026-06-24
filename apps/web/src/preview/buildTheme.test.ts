/**
 * Unit test for the pure knob → RenderTheme derivation. Guards the
 * production-truthful contract: the theme is built by spreading DEFAULT_THEME
 * (never forked), identity knobs reproduce the on-disk default theme, every
 * palette key the renderer reads survives an override, and presets derive from
 * the default rather than inventing a divergent theme.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME } from '@skate/render-canvas';
import {
  buildTheme,
  defaultThemeKnobs,
  themePresets,
  type ThemeKnobs,
} from './buildTheme.js';

describe('buildTheme', () => {
  it('identity knobs reproduce the on-disk DEFAULT_THEME', () => {
    const theme = buildTheme(defaultThemeKnobs());
    expect(theme).toEqual(DEFAULT_THEME);
  });

  it('keeps every DEFAULT_THEME palette key (no dropped fields)', () => {
    const theme = buildTheme(defaultThemeKnobs());
    expect(Object.keys(theme.palette).sort()).toEqual(
      Object.keys(DEFAULT_THEME.palette).sort(),
    );
    expect(Object.keys(theme.parallax).sort()).toEqual(
      Object.keys(DEFAULT_THEME.parallax).sort(),
    );
  });

  it('overrides a palette color but leaves un-exposed keys at default', () => {
    const knobs: ThemeKnobs = { ...defaultThemeKnobs(), ground: '#abcdef' };
    const theme = buildTheme(knobs);
    expect(theme.palette.ground).toBe('#abcdef');
    // A palette key the knobs never expose still carries the default.
    expect(theme.palette.boardGrip).toBe(DEFAULT_THEME.palette.boardGrip);
    expect(theme.palette.bailTint).toBe(DEFAULT_THEME.palette.bailTint);
  });

  it('overrides parallax factors + amplitudes, keeping spans at default', () => {
    const theme = buildTheme({
      ...defaultThemeKnobs(),
      farFactor: 0.5,
      nearFactor: 0.6,
      buildingFactor: 0.7,
      farAmplitude: 0.9,
      nearAmplitude: 0.8,
    });
    expect(theme.parallax.farFactor).toBe(0.5);
    expect(theme.parallax.nearFactor).toBe(0.6);
    expect(theme.parallax.buildingFactor).toBe(0.7);
    expect(theme.parallax.farAmplitude).toBe(0.9);
    expect(theme.parallax.nearAmplitude).toBe(0.8);
    // Spans are not exposed as knobs; they keep the default.
    expect(theme.parallax.hillSpan).toBe(DEFAULT_THEME.parallax.hillSpan);
    expect(theme.parallax.buildingSpan).toBe(DEFAULT_THEME.parallax.buildingSpan);
  });

  it('overrides ground line ratio + stripe span', () => {
    const theme = buildTheme({
      ...defaultThemeKnobs(),
      groundLineRatio: 0.5,
      groundStripeSpan: 100,
    });
    expect(theme.groundLineRatio).toBe(0.5);
    expect(theme.groundStripeSpan).toBe(100);
  });

  it('does not mutate DEFAULT_THEME', () => {
    const before = JSON.stringify(DEFAULT_THEME);
    buildTheme({ ...defaultThemeKnobs(), ground: '#000000', farFactor: 9 });
    expect(JSON.stringify(DEFAULT_THEME)).toBe(before);
  });

  it('exposes a Default preset that is the identity theme', () => {
    const def = themePresets().find((p) => p.id === 'default');
    expect(def).toBeDefined();
    expect(buildTheme(def!.knobs)).toEqual(DEFAULT_THEME);
  });

  it('presets derive from the default theme (complete, valid themes)', () => {
    for (const preset of themePresets()) {
      const theme = buildTheme(preset.knobs);
      // Every palette/parallax key present → a complete theme, not a fork.
      expect(Object.keys(theme.palette).sort()).toEqual(
        Object.keys(DEFAULT_THEME.palette).sort(),
      );
      expect(Object.keys(theme.parallax).sort()).toEqual(
        Object.keys(DEFAULT_THEME.parallax).sort(),
      );
    }
    // Night/Sunset actually differ from the default look.
    const night = themePresets().find((p) => p.id === 'night')!;
    expect(buildTheme(night.knobs)).not.toEqual(DEFAULT_THEME);
  });
});
