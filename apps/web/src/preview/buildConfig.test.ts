/**
 * Unit test for the pure knob → SimConfig derivation. Guards the
 * production-truthful contract: obstacle scaling maps over DEFAULT_OBSTACLES
 * (never forks it), identity knobs reproduce the on-disk defaults, and density
 * keeps min <= max.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, DEFAULT_OBSTACLES, DEFAULT_TRICKS } from '@skate/core';
import { buildConfig, defaultKnobs, IDENTITY_SEED } from './buildConfig.js';

describe('buildConfig', () => {
  it('identity knobs reproduce the on-disk defaults', () => {
    const cfg = buildConfig(defaultKnobs());
    expect(cfg.baseSpeed).toBe(DEFAULT_CONFIG.baseSpeed);
    expect(cfg.maxSpeed).toBe(DEFAULT_CONFIG.maxSpeed);
    expect(cfg.gravity).toBe(DEFAULT_CONFIG.gravity);
    expect(cfg.ollieImpulse).toBe(DEFAULT_CONFIG.ollieImpulse);
    expect(cfg.spawnGapMin).toBe(DEFAULT_CONFIG.spawnGapMin);
    expect(cfg.spawnGapMax).toBe(DEFAULT_CONFIG.spawnGapMax);
    // Obstacle footprints unchanged at size 1.
    expect(cfg.obstacles.map((o) => [o.width, o.height])).toEqual(
      DEFAULT_OBSTACLES.map((o) => [o.width, o.height]),
    );
    // Trick points unchanged.
    expect(cfg.tricks.map((t) => t.points)).toEqual(
      DEFAULT_TRICKS.map((t) => t.points),
    );
  });

  it('identity seed is 0 (reproduces the production artifact)', () => {
    expect(defaultKnobs().seed).toBe(IDENTITY_SEED);
    expect(IDENTITY_SEED).toBe(0);
  });

  it('scales every obstacle by enemySize without forking the catalog', () => {
    const cfg = buildConfig({ ...defaultKnobs(), enemySize: 2 });
    expect(cfg.obstacles).toHaveLength(DEFAULT_OBSTACLES.length);
    cfg.obstacles.forEach((o, i) => {
      const base = DEFAULT_OBSTACLES[i]!;
      expect(o.kind).toBe(base.kind);
      expect(o.weight).toBe(base.weight);
      expect(o.width).toBe(Math.round(base.width * 2));
      expect(o.height).toBe(Math.round(base.height * 2));
    });
  });

  it('density > 1 tightens the spawn gap, keeping min <= max', () => {
    const cfg = buildConfig({ ...defaultKnobs(), enemyDensity: 2 });
    expect(cfg.spawnGapMin).toBeLessThan(DEFAULT_CONFIG.spawnGapMin);
    expect(cfg.spawnGapMin).toBeLessThanOrEqual(cfg.spawnGapMax);
  });

  it('density < 1 widens the spawn gap', () => {
    const cfg = buildConfig({ ...defaultKnobs(), enemyDensity: 0.5 });
    expect(cfg.spawnGapMin).toBeGreaterThan(DEFAULT_CONFIG.spawnGapMin);
    expect(cfg.spawnGapMin).toBeLessThanOrEqual(cfg.spawnGapMax);
  });

  it('overrides per-trick points but leaves others at default', () => {
    const cfg = buildConfig({
      ...defaultKnobs(),
      trickPoints: { ollie: 999 },
    });
    const ollie = cfg.tricks.find((t) => t.id === 'ollie')!;
    expect(ollie.points).toBe(999);
    const kickflip = cfg.tricks.find((t) => t.id === 'kickflip')!;
    const baseKick = DEFAULT_TRICKS.find((t) => t.id === 'kickflip')!;
    expect(kickflip.points).toBe(baseKick.points);
  });

  it('clamps maxSpeed to be >= baseSpeed', () => {
    const cfg = buildConfig({
      ...defaultKnobs(),
      baseSpeed: 500,
      maxSpeed: 100,
    });
    expect(cfg.maxSpeed).toBeGreaterThanOrEqual(cfg.baseSpeed);
  });
});
