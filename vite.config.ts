import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The production build is served from https://<user>.github.io/workout/
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/workout/' : '/',
  plugins: [react()],
  server: { port: 5173, host: true },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: { manualChunks: { recharts: ['recharts'], react: ['react', 'react-dom'] } },
    },
  },
}));
