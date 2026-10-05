import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  publicDir: 'public',
  server: {
    port: 5173
  },
  build: {
    outDir: 'dist',
    target: 'es2022'
  },
  test: {
    environment: 'node'
  }
});
