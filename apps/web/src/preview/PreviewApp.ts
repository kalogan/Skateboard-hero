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
import {
  buildConfig,
  defaultKnobs,
  type GameMode,
  type PreviewKnobs,
} from './buildConfig.js';
import {
  buildTheme,
  defaultThemeKnobs,
  themePresets,
  type ThemeKnobs,
} from './buildTheme.js';

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
  // ── Live THEME knob state (purely cosmetic; never touches the sim). Cloned
  //    from DEFAULT_THEME via defaultThemeKnobs(); fed to the REAL renderer. ──
  let themeKnobs: ThemeKnobs = defaultThemeKnobs();

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

  /** (Re)create the REAL renderer over the current canvas/ctx with the current
   *  config + theme. One place so config- and theme-knob changes share it
   *  (production-truthful: always the real `createRenderer`, never a fork). */
  function makeRenderer(): void {
    renderer = createRenderer(ctx!, {
      width: canvas.width,
      height: canvas.height,
      config,
      theme: buildTheme(themeKnobs),
    });
  }

  /** Rebuild config from knobs and restart the run (keeps the harness honest:
   *  changing a knob rebuilds the REAL config and re-seeds the REAL sim). */
  function applyKnobs(): void {
    config = buildConfig(knobs);
    makeRenderer();
    restart();
  }

  /** Apply a theme-knob change: rebuild the REAL theme and recreate the renderer
   *  over the SAME canvas/ctx — the sim is untouched (theme is purely visual),
   *  so the live run keeps going and the new look shows on the next frame. */
  function applyTheme(): void {
    makeRenderer();
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

  /** Lane shift — feed a directional gesture WITHOUT an ollie, so the lane sim
   *  reads it as a left/right lane move (not a trick takeoff). */
  function queueLaneShift(dir: 'left' | 'right'): void {
    audio.unlock();
    pendingIntent = { ollie: false, gesture: dir };
  }

  /** Lane jump — a plain hop over an obstacle (ollie, no directional gesture). */
  function queueLaneJump(): void {
    audio.unlock();
    pendingIntent = { ollie: true };
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
    const fields: Array<[string, string]> = [
      ['mode', knobs.mode],
      ['status', world.status],
      ['score', String(world.score)],
      ['dist', String(Math.floor(world.distance))],
      ['speed', world.speed.toFixed(0)],
      ['tricks', String(world.tricks)],
      ['trick', world.board.trick ?? '—'],
      ['seed', String(knobs.seed)],
    ];
    // Lane-mode only: surface the live lane index when the sim reports it.
    if (knobs.mode === 'lanes' && world.lane !== undefined) {
      fields.splice(2, 0, ['lane', String(world.lane)]);
    }
    for (const [k, v] of fields) {
      const span = document.createElement('span');
      span.innerHTML = `${k} <b>${v}</b>`;
      readout.appendChild(span);
    }
  }

  // Lane-controls section, kept as a ref so mode switches can show/hide it.
  let laneSection: HTMLElement | null = null;

  // ── Build the control panel (data-driven where possible) ──
  buildPanel();

  function buildPanel(): void {
    const title = el('h1');
    title.textContent = 'Preview Harness';
    panel.appendChild(title);

    // ── Game Mode A/B (doc §4: both modes mount the REAL renderer + REAL sim;
    //    never a preview fork). Switching rebuilds the config and RESTARTS the
    //    run, because classic and lanes are different sim MODELS. ──
    buildModeSection();

    // ── Lane controls — visible/relevant in Lanes mode. They feed the REAL sim
    //    an InputIntent on the next step(s) via the same pending-intent the
    //    gesture buttons use (the preview drives the sim itself). ──
    buildLaneSection();

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
        themeKnobs = defaultThemeKnobs();
        seedInput.value = String(knobs.seed);
        rebuildPanel();
        applyKnobs();
        applyTheme();
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

    // ── Theme / Art (cosmetic; recreates the REAL renderer with a new theme). ──
    buildThemeSection();

    // §6 boundary — what the harness still CANNOT tune (kept honest). The art
    // boundary is now CLOSED: palette / parallax / ground knobs above drive the
    // real renderer's RenderTheme. What remains stubbed is the AUDIO transport
    // (WebAudio synth, not real asset mixing) and anything server-authoritative.
    const boundary = el('div', 'pv-note');
    boundary.dataset.testid = 'preview-boundary';
    boundary.innerHTML =
      '<b>Boundary (doc §6).</b> The Game-Mode A/B is now REAL on both sides — ' +
      'Classic and Lanes each mount the same <code>@skate/core</code> ' +
      '<code>createWorld</code>/<code>step</code> and the same ' +
      '<code>@skate/render-canvas</code> renderer (no preview fork); switching ' +
      'restarts the run because they are different sim models. Theme / art is ' +
      'wired too — the palette, parallax and ground knobs build a real ' +
      '<code>RenderTheme</code>, so the look you see is what ships. Still NOT ' +
      'verifiable here: audio is a dev-only WebAudio synth (not the shipped ' +
      'asset mix), and server-authoritative scoring / persistence are stubbed ' +
      'by construction. A green harness is not a green system.';
    panel.appendChild(boundary);
  }

  /** Game Mode A/B: a segmented control switching Classic ⇄ Lanes. Switching
   *  sets `knobs.mode`, rebuilds the config, and RESTARTS the run via
   *  `applyKnobs()` — recreating both the REAL sim (`createWorld`/`step`) and the
   *  REAL renderer (`createRenderer`), since the two modes are different models. */
  function buildModeSection(): void {
    const mode = group('Game Mode');
    const seg = el('div', 'pv-row');
    seg.dataset.testid = 'mode-toggle';

    const modes: ReadonlyArray<[GameMode, string]> = [
      ['classic', 'Classic (horizontal)'],
      ['lanes', 'Lanes (vertical)'],
    ];
    const buttons: HTMLButtonElement[] = [];
    function paint(): void {
      for (const b of buttons) {
        b.classList.toggle('pv-btn--active', b.dataset.mode === knobs.mode);
      }
    }
    for (const [m, label] of modes) {
      const b = btn(label, `mode-${m}`, () => {
        if (knobs.mode === m) return;
        knobs = { ...knobs, mode: m };
        paint();
        updateLaneVisibility();
        // Different sim model → recreate world + renderer and restart the run.
        applyKnobs();
      });
      b.dataset.mode = m;
      buttons.push(b);
      seg.appendChild(b);
    }
    paint();
    mode.appendChild(seg);
    panel.appendChild(mode);
  }

  /** Lane controls + lane-specific knobs. The buttons feed the REAL sim an
   *  `InputIntent` via the shared pending-intent (left/right = lane shift,
   *  jump = ollie hop). The whole section is shown only in Lanes mode. */
  function buildLaneSection(): void {
    const lane = group('Lane controls');
    laneSection = lane;

    const ctrlRow = el('div', 'pv-row');
    const left = btn('◀ lane', 'lane-left', () => queueLaneShift('left'));
    left.dataset.lane = 'left';
    const jump = btn('jump', 'lane-jump', () => queueLaneJump());
    jump.dataset.lane = 'jump';
    const right = btn('lane ▶', 'lane-right', () => queueLaneShift('right'));
    right.dataset.lane = 'right';
    ctrlRow.appendChild(left);
    ctrlRow.appendChild(jump);
    ctrlRow.appendChild(right);
    lane.appendChild(ctrlRow);

    // Lane-specific knobs (enumerated from the config contract). These rebuild
    // the config + restart, like the other sim knobs.
    rangeKnob(lane, 'laneCount', 'lane count', 2, 6, 1, () => knobs.laneCount, (v) => {
      knobs = { ...knobs, laneCount: v };
    });
    rangeKnob(lane, 'laneShiftSpeed', 'lane shift speed (lanes/sec)', 1, 24, 0.5, () => knobs.laneShiftSpeed, (v) => {
      knobs = { ...knobs, laneShiftSpeed: v };
    });

    panel.appendChild(lane);
    updateLaneVisibility();
  }

  /** Show the lane controls only in Lanes mode (they are inert in classic). */
  function updateLaneVisibility(): void {
    if (laneSection) laneSection.style.display = knobs.mode === 'lanes' ? '' : 'none';
  }

  /** Build the Theme / Art controls: palette color pickers + parallax/layout
   *  sliders + presets. Every control mutates `themeKnobs` (a spread/override of
   *  the default theme) and calls `applyTheme()` to recreate the renderer live. */
  function buildThemeSection(): void {
    const theme = group('Theme / Art');

    // Presets — each loads a full ThemeKnobs derived from DEFAULT_THEME.
    const presetRow = el('div', 'pv-row');
    for (const p of themePresets()) {
      const b = btn(p.label, `preset-${p.id}`, () => {
        themeKnobs = p.knobs;
        applyTheme();
        rebuildPanel();
      });
      b.dataset.preset = p.id;
      presetRow.appendChild(b);
    }
    theme.appendChild(presetRow);

    // Palette colors. id → label; getter/setter over `themeKnobs`.
    const colors: ReadonlyArray<[keyof ThemeKnobs, string]> = [
      ['skyTop', 'sky top'],
      ['skyBottom', 'sky bottom'],
      ['hillsFar', 'hills far'],
      ['hillsNear', 'hills near'],
      ['buildings', 'buildings'],
      ['ground', 'ground'],
      ['groundEdge', 'ground edge'],
      ['board', 'board'],
      ['riderAccent', 'rider accent'],
      ['obstacle', 'obstacle'],
      ['cone', 'cone'],
    ];
    for (const [key, label] of colors) {
      colorKnob(theme, key, label);
    }

    // Parallax + layout sliders.
    const sliders: ReadonlyArray<
      [keyof ThemeKnobs, string, number, number, number]
    > = [
      ['farFactor', 'parallax far factor', 0, 0.5, 0.005],
      ['nearFactor', 'parallax near factor', 0, 0.5, 0.005],
      ['buildingFactor', 'parallax building factor', 0, 0.5, 0.005],
      ['farAmplitude', 'far amplitude', 0, 1, 0.01],
      ['nearAmplitude', 'near amplitude', 0, 1, 0.01],
      ['groundLineRatio', 'ground line ratio', 0.3, 0.95, 0.01],
      ['groundStripeSpan', 'ground stripe span', 8, 200, 1],
    ];
    for (const [key, label, min, max, stepSize] of sliders) {
      rangeKnob(
        theme,
        `theme-${key}`,
        label,
        min,
        max,
        stepSize,
        () => themeKnobs[key] as number,
        (v) => {
          themeKnobs = { ...themeKnobs, [key]: v };
        },
        applyTheme,
      );
    }

    panel.appendChild(theme);
  }

  /** A labelled `<input type="color">` bound to a `themeKnobs` palette entry.
   *  Stable selector: `[data-knob="theme-<key>"]`. */
  function colorKnob(
    parent: HTMLElement,
    key: keyof ThemeKnobs,
    label: string,
  ): void {
    const wrap = el('div', 'pv-knob');
    const lab = document.createElement('label');
    lab.htmlFor = `pv-theme-${String(key)}`;
    lab.textContent = label;
    const input = document.createElement('input');
    input.type = 'color';
    input.id = `pv-theme-${String(key)}`;
    input.dataset.knob = `theme-${String(key)}`;
    input.dataset.testid = `knob-theme-${String(key)}`;
    input.value = String(themeKnobs[key]);
    input.addEventListener('input', () => {
      themeKnobs = { ...themeKnobs, [key]: input.value };
      applyTheme();
    });
    wrap.appendChild(lab);
    wrap.appendChild(document.createElement('span'));
    wrap.appendChild(input);
    parent.appendChild(wrap);
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

  /** A labelled range slider with a live numeric readout. Applies on input.
   *  `apply` defaults to `applyKnobs` (sim knobs); theme knobs pass `applyTheme`
   *  so a colour/parallax change recreates the renderer without re-seeding. */
  function rangeKnob(
    parent: HTMLElement,
    id: string,
    label: string,
    min: number,
    max: number,
    stepSize: number,
    get: () => number,
    set: (v: number) => void,
    apply: () => void = applyKnobs,
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
    range.dataset.knob = id;
    range.min = String(min);
    range.max = String(max);
    range.step = String(stepSize);
    range.value = String(get());
    range.addEventListener('input', () => {
      const v = Number(range.value);
      set(v);
      val.textContent = fmt(v);
      apply();
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
  makeRenderer();
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
