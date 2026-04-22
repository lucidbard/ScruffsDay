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
  // Note: previously ignored drag-save output files here, but that prevented
  // editor-driven JSON/data changes from propagating. Accept the reload on
  // drag-save; it's brief and ensures edits always take effect.
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
