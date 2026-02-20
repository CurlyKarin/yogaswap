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
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
  },
} as import('vite').UserConfig);