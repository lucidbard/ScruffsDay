import { defineConfig } from 'vite';
import path from 'path';
import { debugSavePlugin } from './vite-debug-save-plugin';

export default defineConfig({
  base: '/ScruffsDay/',
  plugins: [debugSavePlugin()],
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
