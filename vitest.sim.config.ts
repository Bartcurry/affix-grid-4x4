import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/sim/monteCarlo.ts'],
  },
});
