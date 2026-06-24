/**
 * @skate/render-canvas — a thin, COSMETIC Canvas2D renderer.
 *
 * It reads a `WorldState` and draws it. It must never mutate sim state or carry
 * game logic (pipeline §5: clients are optimistic-cosmetic; the core is
 * authoritative). Slice 2 implements the real drawing; Slice 0 only fixes the
 * seam so the app can wire a renderer in.
 */

import type { SimConfig, WorldState } from '@skate/core';

export interface RendererOptions {
  /** Logical render size in CSS pixels. */
  readonly width: number;
  readonly height: number;
  readonly config: SimConfig;
}

export interface Renderer {
  /** Draw a single frame of the given world. Pure w.r.t. sim state. */
  draw(world: WorldState): void;
  /** React to a resize of the backing canvas. */
  resize(width: number, height: number): void;
}

/**
 * Create a renderer bound to a 2D context. Slice 2 replaces the body with real
 * drawing (board, obstacles, ground, parallax, trick spin, bail). For now it
 * clears the frame so the app has something coherent to mount.
 */
export function createRenderer(
  ctx: CanvasRenderingContext2D,
  options: RendererOptions,
): Renderer {
  let { width, height } = options;

  return {
    draw(_world: WorldState): void {
      ctx.clearRect(0, 0, width, height);
    },
    resize(w: number, h: number): void {
      width = w;
      height = h;
    },
  };
}
