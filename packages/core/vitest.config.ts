import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pipeline §4-prevention: tests must exit cleanly and fast — bound every
    // case + hook so a stuck test aborts instead of wedging the whole run.
    testTimeout: 5000,
    hookTimeout: 5000,
    teardownTimeout: 5000,
  },
});
