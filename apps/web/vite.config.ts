import { defineConfig } from 'vite';

export default defineConfig({
  // Keep the worker app self-contained; the workspace packages are consumed as
  // TypeScript source (their package `exports` point at src), so Vite transpiles
  // them directly — no pre-build step, no stale-dist class of bug.
  server: {
    host: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Two entries: the product (`index.html`) and the dev-only preview harness
    // (`preview.html`). Both build, so `dist/preview.html` is served at
    // `/preview.html` (the Architect adds the `/preview` rewrite). The harness
    // shell + dev CSS live only behind this second entry — never the product.
    rollupOptions: {
      input: {
        main: 'index.html',
        preview: 'preview.html',
      },
    },
  },
});
