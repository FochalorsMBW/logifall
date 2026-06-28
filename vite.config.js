import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During development the React app runs on :5173 and the API proxy
// (server.js) runs on :3001. Requests to /api are forwarded so the
// Groq API key never reaches the browser.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
