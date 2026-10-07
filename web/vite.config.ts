import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // In dev, /api goes to the Functions emulator (same path layout as the Hosting rewrite).
  const functionsUrl = `http://127.0.0.1:5001/${env.VITE_FIREBASE_PROJECT_ID}/us-central1/api`;
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: functionsUrl, changeOrigin: true } },
    },
  };
});
