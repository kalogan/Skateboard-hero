import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure logic only (advance/storage); no DOM env needed.
    testTimeout: 5000,
    hookTimeout: 5000,
    teardownTimeout: 5000,
  },
});
