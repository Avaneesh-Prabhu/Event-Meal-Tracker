import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify: file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Forward API + Socket.IO calls to the backend (`npm run server`) so the
      // frontend can always use same-origin relative URLs -- no CORS config
      // needed in dev, and it matches how server/index.js serves both from
      // one origin in production.
      proxy: {
        '/api': {
          target: process.env.API_PROXY_TARGET || 'http://localhost:4000',
          changeOrigin: true,
        },
        '/socket.io': {
          target: process.env.API_PROXY_TARGET || 'http://localhost:4000',
          ws: true,
          changeOrigin: true,
        },
      },
    },
  };
});
