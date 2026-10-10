import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset URLs so the build works from any path (e.g. GitHub Pages' /war-game/).
  base: './',
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test/**'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
