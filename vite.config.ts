import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: 5173,
    open: false
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'esnext'
  },
  // @ts-expect-error vitest config
  test: {
    globals: true,
    environment: 'jsdom'
  }
});
