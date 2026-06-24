/**
 * App entry — assembles the game and wires the feature layers.
 *
 * Fixed-timestep rAF loop drives the authoritative core `step()`; the renderer,
 * HUD, procedural audio, and local leaderboard are all cosmetic/optimistic on
 * top. A phase machine (start → playing → over) decides what a tap means. The
 * sim stays untouched and authoritative.
 */

import './style.css';
import { createWorld, DEFAULT_CONFIG, type WorldState } from '@skate/core';
import { createRenderer } from '@skate/render-canvas';
import { advance } from './loop.js';
import { createInput } from './input.js';
import { createHud, type Phase } from './hud.js';
import { createGameAudio } from './audio/index.js';
import { loadLeaderboard, qualifies, submitScore } from './leaderboard.js';
import { createLeaderboardPanel } from './ui/leaderboard.js';

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
const audio = createGameAudio();

// ── Leaderboard overlay (the game-over screen). Swallows taps so initials
//    entry doesn't trigger the global tap-to-retry; an explicit "Play again"
//    button restarts. ──
const lbOverlay = document.createElement('div');
lbOverlay.className = 'lb-overlay';
lbOverlay.hidden = true;
lbOverlay.addEventListener('pointerdown', (e) => e.stopPropagation());
root.appendChild(lbOverlay);
const panel = createLeaderboardPanel(lbOverlay);
const playAgainBtn = document.createElement('button');
playAgainBtn.className = 'lb-again';
playAgainBtn.textContent = 'Play again';
playAgainBtn.hidden = true;
playAgainBtn.addEventListener('click', startRun);
lbOverlay.appendChild(playAgainBtn);

// ── Mute toggle (top-right). Stops the tap from also driving the game. ──
const muteBtn = document.createElement('button');
muteBtn.className = 'mute-btn';
muteBtn.setAttribute('aria-label', 'toggle sound');
muteBtn.textContent = '🔊';
muteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
muteBtn.addEventListener('click', () => {
  const muted = !audio.isMuted();
  audio.setMuted(muted);
  muteBtn.textContent = muted ? '🔇' : '🔊';
});
root.appendChild(muteBtn);

window.addEventListener('resize', () => {
  fit();
  renderer.resize(canvas.width, canvas.height);
});

const topScore = (): number => loadLeaderboard(window.localStorage)[0]?.score ?? 0;

// ── Game state (app-level) ──
let phase: Phase = 'start';
let world: WorldState = createWorld(config, freshSeed());
let best = topScore();
let carryMs = 0;
let lastMs = performance.now();
let pendingOllie = false;
let prevGrounded = true;

function freshSeed(): number {
  // Seeding is an app concern (the core never reads wall-clock). Vary per run.
  return (performance.now() * 1000) >>> 0;
}

function startRun(): void {
  world = createWorld(config, freshSeed());
  carryMs = 0;
  lastMs = performance.now();
  pendingOllie = false;
  prevGrounded = world.board.grounded;
  lbOverlay.hidden = true;
  playAgainBtn.hidden = true;
  phase = 'playing';
  hud.setPhase('playing', 0, best);
  audio.startAmbient();
}

/** End-of-run: drive the leaderboard (qualify → enter initials → board). */
function endRun(score: number): void {
  lbOverlay.hidden = false;
  if (qualifies(window.localStorage, score)) {
    playAgainBtn.hidden = true;
    panel.promptEntry(score, (name) => {
      const board = submitScore(window.localStorage, name, score);
      best = topScore();
      const highlightIndex = board.findIndex((e) => e.score === score);
      panel.showBoard(board, highlightIndex >= 0 ? { highlightIndex } : undefined);
      playAgainBtn.hidden = false;
    });
  } else {
    panel.showBoard(loadLeaderboard(window.localStorage));
    playAgainBtn.hidden = false;
  }
}

function onTap(): void {
  audio.unlock();
  if (phase === 'playing') {
    pendingOllie = true;
  } else if (phase === 'over') {
    // The leaderboard overlay handles its own taps (initials / Play again).
  } else {
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

    // SFX from state transitions (frame granularity is plenty at 60fps).
    const grounded = world.board.grounded;
    if (prevGrounded && !grounded) {
      audio.ollie();
      if (world.board.trick) audio.trick(world.board.trick);
    } else if (!prevGrounded && grounded && world.status === 'rolling') {
      audio.land();
    }
    prevGrounded = grounded;

    if (world.status === 'bailed') {
      audio.bail();
      audio.stopAmbient();
      phase = 'over';
      hud.setPhase('over', world.score, best);
      endRun(world.score);
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
    panel.dispose();
    audio.stopAmbient();
  });
}
