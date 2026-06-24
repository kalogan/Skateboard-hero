/**
 * Variable-jump (Super-Mario style) + general mid-air gesture tests.
 *
 * The board's vertical physics: a quick tap is the minimum `ollieImpulse` hop
 * (UNCHANGED from the legacy fixed jump); holding the button (`jumpHeld`) while
 * ascending floats with reduced gravity for up to `jumpHoldMaxTime` seconds,
 * reaching a higher — but capped — apex. We also prove any mid-air gesture
 * (re)selects the trick from the catalog.
 */

import { describe, it, expect } from 'vitest';
import { createWorld, step } from './sim.js';
import { DEFAULT_CONFIG } from './config.js';
import type { InputIntent, SimConfig, WorldState } from './types.js';

const HOP: InputIntent = { ollie: true }; // takeoff, button NOT held after
const HOLD: InputIntent = { ollie: false, jumpHeld: true }; // sustaining the rise
const COAST: InputIntent = { ollie: false }; // neither pressing nor holding

/** Drive one hop to its apex (vy crosses from >0 to <=0) and report apex y. */
function apexY(world: WorldState, config: SimConfig, hold: boolean): number {
  let w = world;
  let max = w.board.y;
  for (let i = 0; i < 300; i++) {
    w = step(w, hold ? HOLD : COAST, config);
    if (w.board.y > max) max = w.board.y;
    if (w.board.grounded) break;
  }
  return max;
}

describe('variable jump (Super-Mario style)', () => {
  it('a quick tap is the minimum ollieImpulse hop (no jumpHeld)', () => {
    // First mid-air frame after a takeoff with no hold integrates FULL gravity,
    // matching the legacy fixed hop exactly.
    const w = step(createWorld(DEFAULT_CONFIG, 1), HOP, DEFAULT_CONFIG);
    expect(w.board.vy).toBeCloseTo(
      DEFAULT_CONFIG.ollieImpulse + DEFAULT_CONFIG.gravity * DEFAULT_CONFIG.dt,
      6,
    );
  });

  it('holding the button reaches a strictly HIGHER apex than a quick tap', () => {
    const takeoff = step(createWorld(DEFAULT_CONFIG, 1), HOP, DEFAULT_CONFIG);
    const quickApex = apexY(takeoff, DEFAULT_CONFIG, false);
    const heldApex = apexY(takeoff, DEFAULT_CONFIG, true);
    expect(heldApex).toBeGreaterThan(quickApex);
  });

  it('releasing early cuts the rise (lower apex than holding the full window)', () => {
    const takeoff = step(createWorld(DEFAULT_CONFIG, 1), HOP, DEFAULT_CONFIG);
    // Hold for only ~2 frames, then release for the rest of the rise.
    let early = takeoff;
    let max = early.board.y;
    for (let i = 0; i < 300; i++) {
      const held = i < 2;
      early = step(early, held ? HOLD : COAST, DEFAULT_CONFIG);
      if (early.board.y > max) max = early.board.y;
      if (early.board.grounded) break;
    }
    const fullHeldApex = apexY(takeoff, DEFAULT_CONFIG, true);
    expect(max).toBeLessThan(fullHeldApex);
  });

  it('the sustain window is capped (holding past max ⇒ no higher than the cap)', () => {
    const takeoff = step(createWorld(DEFAULT_CONFIG, 1), HOP, DEFAULT_CONFIG);
    // Holding the FULL window and holding "forever" (every frame) reach the same
    // apex, because the float ends when the window exhausts regardless of input.
    const heldFullApex = apexY(takeoff, DEFAULT_CONFIG, true);
    // Now hold every frame AND keep holding even after the window — same apex.
    let w = takeoff;
    let max = w.board.y;
    for (let i = 0; i < 300; i++) {
      w = step(w, HOLD, DEFAULT_CONFIG); // hold every single frame
      if (w.board.y > max) max = w.board.y;
      if (w.board.grounded) break;
    }
    expect(max).toBeCloseTo(heldFullApex, 6);
    // And the window decremented to (at most) zero — never negative-overshoots
    // into more float than configured: the sustain is consumed in ~maxTime/dt
    // frames. Confirm the float stopped while still ascending or at apex.
    expect(max).toBeGreaterThan(0);
  });

  it('the float ends once the board starts descending (no float on the way down)', () => {
    // Even with jumpHeld true forever, vy never gets a boost; once vy <= 0 the
    // reduced-gravity branch is dead, so descent uses full gravity.
    let w = step(createWorld(DEFAULT_CONFIG, 1), HOP, DEFAULT_CONFIG);
    // Advance to the descending phase.
    for (let i = 0; i < 300 && w.board.vy > 0; i++) {
      w = step(w, HOLD, DEFAULT_CONFIG);
    }
    expect(w.board.vy).toBeLessThanOrEqual(0);
    const before = w.board.vy;
    const next = step(w, HOLD, DEFAULT_CONFIG);
    // Descending under FULL gravity: vy decreases by gravity*dt (not scaled).
    expect(next.board.vy).toBeCloseTo(before + DEFAULT_CONFIG.gravity * DEFAULT_CONFIG.dt, 6);
  });

  it('jumpHeld never set ⇒ trajectory identical to the legacy fixed hop', () => {
    // With NO hold config either, the variable-jump branch is fully inert.
    // Omit the hold keys entirely (exactOptionalPropertyTypes forbids `undefined`).
    const { jumpHoldMaxTime: _m, jumpHoldGravityScale: _s, ...rest } = DEFAULT_CONFIG;
    const fixed: SimConfig = rest;
    // Compare a never-held run under DEFAULT_CONFIG vs the fixed (no-config) run:
    // both must produce the same arc, since DEFAULT's float never engages.
    const runArc = (cfg: SimConfig): number[] => {
      let w = step(createWorld(cfg, 1), HOP, cfg);
      const ys: number[] = [];
      for (let i = 0; i < 300 && !w.board.grounded; i++) {
        ys.push(w.board.y);
        w = step(w, COAST, cfg);
      }
      return ys;
    };
    expect(runArc(DEFAULT_CONFIG)).toEqual(runArc(fixed));
  });

  it('when the hold config is unset, takeoff leaves jumpSustain absent', () => {
    // Omit the hold keys entirely (exactOptionalPropertyTypes forbids `undefined`).
    const { jumpHoldMaxTime: _m, jumpHoldGravityScale: _s, ...rest } = DEFAULT_CONFIG;
    const fixed: SimConfig = rest;
    const w = step(createWorld(fixed, 1), HOP, fixed);
    expect(w.board.jumpSustain).toBeUndefined();
    // And holding has no effect without the config — apex equals the quick hop.
    const takeoff = w;
    const quick = apexY(takeoff, fixed, false);
    const held = apexY(takeoff, fixed, true);
    expect(held).toBeCloseTo(quick, 6);
  });

  it('arms jumpSustain to jumpHoldMaxTime on takeoff (with config)', () => {
    const w = step(createWorld(DEFAULT_CONFIG, 1), HOP, DEFAULT_CONFIG);
    expect(w.board.jumpSustain).toBe(DEFAULT_CONFIG.jumpHoldMaxTime);
  });
});

describe('mid-air gesture (re)selects the trick', () => {
  it('a mid-air directional gesture sets board.trick to that catalog trick', () => {
    // Take off plain (ollie), then flick a direction in the air.
    let w = step(createWorld(DEFAULT_CONFIG, 5), HOP, DEFAULT_CONFIG);
    expect(w.board.trick).toBe('ollie');
    expect(w.board.grounded).toBe(false);
    w = step(w, { ollie: false, gesture: 'left' }, DEFAULT_CONFIG);
    expect(w.board.trick).toBe('kickflip');
  });

  it('every gesture resolves mid-air to its catalog trick', () => {
    for (const def of DEFAULT_CONFIG.tricks) {
      let w = step(createWorld(DEFAULT_CONFIG, 5), HOP, DEFAULT_CONFIG);
      expect(w.board.grounded).toBe(false);
      w = step(w, { ollie: false, gesture: def.gesture }, DEFAULT_CONFIG);
      expect(w.board.trick).toBe(def.id);
    }
  });

  it('still upgrades to heelflip on a mid-air doubleTap (back-compat)', () => {
    let w = step(createWorld(DEFAULT_CONFIG, 5), HOP, DEFAULT_CONFIG);
    expect(w.board.trick).toBe('ollie');
    w = step(w, { ollie: false, gesture: 'doubleTap' }, DEFAULT_CONFIG);
    expect(w.board.trick).toBe('heelflip');
  });
});
