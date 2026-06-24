/**
 * Architect runtime smoke (pipeline §5b) — the highest-value layer above the
 * logic gate. Boots the FRESHLY BUILT app on an alt port, drives the three
 * screens (start → playing → game-over), screenshots each, and scans the
 * console/page for errors. Catches the "green-but-broken" and "stale-build"
 * classes the unit gate can't see.
 *
 * Run: `pnpm smoke` (requires `npx playwright install chromium` once).
 * Not part of gate.sh/CI — browsers aren't installed there.
 */

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const PORT = 5191;
const URL = `http://localhost:${PORT}/`;
const SHOTS = process.env.SMOKE_OUT ?? resolve(repo, 'scripts/.smoke');
mkdirSync(SHOTS, { recursive: true });

const fail = (msg) => {
  console.error(`SMOKE FAIL: ${msg}`);
  process.exitCode = 1;
};

async function waitForServer(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

// 1. Serve the built app (vite preview) on an alt port — never the dev server,
//    never the Director's ports.
const server = spawn(
  'pnpm',
  ['--filter', '@skate/web', 'exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: repo, stdio: 'ignore' },
);

let browser;
try {
  if (!(await waitForServer(URL))) throw new Error('preview server never became ready');

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // phone-ish

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto(URL, { waitUntil: 'networkidle' });

  // ── Start screen ──
  const canvas = await page.$('canvas');
  if (!canvas) fail('no <canvas> mounted');
  const startText = (await page.textContent('[data-card]')) ?? '';
  if (!/tap to skate/i.test(startText)) fail(`start overlay missing (saw: "${startText.trim()}")`);
  await page.screenshot({ path: resolve(SHOTS, '1-start.png') });

  // ── Tap to start, let it roll, then ollie a few times ──
  const center = { x: 195, y: 422 };
  await page.mouse.click(center.x, center.y); // start
  await page.waitForTimeout(800);
  const scoreMid = Number((await page.textContent('[data-score]')) ?? '0');
  await page.screenshot({ path: resolve(SHOTS, '2-playing.png') });
  if (!(scoreMid > 0)) fail(`score did not advance while rolling (saw ${scoreMid})`);

  // Drive ollies via Space, and wait for an eventual bail (game-over overlay).
  let reachedOver = false;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    const overlayHidden = await page.getAttribute('[data-overlay]', 'hidden');
    const card = (await page.textContent('[data-card]')) ?? '';
    if (overlayHidden === null && /bailed/i.test(card)) {
      reachedOver = true;
      break;
    }
  }
  await page.screenshot({ path: resolve(SHOTS, '3-over.png') });
  if (!reachedOver) fail('never reached the game-over (bail) state within budget');

  // ── Retry returns to playing ──
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(300);
  const overlayAfterRetry = await page.getAttribute('[data-overlay]', 'hidden');
  if (overlayAfterRetry === null) fail('retry tap did not dismiss the game-over overlay');

  if (consoleErrors.length) fail(`console errors: ${JSON.stringify(consoleErrors)}`);
  if (pageErrors.length) fail(`page errors: ${JSON.stringify(pageErrors)}`);

  if (process.exitCode) {
    console.error('Runtime smoke: ❌ (screenshots in scripts/.smoke)');
  } else {
    console.log('Runtime smoke: ✅ start→play→bail→retry clean, no console/page errors.');
    console.log(`  screenshots: ${SHOTS}/{1-start,2-playing,3-over}.png`);
  }
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
