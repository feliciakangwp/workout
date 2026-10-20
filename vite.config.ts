import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Identifies this build; the app compares it with version.json to spot a newer deploy. */
const BUILD_ID = Date.now().toString(36);

/** Writes version.json next to index.html so open apps can tell a new version is live. */
const versionFile = (): Plugin => ({
  name: 'version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
  },
});

// The production build is served from https://<user>.github.io/workout/
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/workout/' : '/',
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: { port: 5173, host: true },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: { manualChunks: { recharts: ['recharts'], react: ['react', 'react-dom'] } },
    },
  },
}));
