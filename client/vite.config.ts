import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = `http://127.0.0.1:${process.env.PORT ?? 3001}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: Number(process.env.CLIENT_PORT ?? 5173),
    strictPort: true,
    proxy: {
      // xfwd: 레이트 리밋이 실제 접속 기기 IP 기준으로 동작하도록 X-Forwarded-For 전달
      '/api': { target: api, changeOrigin: false, xfwd: true },
      '/uploads': { target: api, changeOrigin: false, xfwd: true },
      '/socket.io': { target: api, ws: true, changeOrigin: false, xfwd: true },
    },
  },
  preview: { host: true, port: 4173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
