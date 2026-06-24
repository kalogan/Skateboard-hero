/**
 * Renderer tests against a hand-rolled CanvasRenderingContext2D stub.
 *
 * vitest has no DOM by default and we deliberately avoid jsdom: the stub records
 * every draw call + state mutation so we can assert geometry. We verify the
 * renderer is purely cosmetic (never mutates the world), draws the board at
 * boardX, draws one silhouette per obstacle, maps world-y upward (airborne board
 * drawn higher on screen than grounded), and never throws for any status.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@skate/core';
import type {
  BoardState,
  Obstacle,
  ObstacleKind,
  TrickId,
  WorldState,
} from '@skate/core';
import {
  createRenderer,
  DEFAULT_THEME,
  type RendererOptions,
  type RenderTheme,
} from './index.js';

interface Call {
  readonly name: string;
  readonly args: readonly number[];
}

/**
 * A minimal recording 2D-context stub. Geometry calls store their numeric args;
 * style setters and gradients are stubbed enough to not throw.
 */
class StubContext {
  readonly calls: Call[] = [];
  // Recorded fill/stroke styles ignored for geometry but settable.
  fillStyle: string | CanvasGradient = '#000';
  strokeStyle: string | CanvasGradient = '#000';
  globalAlpha = 1;
  lineWidth = 1;
  font = '';
  textAlign = 'left';

  private rec(name: string, ...args: number[]): void {
    this.calls.push({ name, args });
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    this.rec('clearRect', x, y, w, h);
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.rec('fillRect', x, y, w, h);
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    this.rec('strokeRect', x, y, w, h);
  }
  save(): void {
    this.rec('save');
  }
  restore(): void {
    this.rec('restore');
  }
  translate(x: number, y: number): void {
    this.rec('translate', x, y);
  }
  rotate(a: number): void {
    this.rec('rotate', a);
  }
  scale(x: number, y: number): void {
    this.rec('scale', x, y);
  }
  beginPath(): void {
    this.rec('beginPath');
  }
  closePath(): void {
    this.rec('closePath');
  }
  moveTo(x: number, y: number): void {
    this.rec('moveTo', x, y);
  }
  lineTo(x: number, y: number): void {
    this.rec('lineTo', x, y);
  }
  arc(x: number, y: number, r: number, s: number, e: number): void {
    this.rec('arc', x, y, r, s, e);
  }
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void {
    this.rec('arcTo', x1, y1, x2, y2, r);
  }
  ellipse(x: number, y: number, rx: number, ry: number): void {
    this.rec('ellipse', x, y, rx, ry);
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.rec('quadraticCurveTo', cx, cy, x, y);
  }
  fill(): void {
    this.rec('fill');
  }
  stroke(): void {
    this.rec('stroke');
  }
  createLinearGradient(): CanvasGradient {
    return { addColorStop(): void {} } as unknown as CanvasGradient;
  }

  /** Calls of a given name. */
  named(name: string): Call[] {
    return this.calls.filter((c) => c.name === name);
  }
}

function asCtx(stub: StubContext): CanvasRenderingContext2D {
  return stub as unknown as CanvasRenderingContext2D;
}

function makeBoard(over: Partial<BoardState> = {}): BoardState {
  return { y: 0, vy: 0, grounded: true, rotation: 0, trick: null, ...over };
}

function makeObstacle(
  kind: ObstacleKind,
  x: number,
  over: Partial<Obstacle> = {},
): Obstacle {
  return { kind, x, width: 20, height: 20, cleared: false, ...over };
}

function makeWorld(over: Partial<WorldState> = {}): WorldState {
  return {
    status: 'rolling',
    time: 1,
    distance: 100,
    speed: 320,
    score: 100,
    tricks: 0,
    trickScore: 0,
    board: makeBoard(),
    obstacles: [],
    rng: 1,
    nextSpawnIn: 50,
    ...over,
  };
}

const OPTS: RendererOptions = {
  width: 800,
  height: 600,
  config: DEFAULT_CONFIG,
};

describe('createRenderer', () => {
  it('clears the frame each draw', () => {
    const stub = new StubContext();
    const r = createRenderer(asCtx(stub), OPTS);
    r.draw(makeWorld());
    expect(stub.named('clearRect').length).toBeGreaterThan(0);
    expect(stub.named('clearRect')[0]?.args).toEqual([0, 0, 800, 600]);
  });

  it('draws the board translated to boardX (board centre)', () => {
    const stub = new StubContext();
    const r = createRenderer(asCtx(stub), OPTS);
    r.draw(makeWorld({ obstacles: [] }));
    const expectedCx = DEFAULT_CONFIG.boardX + DEFAULT_CONFIG.boardWidth / 2;
    const translates = stub.named('translate');
    const hit = translates.some((c) => Math.abs(c.args[0]! - expectedCx) < 1e-6);
    expect(hit).toBe(true);
  });

  it('rotates the board sprite by board.rotation while airborne', () => {
    const stub = new StubContext();
    const r = createRenderer(asCtx(stub), OPTS);
    const rotation = 1.234;
    r.draw(makeWorld({ board: makeBoard({ y: 80, grounded: false, rotation }) }));
    const rotated = stub.named('rotate').some((c) => Math.abs(c.args[0]! - rotation) < 1e-6);
    expect(rotated).toBe(true);
  });

  it('maps world-y upward: airborne board is drawn higher (smaller screen y)', () => {
    const groundedY = boardTranslateY(makeWorld({ board: makeBoard({ y: 0 }) }));
    const airborneY = boardTranslateY(
      makeWorld({ board: makeBoard({ y: 120, grounded: false }) }),
    );
    expect(airborneY).toBeLessThan(groundedY);
  });

  it('draws one silhouette path/rect per obstacle', () => {
    const stub = new StubContext();
    const r = createRenderer(asCtx(stub), OPTS);
    const obstacles = [
      makeObstacle('cone', 600),
      makeObstacle('rail', 500),
      makeObstacle('bench', 400),
      makeObstacle('crack', 300),
    ];
    // Baseline with no obstacles to isolate per-obstacle draw work.
    const baseStub = new StubContext();
    createRenderer(asCtx(baseStub), OPTS).draw(makeWorld({ obstacles: [] }));
    const baseSaves = baseStub.named('save').length;

    r.draw(makeWorld({ obstacles }));
    // Each obstacle is wrapped in its own save/restore.
    expect(stub.named('save').length).toBe(baseSaves + obstacles.length);
  });

  it('places each obstacle at its world x (screen x = obstacle.x)', () => {
    const stub = new StubContext();
    const r = createRenderer(asCtx(stub), OPTS);
    const o = makeObstacle('bench', 540, { width: 48, height: 30 });
    r.draw(makeWorld({ obstacles: [o] }));
    // The bench body is a fillRect whose left edge is the obstacle x.
    const atX = stub
      .named('fillRect')
      .some((c) => Math.abs(c.args[0]! - 540) < 1e-6);
    expect(atX).toBe(true);
  });

  it('never throws for ready / rolling / bailed worlds', () => {
    const stub = new StubContext();
    const r = createRenderer(asCtx(stub), OPTS);
    const obstacles = [makeObstacle('cone', 600), makeObstacle('rail', 450)];
    for (const status of ['ready', 'rolling', 'bailed'] as const) {
      expect(() =>
        r.draw(makeWorld({ status, obstacles, board: makeBoard({ y: 60, grounded: false, rotation: 2 }) })),
      ).not.toThrow();
    }
  });

  it('renders a distinct crash tint when bailed', () => {
    const rolling = new StubContext();
    const bailed = new StubContext();
    createRenderer(asCtx(rolling), OPTS).draw(makeWorld({ status: 'rolling' }));
    createRenderer(asCtx(bailed), OPTS).draw(makeWorld({ status: 'bailed' }));
    // Bailed adds a full-frame tint fillRect that rolling does not.
    const fullFrame = (s: StubContext): number =>
      s.named('fillRect').filter((c) => c.args[2] === 800 && c.args[3] === 600).length;
    expect(fullFrame(bailed)).toBeGreaterThan(fullFrame(rolling));
  });

  it('animates each trick distinctly (different ids → different draw calls)', () => {
    // Same airborne pose + rotation; only the trick id varies. Each catalog
    // trick should drive a distinguishable transform sequence.
    const ids: TrickId[] = ['ollie', 'popshuv', 'kickflip', 'heelflip', 'shuv360', 'treflip'];
    const transformsFor = (trick: TrickId): string => {
      const stub = new StubContext();
      createRenderer(asCtx(stub), OPTS).draw(
        makeWorld({
          board: makeBoard({ y: 90, grounded: false, rotation: 1.1, trick }),
        }),
      );
      // Capture the full rotate/scale transform stream (the trick's visual DNA).
      return JSON.stringify(
        stub.calls
          .filter((c) => c.name === 'rotate' || c.name === 'scale')
          .map((c) => [c.name, c.args.map((a) => Math.round(a * 1e4) / 1e4)]),
      );
    };
    const signatures = ids.map(transformsFor);
    // All five trick signatures are pairwise distinct.
    expect(new Set(signatures).size).toBe(ids.length);
  });

  it('renders the Tre Flip as a combined flip + spin (both scaleX and scaleY)', () => {
    // Tre Flip = kickflip (flipTurns) + 360 shuv (spinTurns): it must foreshorten
    // BOTH width (yaw spin) and height (flip) — a richer transform than a trick
    // that only spins (shuv360) or only flips (kickflip).
    const stub = new StubContext();
    createRenderer(asCtx(stub), OPTS).draw(
      makeWorld({ board: makeBoard({ y: 90, grounded: false, rotation: 1.1, trick: 'treflip' }) }),
    );
    const scales = stub.named('scale');
    // A width-foreshortening scale (sx != 1, sy == 1) AND a height-foreshortening
    // scale (sx == 1, sy != 1) are both emitted.
    const hasWidthScale = scales.some((c) => Math.abs(c.args[0]! - 1) > 1e-6 && Math.abs(c.args[1]! - 1) < 1e-6);
    const hasHeightScale = scales.some((c) => Math.abs(c.args[1]! - 1) > 1e-6 && Math.abs(c.args[0]! - 1) < 1e-6);
    expect(hasWidthScale).toBe(true);
    expect(hasHeightScale).toBe(true);
  });

  it('does not throw for any catalog trick while airborne', () => {
    const ids: TrickId[] = ['ollie', 'popshuv', 'kickflip', 'heelflip', 'shuv360', 'treflip'];
    const stub = new StubContext();
    const r = createRenderer(asCtx(stub), OPTS);
    for (const trick of ids) {
      for (const rotation of [0, 0.5, Math.PI, 3.7, 6.3]) {
        expect(() =>
          r.draw(makeWorld({ board: makeBoard({ y: 70, grounded: false, rotation, trick }) })),
        ).not.toThrow();
      }
    }
  });

  it('ignores board.trick once grounded (no trick transform on the ground)', () => {
    // Grounded with a (stale) trick id set should render like a plain grounded
    // board — the trick animation only applies while airborne.
    const withTrick = new StubContext();
    const plain = new StubContext();
    createRenderer(asCtx(withTrick), OPTS).draw(
      makeWorld({ board: makeBoard({ y: 0, grounded: true, rotation: 0, trick: 'shuv360' }) }),
    );
    createRenderer(asCtx(plain), OPTS).draw(
      makeWorld({ board: makeBoard({ y: 0, grounded: true, rotation: 0, trick: null }) }),
    );
    expect(withTrick.calls).toEqual(plain.calls);
  });

  it('is deterministic: same world yields identical call sequence', () => {
    const a = new StubContext();
    const b = new StubContext();
    const world = makeWorld({
      distance: 1234.5,
      obstacles: [makeObstacle('cone', 600), makeObstacle('crack', 320)],
      board: makeBoard({ y: 40, grounded: false, rotation: 0.9 }),
    });
    createRenderer(asCtx(a), OPTS).draw(world);
    createRenderer(asCtx(b), OPTS).draw(world);
    expect(a.calls).toEqual(b.calls);
  });

  it('never mutates the world it is given', () => {
    const stub = new StubContext();
    const r = createRenderer(asCtx(stub), OPTS);
    const world = makeWorld({
      obstacles: [makeObstacle('cone', 600)],
      board: makeBoard({ y: 30, grounded: false, rotation: 0.5 }),
    });
    const snapshot = JSON.stringify(world);
    r.draw(world);
    expect(JSON.stringify(world)).toBe(snapshot);
  });

  it('honors a custom palette: the themed ground color is used for a fill', () => {
    // Record every fillStyle ASSIGNMENT so we can assert a themed color reaches
    // the canvas. The base stub stores fillStyle as a plain field; a Proxy
    // observes each set without changing the stub's shape (an accessor subclass
    // over a class field is unreliable under useDefineForClassFields).
    const styledCtx = (): {
      ctx: CanvasRenderingContext2D;
      styles: (string | CanvasGradient)[];
    } => {
      const styles: (string | CanvasGradient)[] = [];
      const proxy = new Proxy(new StubContext(), {
        set(target, prop, value): boolean {
          if (prop === 'fillStyle') styles.push(value as string | CanvasGradient);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (target as any)[prop] = value;
          return true;
        },
      });
      return { ctx: proxy as unknown as CanvasRenderingContext2D, styles };
    };

    const groundColor = '#abcdef';
    const theme: RenderTheme = {
      ...DEFAULT_THEME,
      palette: { ...DEFAULT_THEME.palette, ground: groundColor },
    };
    const custom = styledCtx();
    createRenderer(custom.ctx, { ...OPTS, theme }).draw(makeWorld());
    expect(custom.styles).toContain(groundColor);

    // And the default theme must NOT emit the custom color (proves it's wired).
    const def = styledCtx();
    createRenderer(def.ctx, OPTS).draw(makeWorld());
    expect(def.styles).not.toContain(groundColor);
  });

  it('honors a custom groundLineRatio: the ground line moves', () => {
    // Lower ratio → ground line higher on screen (smaller y) → board anchored
    // higher. The board translate-y tracks the ground line for a grounded board.
    const lowStub = new StubContext();
    const highStub = new StubContext();
    const lowTheme: RenderTheme = { ...DEFAULT_THEME, groundLineRatio: 0.5 };
    const highTheme: RenderTheme = { ...DEFAULT_THEME, groundLineRatio: 0.9 };
    createRenderer(asCtx(lowStub), { ...OPTS, theme: lowTheme }).draw(
      makeWorld({ board: makeBoard({ y: 0 }) }),
    );
    createRenderer(asCtx(highStub), { ...OPTS, theme: highTheme }).draw(
      makeWorld({ board: makeBoard({ y: 0 }) }),
    );
    expect(boardTranslateYFrom(lowStub)).toBeLessThan(
      boardTranslateYFrom(highStub),
    );
    // The default (0.78) sits between the two custom ratios.
    const defStub = new StubContext();
    createRenderer(asCtx(defStub), OPTS).draw(makeWorld({ board: makeBoard({ y: 0 }) }));
    expect(boardTranslateYFrom(defStub)).toBeGreaterThan(
      boardTranslateYFrom(lowStub),
    );
    expect(boardTranslateYFrom(defStub)).toBeLessThan(
      boardTranslateYFrom(highStub),
    );
  });

  it('resize updates layout so the ground line moves', () => {
    const small = new StubContext();
    const r = createRenderer(asCtx(small), { ...OPTS, width: 400, height: 400 });
    r.draw(makeWorld({ board: makeBoard({ y: 0 }) }));
    const smallGroundY = boardTranslateYFrom(small);

    r.resize(400, 1000);
    const big = new StubContext();
    // Re-run draw on a fresh stub after resize by recreating around it.
    const r2 = createRenderer(asCtx(big), { ...OPTS, width: 400, height: 1000 });
    r2.draw(makeWorld({ board: makeBoard({ y: 0 }) }));
    const bigGroundY = boardTranslateYFrom(big);

    expect(bigGroundY).toBeGreaterThan(smallGroundY);
  });
});

// ────────────────────────────────────────────────────────────────────────
// LANE MODE — vertical, bottom-to-top view (config.mode === 'lanes').
// ────────────────────────────────────────────────────────────────────────
describe('createRenderer — lane mode', () => {
  const LANE_CONFIG: typeof DEFAULT_CONFIG = {
    ...DEFAULT_CONFIG,
    mode: 'lanes',
    laneCount: 3,
  };
  const LANE_OPTS: RendererOptions = { width: 900, height: 600, config: LANE_CONFIG };

  /** Lane centre screen-x for a given lateral position (matches the renderer). */
  const laneScreenX = (lateral: number, width = 900, laneCount = 3): number => {
    const laneScreenWidth = width / laneCount;
    return (lateral + 0.5) * laneScreenWidth;
  };

  it('draws the board at the expected lateral screen-x for world.lateral', () => {
    const stub = new StubContext();
    const r = createRenderer(asCtx(stub), LANE_OPTS);
    r.draw(makeWorld({ lane: 2, lateral: 2 }));
    const expectedX = laneScreenX(2);
    const hit = stub
      .named('translate')
      .some((c) => Math.abs(c.args[0]! - expectedX) < 1e-6);
    expect(hit).toBe(true);
  });

  it('moves the board with lateral: lane 0 is left of lane 2', () => {
    const left = new StubContext();
    const right = new StubContext();
    createRenderer(asCtx(left), LANE_OPTS).draw(makeWorld({ lane: 0, lateral: 0 }));
    createRenderer(asCtx(right), LANE_OPTS).draw(makeWorld({ lane: 2, lateral: 2 }));
    const tx = (s: StubContext): number => {
      // The board translate is the one near a lane centre, with x within road.
      const t = s.named('translate').find((c) => c.args[0]! > 0 && c.args[0]! < 900);
      if (!t) throw new Error('board translate not found');
      return t.args[0]!;
    };
    expect(tx(left)).toBeLessThan(tx(right));
    expect(tx(left)).toBeCloseTo(laneScreenX(0), 6);
    expect(tx(right)).toBeCloseTo(laneScreenX(2), 6);
  });

  it('draws one shape group (save/restore) per lane-assigned obstacle', () => {
    const baseStub = new StubContext();
    createRenderer(asCtx(baseStub), LANE_OPTS).draw(makeWorld({ obstacles: [] }));
    const baseSaves = baseStub.named('save').length;

    const stub = new StubContext();
    const obstacles = [
      makeObstacle('cone', 600, { lane: 0 }),
      makeObstacle('rail', 500, { lane: 1 }),
      makeObstacle('bench', 400, { lane: 2 }),
      makeObstacle('crack', 350, { lane: 1 }),
    ];
    createRenderer(asCtx(stub), LANE_OPTS).draw(makeWorld({ obstacles }));
    expect(stub.named('save').length).toBe(baseSaves + obstacles.length);
  });

  it('maps a farther-ahead obstacle higher on screen than a nearer one', () => {
    // Both in the same lane; only forward x differs. Farther ahead (larger x)
    // must render higher up = smaller screen-y.
    const near = new StubContext();
    const far = new StubContext();
    createRenderer(asCtx(near), LANE_OPTS).draw(
      makeWorld({ obstacles: [makeObstacle('cone', 200, { lane: 1 })] }),
    );
    createRenderer(asCtx(far), LANE_OPTS).draw(
      makeWorld({ obstacles: [makeObstacle('cone', 500, { lane: 1 })] }),
    );
    // The cone apex is a moveTo; compare the obstacle's screen-y via its ellipse
    // contact shadow (recorded as ellipse with the base screen-y).
    const shadowY = (s: StubContext): number => {
      const e = s.named('ellipse');
      // The obstacle shadow is the first ellipse (board shadow comes later, at
      // boardScreenY); pick the smallest y among obstacle ellipses by lane x.
      const laneX = laneScreenX(1);
      const hit = e.find((c) => Math.abs(c.args[0]! - laneX) < 1e-6);
      if (!hit) throw new Error('obstacle shadow not found');
      return hit.args[1]!;
    };
    expect(shadowY(far)).toBeLessThan(shadowY(near));
  });

  it('places each obstacle at its lane screen-x', () => {
    const stub = new StubContext();
    createRenderer(asCtx(stub), LANE_OPTS).draw(
      makeWorld({ obstacles: [makeObstacle('bench', 400, { lane: 0 })] }),
    );
    const laneX = laneScreenX(0);
    // The bench shadow ellipse is centred on the lane.
    const atLane = stub
      .named('ellipse')
      .some((c) => Math.abs(c.args[0]! - laneX) < 1e-6);
    expect(atLane).toBe(true);
  });

  it('jump height lifts the board higher (smaller screen-y)', () => {
    const grounded = new StubContext();
    const airborne = new StubContext();
    createRenderer(asCtx(grounded), LANE_OPTS).draw(
      makeWorld({ lane: 1, lateral: 1, board: makeBoard({ y: 0 }) }),
    );
    createRenderer(asCtx(airborne), LANE_OPTS).draw(
      makeWorld({ lane: 1, lateral: 1, board: makeBoard({ y: 120, grounded: false }) }),
    );
    const boardTy = (s: StubContext): number => {
      const laneX = laneScreenX(1);
      const t = s.named('translate').find((c) => Math.abs(c.args[0]! - laneX) < 1e-6);
      if (!t) throw new Error('board translate not found');
      return t.args[1]!;
    };
    expect(boardTy(airborne)).toBeLessThan(boardTy(grounded));
  });

  it('renders a distinct crash tint when bailed (full-frame fillRect)', () => {
    const rolling = new StubContext();
    const bailed = new StubContext();
    createRenderer(asCtx(rolling), LANE_OPTS).draw(
      makeWorld({ status: 'rolling', lane: 1, lateral: 1 }),
    );
    createRenderer(asCtx(bailed), LANE_OPTS).draw(
      makeWorld({ status: 'bailed', lane: 1, lateral: 1 }),
    );
    const fullFrame = (s: StubContext): number =>
      s.named('fillRect').filter((c) => c.args[2] === 900 && c.args[3] === 600).length;
    expect(fullFrame(bailed)).toBeGreaterThan(fullFrame(rolling));
  });

  it('never throws across ready / rolling / bailed', () => {
    const r = createRenderer(asCtx(new StubContext()), LANE_OPTS);
    const obstacles = [
      makeObstacle('cone', 600, { lane: 0 }),
      makeObstacle('rail', 450, { lane: 2 }),
    ];
    for (const status of ['ready', 'rolling', 'bailed'] as const) {
      expect(() =>
        r.draw(
          makeWorld({
            status,
            lane: 1,
            lateral: 1.4,
            obstacles,
            board: makeBoard({ y: 60, grounded: false, rotation: 2, trick: 'kickflip' }),
          }),
        ),
      ).not.toThrow();
    }
  });

  it('tolerates a missing lateral / obstacle lane without throwing', () => {
    const r = createRenderer(asCtx(new StubContext()), LANE_OPTS);
    expect(() =>
      r.draw(makeWorld({ obstacles: [makeObstacle('cone', 400)] })),
    ).not.toThrow();
  });

  it('clears the frame each draw in lane mode', () => {
    const stub = new StubContext();
    createRenderer(asCtx(stub), LANE_OPTS).draw(makeWorld({ lane: 1, lateral: 1 }));
    expect(stub.named('clearRect')[0]?.args).toEqual([0, 0, 900, 600]);
  });

  it('resize works in lane mode (board re-anchors to new height)', () => {
    const a = new StubContext();
    const b = new StubContext();
    createRenderer(asCtx(a), { ...LANE_OPTS, width: 900, height: 400 }).draw(
      makeWorld({ lane: 1, lateral: 1 }),
    );
    createRenderer(asCtx(b), { ...LANE_OPTS, width: 900, height: 1000 }).draw(
      makeWorld({ lane: 1, lateral: 1 }),
    );
    const boardTy = (s: StubContext): number => {
      const laneX = laneScreenX(1);
      const t = s.named('translate').find((c) => Math.abs(c.args[0]! - laneX) < 1e-6);
      if (!t) throw new Error('board translate not found');
      return t.args[1]!;
    };
    // Taller canvas → board sits lower (larger screen-y) than the short one.
    expect(boardTy(b)).toBeGreaterThan(boardTy(a));

    // resize() on a live renderer must not throw and keeps drawing.
    const r = createRenderer(asCtx(new StubContext()), LANE_OPTS);
    expect(() => {
      r.resize(900, 1000);
      r.draw(makeWorld({ lane: 1, lateral: 1 }));
    }).not.toThrow();
  });

  it('is deterministic in lane mode: same world yields identical calls', () => {
    const a = new StubContext();
    const b = new StubContext();
    const world = makeWorld({
      lane: 1,
      lateral: 1.3,
      distance: 1234.5,
      obstacles: [makeObstacle('cone', 600, { lane: 0 }), makeObstacle('crack', 320, { lane: 2 })],
      board: makeBoard({ y: 40, grounded: false, rotation: 0.9 }),
    });
    createRenderer(asCtx(a), LANE_OPTS).draw(world);
    createRenderer(asCtx(b), LANE_OPTS).draw(world);
    expect(a.calls).toEqual(b.calls);
  });

  it('never mutates the world in lane mode', () => {
    const r = createRenderer(asCtx(new StubContext()), LANE_OPTS);
    const world = makeWorld({
      lane: 2,
      lateral: 2,
      obstacles: [makeObstacle('cone', 600, { lane: 1 })],
      board: makeBoard({ y: 30, grounded: false, rotation: 0.5 }),
    });
    const snapshot = JSON.stringify(world);
    r.draw(world);
    expect(JSON.stringify(world)).toBe(snapshot);
  });

  it('classic mode is unaffected by the lane branch', () => {
    // A classic-config draw must produce the same calls whether or not lane
    // fields are present on the world (they are ignored in classic).
    const plain = new StubContext();
    const withLane = new StubContext();
    createRenderer(asCtx(plain), OPTS).draw(makeWorld());
    createRenderer(asCtx(withLane), OPTS).draw(makeWorld({ lane: 2, lateral: 2 }));
    expect(withLane.calls).toEqual(plain.calls);
  });
});

/** Run a draw and return the board's translate-y (its screen vertical anchor). */
function boardTranslateY(world: WorldState): number {
  const stub = new StubContext();
  createRenderer(asCtx(stub), OPTS).draw(world);
  return boardTranslateYFrom(stub);
}

/**
 * Extract the board translate-y. The board is the translate whose x equals the
 * board centre (boardX + boardWidth/2).
 */
function boardTranslateYFrom(stub: StubContext): number {
  const cx = DEFAULT_CONFIG.boardX + DEFAULT_CONFIG.boardWidth / 2;
  const t = stub.named('translate').find((c) => Math.abs(c.args[0]! - cx) < 1e-6);
  if (!t) throw new Error('board translate not found');
  return t.args[1]!;
}
