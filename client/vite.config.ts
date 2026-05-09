// STEP 8a — Vite config. The dev proxy is what makes localhost feel like
// production: we hit `/api/...` from the React app, Vite forwards it to
// the Express server, and CORS never enters the picture during dev.
//
// In production, VITE_API_URL takes over (set on Vercel) and points at
// the deployed Render backend.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Generate a manifest so debugging the prod bundle is sane.
    sourcemap: true,
  },
});
