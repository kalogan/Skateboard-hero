/**
 * Build a single self-contained HTML file you can open and play anywhere —
 * no server, no assets, no network. Inlines the Vite build's JS + CSS into one
 * file. Run: `pnpm build:standalone` (builds the web app first, then inlines).
 *
 * Output: apps/web/dist-standalone/skateboard-hero.html
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const dist = resolve(repo, 'apps/web/dist');
const assetsDir = resolve(dist, 'assets');

const assets = readdirSync(assetsDir);
const jsFile = assets.find((f) => f.endsWith('.js'));
const cssFile = assets.find((f) => f.endsWith('.css'));
if (!jsFile) throw new Error('no built JS chunk found — run the web build first');

const js = readFileSync(resolve(assetsDir, jsFile), 'utf8');
const css = cssFile ? readFileSync(resolve(assetsDir, cssFile), 'utf8') : '';

// Guard against an accidental literal </script> closing the inline tag early.
const safeJs = js.replace(/<\/script>/gi, '<\\/script>');

let html = readFileSync(resolve(dist, 'index.html'), 'utf8');
html = html
  .replace(/\s*<script\b[^>]*\bsrc="[^"]*"[^>]*><\/script>/g, '')
  .replace(/\s*<link\b[^>]*rel="stylesheet"[^>]*>/g, '')
  .replace('</head>', `  <style>${css}</style>\n</head>`)
  .replace('</body>', `  <script type="module">${safeJs}</script>\n</body>`);

const outDir = resolve(repo, 'apps/web/dist-standalone');
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, 'skateboard-hero.html');
writeFileSync(outFile, html);
console.log(`standalone build: ${outFile} (${(html.length / 1024).toFixed(1)} kB)`);
