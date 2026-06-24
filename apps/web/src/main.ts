/**
 * App entry (Slice 3) — assembles the vertical slice.
 *
 * Wires the input layer, a fixed-timestep rAF loop driving the authoritative
 * core `step()`, the cosmetic renderer, the HUD, and versioned high-score
 * persistence. A small phase machine (start → playing → over) decides what a
 * tap means; the sim itself stays untouched and authoritative.
 */

import './style.css';
import { createWorld, DEFAULT_CONFIG, type WorldState } from '@skate/core';
import { createRenderer } from '@skate/render-canvas';
import { advance } from './loop.js';
import { createInput } from './input.js';
import { createHud, type Phase } from './hud.js';
import { loadBest, saveBest } from './storage.js';

const config = DEFAULT_CONFIG;

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('missing #app mount point');

const canvas = document.createElement('canvas');
root.appendChild(canvas);

const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2d canvas context unavailable');

function fit(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
}
fit();

const renderer = createRenderer(ctx, {
  width: canvas.width,
  height: canvas.height,
  config,
});

const hud = createHud(root);

window.addEventListener('resize', () => {
  fit();
  renderer.resize(canvas.width, canvas.height);
});

// ── Game state (app-level) ──
let phase: Phase = 'start';
let world: WorldState = createWorld(config, freshSeed());
let best = loadBest(window.localStorage);
let carryMs = 0;
let lastMs = performance.now();
let pendingOllie = false;

function freshSeed(): number {
  // Seeding is an app concern (the core never reads wall-clock). Vary per run.
  return (performance.now() * 1000) >>> 0;
}

function startRun(): void {
  world = createWorld(config, freshSeed());
  carryMs = 0;
  lastMs = performance.now();
  pendingOllie = false;
  phase = 'playing';
  hud.setPhase('playing', 0, best);
}

function onTap(): void {
  if (phase === 'playing') {
    pendingOllie = true;
  } else {
    // start screen or game-over → (re)start a run.
    startRun();
  }
}

const disposeInput = createInput(window, onTap);

function frame(): void {
  const now = performance.now();
  const elapsed = now - lastMs;
  lastMs = now;

  if (phase === 'playing') {
    const result = advance(world, config, elapsed, carryMs, pendingOllie);
    world = result.world;
    carryMs = result.carryMs;
    pendingOllie = false;

    if (world.status === 'bailed') {
      best = saveBest(window.localStorage, world.score);
      phase = 'over';
      hud.setPhase('over', world.score, best);
    }
  }

  renderer.draw(world);
  hud.update(world, best);
  requestAnimationFrame(frame);
}

hud.setPhase('start', 0, best);
requestAnimationFrame(frame);

// Tidy up if the module is hot-replaced in dev.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposeInput();
    hud.dispose();
  });
}
