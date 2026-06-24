/**
 * App entry (Slice 0 shell).
 *
 * Slice 3 owns this surface: it adds the input layer (tap/Space → InputIntent),
 * the fixed-timestep rAF loop (accumulate real time, run N core `step()`s),
 * mounts the renderer, the HUD/start/game-over screens, and versioned
 * high-score persistence. For now it just mounts a canvas + renderer so the app
 * boots and the seams are wired.
 */

import './style.css';
import { DEFAULT_CONFIG } from '@skate/core';
import { createRenderer } from '@skate/render-canvas';

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
  config: DEFAULT_CONFIG,
});

window.addEventListener('resize', () => {
  fit();
  renderer.resize(canvas.width, canvas.height);
});

// Slice 3 replaces this with the real game loop.
ctx.fillStyle = '#10101a';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = '#e8e8f0';
ctx.font = '24px system-ui, sans-serif';
ctx.textAlign = 'center';
ctx.fillText('Skateboard Hero — scaffold ready', canvas.width / 2, canvas.height / 2);
