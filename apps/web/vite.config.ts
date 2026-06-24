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
  },
});
