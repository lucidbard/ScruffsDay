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
  server: {
    // Debug-mode writes to these files (LayoutEditor drag autosave, DebugPanel
    // dialogue/NPC edits, PerchDebugOverlay save). Excluding them from HMR keeps
    // the running session from reloading every drag-drop. Manual refresh picks
    // up the new values.
    watch: {
      ignored: [
        '**/src/data/walkable-areas.json',
        '**/src/data/npc-configs.json',
        '**/src/data/dialogue.json',
        '**/public/assets/perch-data/**',
      ],
    },
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
