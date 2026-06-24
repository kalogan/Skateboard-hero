/**
 * Preview-harness entry. Mounts the harness SHELL only — no product code path,
 * no server/transport (there is none). Dev/preview-only; never imported by the
 * product (`src/main.ts`). See docs/PREVIEW_HARNESS.md.
 */

import './preview.css';
import { createPreviewApp } from './PreviewApp.js';

const root = document.querySelector<HTMLDivElement>('#preview-root');
if (!root) throw new Error('preview: missing #preview-root mount point');

const app = createPreviewApp(root);

if (import.meta.hot) {
  import.meta.hot.dispose(() => app.dispose());
}
