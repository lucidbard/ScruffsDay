import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: '/ScruffsDay/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
