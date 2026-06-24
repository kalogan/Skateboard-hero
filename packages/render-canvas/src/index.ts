/**
 * @skate/render-canvas — a thin, COSMETIC Canvas2D renderer.
 *
 * It reads a `WorldState` and draws it. It must never mutate sim state or carry
 * game logic (pipeline §5: clients are optimistic-cosmetic; the core is
 * authoritative). Slice 2 implements the real drawing; Slice 0 only fixed the
 * seam so the app can wire a renderer in.
 *
 * COORDINATE CONVENTION (shared 1:1 with the core sim):
 *  - World-x maps directly to canvas x. The board is drawn at `config.boardX`;
 *    obstacles carry a world `x` that decreases as they approach (enter right,
 *    exit left) and are drawn at screen x = `obstacle.x`.
 *  - +y is UP. `groundY` (0) is the ground; `board.y` is height ABOVE ground.
 *    We pick a ground line near the bottom of the canvas and map any world-y to
 *    screen via `screenY = groundLineY - (worldY - groundY)`.
 *  - The canvas is sized in DEVICE pixels (the app passes `canvas.width/height`,
 *    already scaled by dpr), and world units are device pixels, so no extra
 *    scaling is applied — `width`/`height` drive layout only.
 *
 * Rendering is deterministic: every per-frame visual is derived from
 * `WorldState` (mainly `distance`) or fixed layout, never from `Math.random`,
 * timers, or hidden mutable state.
 */

import type {
  Obstacle,
  SimConfig,
  TrickDef,
  TrickId,
  WorldState,
} from '@skate/core';
import type { RenderTheme } from './theme.js';
import { DEFAULT_THEME } from './theme.js';

export type { RenderTheme, RenderPalette, ParallaxTheme } from './theme.js';
export { DEFAULT_THEME } from './theme.js';

export interface RendererOptions {
  /** Logical render size in device pixels. */
  readonly width: number;
  readonly height: number;
  readonly config: SimConfig;
  /** Cosmetic art knobs (colors, parallax, ground line). Defaults to DEFAULT_THEME. */
  readonly theme?: RenderTheme;
}

export interface Renderer {
  /** Draw a single frame of the given world. Pure w.r.t. sim state. */
  draw(world: WorldState): void;
  /** React to a resize of the backing canvas. */
  resize(width: number, height: number): void;
}

/** Internal, derived layout. Recomputed on construct + resize. */
interface Layout {
  width: number;
  height: number;
  /** Screen-y of the ground plane (world-y === groundY). */
  groundLineY: number;
}

function computeLayout(
  width: number,
  height: number,
  groundLineRatio: number,
): Layout {
  return {
    width,
    height,
    // Ground sits ~22% up from the bottom, leaving room for the board to land.
    groundLineY: Math.round(height * groundLineRatio),
  };
}

export function createRenderer(
  ctx: CanvasRenderingContext2D,
  options: RendererOptions,
): Renderer {
  const { config } = options;
  const theme = options.theme ?? DEFAULT_THEME;
  let layout = computeLayout(options.width, options.height, theme.groundLineRatio);

  // Trick catalog lookup (cosmetic only — the renderer reads visual params but
  // never the sim's authoritative scoring).
  const trickById = new Map<TrickId, TrickDef>(
    config.tricks.map((t) => [t.id, t]),
  );

  /** Map a world-y (height above ground) to a screen-y. +y world is up. */
  const toScreenY = (worldY: number): number =>
    layout.groundLineY - (worldY - config.groundY);

  function drawBackground(world: WorldState): void {
    const { width, height, groundLineY } = layout;

    // Sky gradient.
    const sky = ctx.createLinearGradient(0, 0, 0, groundLineY);
    sky.addColorStop(0, theme.palette.skyTop);
    sky.addColorStop(1, theme.palette.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, groundLineY);

    // Parallax skyline — far hills (slowest) and a building strip (faster).
    const { parallax } = theme;
    drawParallaxHills(world.distance * parallax.farFactor, groundLineY, height, theme.palette.hillsFar, parallax.farAmplitude);
    drawParallaxHills(world.distance * parallax.nearFactor, groundLineY, height, theme.palette.hillsNear, parallax.nearAmplitude);
    drawBuildings(world.distance * parallax.buildingFactor, groundLineY);
  }

  /** A repeating row of rounded hills, offset by a parallax-scrolled phase. */
  function drawParallaxHills(
    offset: number,
    baseY: number,
    height: number,
    color: string,
    amplitudeFactor: number,
  ): void {
    const { width } = layout;
    const span = theme.parallax.hillSpan;
    const amp = height * amplitudeFactor;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    // Start one span left of screen so the leftmost hump is always covered.
    const phase = ((offset % span) + span) % span;
    for (let cx = -span - phase; cx <= width + span; cx += span) {
      // Quadratic hump peaking between cx and cx+span.
      ctx.quadraticCurveTo(cx + span / 2, baseY - amp, cx + span, baseY);
    }
    ctx.lineTo(width, baseY);
    ctx.lineTo(0, baseY);
    ctx.closePath();
    ctx.fill();
  }

  /** A scrolling block-skyline of buildings for closer parallax depth. */
  function drawBuildings(offset: number, baseY: number): void {
    const { width } = layout;
    const span = theme.parallax.buildingSpan;
    const phase = ((offset % span) + span) % span;
    ctx.fillStyle = theme.palette.buildings;
    for (let cx = -phase; cx < width; cx += span) {
      // Deterministic pseudo-height from the building's index, not RNG.
      const seed = Math.floor((cx + offset) / span);
      const h = 40 + ((seed * 53) % 7) * 14;
      const w = span * 0.62;
      ctx.fillRect(cx, baseY - h, w, h);
    }
  }

  function drawGround(world: WorldState): void {
    const { width, height, groundLineY } = layout;

    // Solid surface below the ground line.
    ctx.fillStyle = theme.palette.ground;
    ctx.fillRect(0, groundLineY, width, height - groundLineY);

    // Bright edge highlight along the ground line.
    ctx.fillStyle = theme.palette.groundEdge;
    ctx.fillRect(0, groundLineY - 2, width, 3);

    // Scrolling stripes derived from distance — the sense of speed.
    const stripeSpan = theme.groundStripeSpan;
    const phase = ((world.distance % stripeSpan) + stripeSpan) % stripeSpan;
    ctx.fillStyle = theme.palette.groundStripe;
    for (let cx = -phase; cx < width; cx += stripeSpan) {
      ctx.fillRect(cx, groundLineY + 8, stripeSpan * 0.5, 4);
    }
  }

  function drawObstacle(o: Obstacle): void {
    const baseScreenY = toScreenY(0); // ground line
    const topScreenY = toScreenY(o.height);
    const left = o.x;

    ctx.save();
    // Cleared obstacles (already behind the skater / scored) dim slightly.
    ctx.globalAlpha = o.cleared ? 0.55 : 1;

    // Contact shadow on the ground.
    ctx.fillStyle = theme.palette.obstacleShadow;
    ctx.beginPath();
    ctx.ellipse(left + o.width / 2, baseScreenY + 4, o.width * 0.6, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    switch (o.kind) {
      case 'cone': {
        // Triangular silhouette with a hazard stripe.
        ctx.fillStyle = theme.palette.cone;
        ctx.beginPath();
        ctx.moveTo(left + o.width / 2, topScreenY);
        ctx.lineTo(left, baseScreenY);
        ctx.lineTo(left + o.width, baseScreenY);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = theme.palette.coneStripe;
        ctx.fillRect(left + o.width * 0.18, baseScreenY - o.height * 0.45, o.width * 0.64, o.height * 0.16);
        break;
      }
      case 'crack': {
        // Low jagged gap in the ground.
        ctx.fillStyle = theme.palette.obstacleShadow;
        ctx.beginPath();
        ctx.moveTo(left, baseScreenY);
        ctx.lineTo(left + o.width * 0.3, baseScreenY - o.height);
        ctx.lineTo(left + o.width * 0.55, baseScreenY - o.height * 0.4);
        ctx.lineTo(left + o.width * 0.8, baseScreenY - o.height);
        ctx.lineTo(left + o.width, baseScreenY);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'rail': {
        // Angled grind rail on two posts.
        ctx.fillStyle = theme.palette.obstacle;
        ctx.fillRect(left, topScreenY, o.width, Math.max(4, o.height * 0.18));
        ctx.fillStyle = theme.palette.obstacleShadow;
        ctx.fillRect(left + 4, topScreenY, 4, baseScreenY - topScreenY);
        ctx.fillRect(left + o.width - 8, topScreenY, 4, baseScreenY - topScreenY);
        break;
      }
      case 'bench': {
        // Box silhouette with a seat highlight.
        ctx.fillStyle = theme.palette.obstacle;
        ctx.fillRect(left, topScreenY, o.width, baseScreenY - topScreenY);
        ctx.fillStyle = theme.palette.obstacleShadow;
        ctx.fillRect(left, topScreenY, o.width, Math.max(3, o.height * 0.18));
        break;
      }
      default: {
        // Defensive fallback: a plain box so unknown kinds still render.
        ctx.fillStyle = theme.palette.obstacle;
        ctx.fillRect(left, topScreenY, o.width, baseScreenY - topScreenY);
      }
    }
    ctx.restore();
  }

  function drawBoard(world: WorldState): void {
    const { board } = world;
    const bailed = world.status === 'bailed';
    const w = config.boardWidth;
    const h = config.boardHeight;

    // Board centre. The board's screen x is fixed at boardX; y lifts with board.y.
    const cx = config.boardX + w / 2;
    const cy = toScreenY(board.y) - h / 2;

    // Ground shadow shrinks as the board rises (sense of height).
    const liftRatio = Math.min(1, Math.max(0, board.y / 200));
    ctx.save();
    ctx.globalAlpha = 0.35 * (1 - liftRatio * 0.7);
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(cx, toScreenY(0) + 4, w * 0.55 * (1 - liftRatio * 0.4), 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);

    // ── Trick animation (cosmetic) ──
    // `board.rotation` accumulates while airborne (resets to 0 on land), so it is
    // our air-phase driver. Each named trick maps to a DISTINCT board motion via
    // its catalog visual params: a yaw "shuv" flattens the deck (scaleX cosine),
    // a "kick"/"heel" flip rolls it over its long axis (scaleY cosine, sign by
    // spinDir), and a plain ollie just rides the base rotation. When bailed, add
    // a fixed tumble so the crash reads even if rotation is 0.
    const tumble = bailed ? 0.5 : 0;
    const trick =
      !board.grounded && board.trick ? trickById.get(board.trick) : undefined;

    // Base nose-over rotation: small for flip/shuv tricks (they read via scale),
    // full for the plain ollie so it still tumbles like before.
    const baseSpin = trick && trick.flipAxis !== 'none' ? board.rotation * 0.25 : board.rotation;
    ctx.rotate(baseSpin + tumble);

    if (trick) {
      // Phase in revolutions of the air arc (rotation is radians of base spin).
      const phase = board.rotation / (Math.PI * 2);
      if (trick.spinTurns > 0) {
        // Yaw spin about the vertical axis → foreshorten width (fake 3D shuv).
        const yaw = trick.spinDir * trick.spinTurns * phase * Math.PI * 2;
        const sx = Math.cos(yaw);
        // Avoid a fully-degenerate 0-width transform.
        ctx.scale(sx === 0 ? 1e-3 : sx, 1);
      }
      if (trick.flipTurns > 0) {
        // Flip about the long axis → foreshorten height; spinDir tilts the roll.
        const roll = trick.flipTurns * phase * Math.PI * 2;
        const sy = Math.cos(roll);
        ctx.scale(1, sy === 0 ? 1e-3 : sy);
        ctx.rotate(trick.spinDir * roll * 0.15);
      }
    }

    drawRider(w, h, board.grounded, bailed);
    drawDeck(w, h, bailed);

    ctx.restore();
  }

  /** The skateboard deck + wheels, centred on the current transform origin. */
  function drawDeck(w: number, h: number, bailed: boolean): void {
    const deckH = h * 0.42;
    // Deck.
    ctx.fillStyle = bailed ? '#8a6020' : theme.palette.board;
    roundRect(-w / 2, -deckH / 2, w, deckH, deckH / 2);
    ctx.fill();
    // Grip tape strip.
    ctx.fillStyle = theme.palette.boardGrip;
    ctx.fillRect(-w / 2 + 3, -deckH / 2, w - 6, Math.max(2, deckH * 0.25));
    // Wheels.
    ctx.fillStyle = theme.palette.wheel;
    const wheelR = h * 0.16;
    const wy = deckH / 2 + wheelR * 0.4;
    for (const wx of [-w / 2 + w * 0.22, w / 2 - w * 0.22]) {
      ctx.beginPath();
      ctx.arc(wx, wy, wheelR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** A simple rider standing on the deck. Posture differs grounded vs airborne. */
  function drawRider(w: number, h: number, grounded: boolean, bailed: boolean): void {
    const deckTop = -h * 0.21;
    const bodyH = h * 1.5;
    ctx.save();
    ctx.fillStyle = bailed ? '#9a9aa6' : theme.palette.rider;
    // Crouch lower when grounded; extend taller when airborne (tucked/popping).
    const lean = grounded ? 0 : -w * 0.12;
    const torsoH = grounded ? bodyH * 0.78 : bodyH;
    // Legs.
    ctx.fillRect(-w * 0.12 + lean, deckTop - torsoH * 0.5, w * 0.1, torsoH * 0.5);
    ctx.fillRect(w * 0.04 + lean, deckTop - torsoH * 0.5, w * 0.1, torsoH * 0.5);
    // Torso.
    ctx.fillStyle = bailed ? '#7a7a86' : theme.palette.riderAccent;
    ctx.fillRect(-w * 0.13 + lean, deckTop - torsoH, w * 0.26, torsoH * 0.55);
    // Head.
    ctx.fillStyle = bailed ? '#9a9aa6' : theme.palette.rider;
    ctx.beginPath();
    ctx.arc(lean, deckTop - torsoH - h * 0.18, h * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Path helper: a rounded rectangle (no fill — caller fills/strokes). */
  function roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  return {
    draw(world: WorldState): void {
      const { width, height } = layout;
      ctx.clearRect(0, 0, width, height);

      drawBackground(world);
      drawGround(world);

      // Obstacles behind the board, then the board on top.
      for (const o of world.obstacles) drawObstacle(o);
      drawBoard(world);

      // Bail: desaturating crash tint over the whole frame (HUD text is Slice 3).
      if (world.status === 'bailed') {
        ctx.fillStyle = theme.palette.bailTint;
        ctx.fillRect(0, 0, width, height);
      }
    },
    resize(w: number, h: number): void {
      layout = computeLayout(w, h, theme.groundLineRatio);
    },
  };
}
