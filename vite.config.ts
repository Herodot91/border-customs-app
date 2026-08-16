import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: process.env.VERCEL ? '/' : (mode === 'production' ? '/border-customs-app/' : '/'),
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          // Forward /api/* to the Express OTP server
          '/api': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
        },
      },
      plugins: [react()],
      define: {},
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
