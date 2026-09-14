/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // dev server at '/', production build served from GitHub Pages under the repo path
  base: command === 'build' ? '/Z-geZ-geZ-ge/' : '/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
