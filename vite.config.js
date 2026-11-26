import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// One HTML entry per spike. Add new spikes here.
export default defineConfig({
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 700, // three.js alone is ~500 kB minified
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        yuhome: resolve(import.meta.dirname, 'yuhome/index.html'),
      },
    },
  },
});
