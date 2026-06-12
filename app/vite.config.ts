import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path';

// https://vite.dev/config/
// Vitest options live under "test"; Vite's UserConfig type doesn't include them, so we merge the type.
export default defineConfig({
  root: path.resolve(__dirname),
  publicDir: 'public',
  plugins: [react()],
  build: {
    outDir: 'build',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('aws-amplify') || id.includes('@aws-amplify')) {
            return 'amplify';
          }
          if (id.includes('react-router') || id.includes('react-router-dom')) {
            return 'react-router';
          }
          if (id.includes('react-dom')) {
            return 'react-dom';
          }
          if (id.includes('/react/')) {
            return 'react';
          }
          if (id.includes('lucide-react')) {
            return 'lucide';
          }
          if (id.includes('axios')) {
            return 'axios';
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      'shared': path.resolve(__dirname, '../shared/dist'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/**/*.test.tsx', 'src/**/*.spec.tsx'],
    setupFiles: 'src/test/setupTests.ts',
    // Viele Tests loggen sehr viel auf stdout/stderr. In manchen Terminals kann das den Run
    // am Ende "hängen" lassen (Output-Buffer). Silent macht den Run zuverlässig.
    silent: true,
  },
} as import('vite').UserConfig);