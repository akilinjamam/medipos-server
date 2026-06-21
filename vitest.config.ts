import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Sets required env vars before any module (incl. config/env) is imported.
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
  },
});
