/**
 * The preview-harness SHELL.
 *
 * THE ONE RULE (doc §2): production-truthful. This mounts the REAL renderer
 * (`@skate/render-canvas`'s `createRenderer`) and drives the REAL sim
 * (`@skate/core`'s `createWorld` + `step`) and the REAL audio
 * (`apps/web/src/audio`'s `createGameAudio`). Nothing here re-implements game
 * logic or art "for preview" — it only wraps the real things in inspection
 * controls. The only thing it owns is its OWN tiny fixed-timestep accumulator
 * (kept independent of the app's `loop.ts`, owned by another builder).
 *
 * Data-driven (doc §3.3): the trick reference list, the per-trick point knobs,
 * and the gesture buttons all enumerate FROM the config's `tricks` — so a newly
 * authored trick (e.g. Tre Flip) shows up automatically, no hand-kept list.
 */

import {
  createWorld,
  step,
  DEFAULT_CONFIG,
  type InputIntent,
  type SimConfig,
  type TrickDef,
  type WorldState,
} from '@skate/core';

/**
 * `TrickGesture` is part of the core type contract but is not re-exported from
 * the `@skate/core` index, so we derive it structurally from the public
 * `TrickDef.gesture` field rather than forking the union (production-truthful:
 * one source of truth, no hand-kept copy).
 */
type TrickGesture = TrickDef['gesture'];
import { createRenderer, type Renderer } from '@skate/render-canvas';
import { createGameAudio, type GameAudio } from '../audio/index.js';
import { buildConfig, defaultKnobs, type PreviewKnobs } from './buildConfig.js';

export interface PreviewAppHandle {
  dispose(): void;
}

/** All takeoff gestures, ordered for a stable button row. */
const GESTURES: readonly TrickGesture[] = [
  'tap',
  'up',
  'down',
  'left',
  'right',
  'doubleTap',
];

export function createPreviewApp(root: HTMLElement): PreviewAppHandle {
  // ── Live knob state. Cloned from DEFAULT_CONFIG via defaultKnobs(). ──
  let knobs: PreviewKnobs = defaultKnobs();
  let config: SimConfig = buildConfig(knobs);

  // ── DOM scaffold ──
  const stage = el('div', 'pv-stage');
  const canvas = document.createElement('canvas');
  canvas.id = 'pv-canvas';
  canvas.dataset.testid = 'preview-canvas';
  stage.appendChild(canvas);
  const readout = el('div', 'pv-readout');
  readout.dataset.testid = 'preview-readout';
  stage.appendChild(readout);

  const panel = el('div', 'pv-panel');
  panel.dataset.testid = 'preview-panel';

  root.appendChild(stage);
  root.appendChild(panel);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('preview: 2d canvas context unavailable');

  // ── Real renderer + real audio ──
  const audio: GameAudio = createGameAudio();
  let renderer: Renderer;

  function sizeCanvas(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  }

  // ── Sim state + our OWN fixed-timestep accumulator (independent of loop.ts) ──
  let world: WorldState = createWorld(config, knobs.seed);
  let pendingIntent: InputIntent | null = null;
  let prevGrounded = world.board.grounded;
  let carryMs = 0;
  let lastMs = performance.now();
  let rafId = 0;

  /** Rebuild config from knobs and restart the run (keeps the harness honest:
   *  changing a knob rebuilds the REAL config and re-seeds the REAL sim). */
  function applyKnobs(): void {
    config = buildConfig(knobs);
    renderer = createRenderer(ctx!, {
      width: canvas.width,
      height: canvas.height,
      config,
    });
    restart();
  }

  function restart(): void {
    world = createWorld(config, knobs.seed);
    prevGrounded = world.board.grounded;
    pendingIntent = null;
    carryMs = 0;
    lastMs = performance.now();
  }

  /** Feed a gesture into the sim on the next tick (construct InputIntent). */
  function queueGesture(gesture: TrickGesture): void {
    audio.unlock();
    // `tap` is a plain ollie; the others are takeoff/mid-air flicks.
    pendingIntent = { ollie: true, gesture };
  }

  // ── The fixed-timestep loop (our own accumulator calling step() directly) ──
  function frame(): void {
    const now = performance.now();
    let elapsed = now - lastMs;
    lastMs = now;
    if (elapsed > 250) elapsed = 250; // avoid a spiral after a tab stall

    const dtMs = config.dt * 1000;
    carryMs += elapsed;
    // Apply any queued input on the first tick of this frame only.
    let intent: InputIntent = pendingIntent ?? { ollie: false };
    pendingIntent = null;

    while (carryMs >= dtMs) {
      world = step(world, intent, config);
      // Subsequent ticks this frame carry no fresh input.
      intent = { ollie: false };
      carryMs -= dtMs;

      // Cosmetic audio off real state transitions (mirrors the product wiring).
      const grounded = world.board.grounded;
      if (prevGrounded && !grounded) {
        audio.ollie();
        if (world.board.trick) audio.trick(world.board.trick);
      } else if (!prevGrounded && grounded && world.status === 'rolling') {
        audio.land();
      } else if (world.status === 'bailed' && prevGrounded !== grounded) {
        audio.bail();
      }
      prevGrounded = grounded;

      // Auto-restart on bail so the harness keeps showing a live run.
      if (world.status === 'bailed') {
        audio.bail();
        restart();
        break;
      }
    }

    renderer.draw(world);
    updateReadout();
    rafId = requestAnimationFrame(frame);
  }

  function updateReadout(): void {
    readout.innerHTML = '';
    const fields: ReadonlyArray<[string, string]> = [
      ['status', world.status],
      ['score', String(world.score)],
      ['dist', String(Math.floor(world.distance))],
      ['speed', world.speed.toFixed(0)],
      ['tricks', String(world.tricks)],
      ['trick', world.board.trick ?? '—'],
      ['seed', String(knobs.seed)],
    ];
    for (const [k, v] of fields) {
      const span = document.createElement('span');
      span.innerHTML = `${k} <b>${v}</b>`;
      readout.appendChild(span);
    }
  }

  // ── Build the control panel (data-driven where possible) ──
  buildPanel();

  function buildPanel(): void {
    const title = el('h1');
    title.textContent = 'Preview Harness';
    panel.appendChild(title);

    // Skateboard knobs.
    const board = group('Skateboard');
    rangeKnob(board, 'baseSpeed', 'base speed', 50, 1000, 1, () => knobs.baseSpeed, (v) => {
      knobs = { ...knobs, baseSpeed: v };
    });
    rangeKnob(board, 'maxSpeed', 'max speed', 100, 1500, 1, () => knobs.maxSpeed, (v) => {
      knobs = { ...knobs, maxSpeed: v };
    });
    rangeKnob(board, 'speedRamp', 'speed ramp', 0, 0.2, 0.001, () => knobs.speedRamp, (v) => {
      knobs = { ...knobs, speedRamp: v };
    });
    rangeKnob(board, 'ollieImpulse', 'jump height (ollie impulse)', 100, 1600, 1, () => knobs.ollieImpulse, (v) => {
      knobs = { ...knobs, ollieImpulse: v };
    });
    rangeKnob(board, 'gravity', 'gravity', -4000, -200, 10, () => knobs.gravity, (v) => {
      knobs = { ...knobs, gravity: v };
    });
    panel.appendChild(board);

    // Enemy (obstacle) knobs — size scale + density (derived spawn gap).
    const enemies = group('Enemies (obstacles)');
    rangeKnob(enemies, 'enemySize', 'size scale', 0.25, 4, 0.05, () => knobs.enemySize, (v) => {
      knobs = { ...knobs, enemySize: v };
    });
    rangeKnob(enemies, 'enemyDensity', 'density', 0.25, 4, 0.05, () => knobs.enemyDensity, (v) => {
      knobs = { ...knobs, enemyDensity: v };
    });
    panel.appendChild(enemies);

    // Points knobs — enumerated FROM DEFAULT_TRICKS (data-driven).
    const points = group('Points (per trick)');
    for (const t of DEFAULT_CONFIG.tricks) {
      rangeKnob(
        points,
        `points-${t.id}`,
        t.name,
        0,
        1000,
        10,
        () => knobs.trickPoints[t.id] ?? t.points,
        (v) => {
          knobs = { ...knobs, trickPoints: { ...knobs.trickPoints, [t.id]: v } };
        },
      );
    }
    panel.appendChild(points);

    // Seed (doc §E). Identity seed reproduces the on-disk run.
    const det = group('Determinism');
    const seedInput = document.createElement('input');
    seedInput.type = 'number';
    seedInput.id = 'pv-seed';
    seedInput.dataset.testid = 'preview-seed';
    seedInput.value = String(knobs.seed);
    seedInput.step = '1';
    seedInput.addEventListener('change', () => {
      const v = Number(seedInput.value);
      knobs = { ...knobs, seed: Number.isFinite(v) ? Math.floor(v) : 0 };
      applyKnobs();
    });
    const seedRow = el('div', 'pv-knob');
    const seedLabel = document.createElement('label');
    seedLabel.htmlFor = 'pv-seed';
    seedLabel.textContent = 'seed (0 = identity / on-disk run)';
    seedRow.appendChild(seedLabel);
    seedRow.appendChild(document.createElement('span'));
    seedRow.appendChild(seedInput);
    det.appendChild(seedRow);

    const detRow = el('div', 'pv-row');
    detRow.appendChild(
      btn('Restart run', 'restart', () => restart()),
    );
    detRow.appendChild(
      btn('Reset knobs', 'reset', () => {
        knobs = defaultKnobs();
        seedInput.value = String(knobs.seed);
        rebuildPanel();
        applyKnobs();
      }),
    );
    det.appendChild(detRow);
    panel.appendChild(det);

    // Gesture / trick triggers — enumerated FROM the config tricks (data-driven).
    const tricksGroup = group('Tricks & gestures');
    const list = el('ul', 'pv-trick-list');
    for (const t of config.tricks) {
      list.appendChild(trickRow(t));
    }
    tricksGroup.appendChild(list);

    // Raw gesture buttons (every TrickGesture), with stable selectors.
    const gestureRow = el('div', 'pv-row');
    for (const g of GESTURES) {
      const b = btn(`gesture: ${g}`, `gesture-${g}`, () => queueGesture(g));
      b.dataset.gesture = g;
      gestureRow.appendChild(b);
    }
    tricksGroup.appendChild(gestureRow);
    panel.appendChild(tricksGroup);

    // Audio triggers.
    const audioGroup = group('Audio');
    const audioRow = el('div', 'pv-row');
    audioRow.appendChild(btn('ollie sfx', 'sfx-ollie', () => { audio.unlock(); audio.ollie(); }));
    audioRow.appendChild(btn('land sfx', 'sfx-land', () => { audio.unlock(); audio.land(); }));
    audioRow.appendChild(btn('trick sfx', 'sfx-trick', () => { audio.unlock(); audio.trick(); }));
    audioRow.appendChild(btn('bail sfx', 'sfx-bail', () => { audio.unlock(); audio.bail(); }));
    let ambientOn = false;
    const ambientBtn = btn('ambient: off', 'ambient-toggle', () => {
      audio.unlock();
      ambientOn = !ambientOn;
      if (ambientOn) audio.startAmbient();
      else audio.stopAmbient();
      ambientBtn.textContent = `ambient: ${ambientOn ? 'on' : 'off'}`;
    });
    audioRow.appendChild(ambientBtn);
    audioGroup.appendChild(audioRow);
    panel.appendChild(audioGroup);

    // §6 boundary — honest "not yet wired" note. The renderer has no theme/art
    // seam, so parallax/art/level-art knobs would require forking the renderer.
    // We surface them as not-wired rather than faking a divergent preview render.
    const boundary = el('div', 'pv-note');
    boundary.dataset.testid = 'preview-boundary';
    boundary.innerHTML =
      '<b>Not yet wired (needs renderer theme seam).</b> ' +
      'Parallax / palette / level-art knobs are intentionally absent: the ' +
      'renderer (@skate/render-canvas) does not accept theme or art params yet. ' +
      'Adding them here would require a renderer config seam — forking a ' +
      'divergent "preview renderer" would break production-truthfulness (doc §6). ' +
      'Surfaced honestly instead of faked.';
    panel.appendChild(boundary);
  }

  /** Re-render the whole panel (used after a knob reset). */
  function rebuildPanel(): void {
    panel.innerHTML = '';
    buildPanel();
  }

  // ── Small DOM helpers ──
  function el(tag: string, className?: string): HTMLElement {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function group(heading: string): HTMLElement {
    const g = el('div', 'pv-group');
    const h = document.createElement('h2');
    h.textContent = heading;
    g.appendChild(h);
    return g;
  }

  function btn(label: string, testid: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'pv-btn';
    b.textContent = label;
    b.dataset.testid = testid;
    b.addEventListener('click', onClick);
    return b;
  }

  function trickRow(t: TrickDef): HTMLLIElement {
    const li = document.createElement('li');
    const name = el('span', 'pv-trick-name');
    name.textContent = t.name;
    const meta = el('span', 'pv-trick-meta');
    const live = knobs.trickPoints[t.id] ?? t.points;
    meta.textContent = `${live} pts · ${t.gesture}`;
    const fire = btn('fire', `fire-${t.id}`, () => queueGesture(t.gesture));
    fire.dataset.trick = t.id;
    li.appendChild(name);
    li.appendChild(meta);
    li.appendChild(fire);
    return li;
  }

  /** A labelled range slider with a live numeric readout. Applies on input. */
  function rangeKnob(
    parent: HTMLElement,
    id: string,
    label: string,
    min: number,
    max: number,
    stepSize: number,
    get: () => number,
    set: (v: number) => void,
  ): void {
    const wrap = el('div', 'pv-knob');
    const lab = document.createElement('label');
    lab.htmlFor = `pv-${id}`;
    lab.textContent = label;
    const val = el('span', 'pv-val');
    val.textContent = fmt(get());
    const range = document.createElement('input');
    range.type = 'range';
    range.id = `pv-${id}`;
    range.dataset.testid = `knob-${id}`;
    range.min = String(min);
    range.max = String(max);
    range.step = String(stepSize);
    range.value = String(get());
    range.addEventListener('input', () => {
      const v = Number(range.value);
      set(v);
      val.textContent = fmt(v);
      applyKnobs();
    });
    wrap.appendChild(lab);
    wrap.appendChild(val);
    wrap.appendChild(range);
    parent.appendChild(wrap);
  }

  function fmt(v: number): string {
    return Number.isInteger(v) ? String(v) : v.toFixed(3);
  }

  // ── Boot ──
  function onResize(): void {
    sizeCanvas();
    renderer.resize(canvas.width, canvas.height);
  }

  sizeCanvas();
  renderer = createRenderer(ctx, {
    width: canvas.width,
    height: canvas.height,
    config,
  });
  window.addEventListener('resize', onResize);
  rafId = requestAnimationFrame(frame);

  return {
    dispose(): void {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      audio.stopAmbient();
      root.innerHTML = '';
    },
  };
}
