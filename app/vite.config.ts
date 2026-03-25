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
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/**/*.test.tsx', 'src/**/*.spec.tsx'],
    setupFiles: 'src/test/setupTests.ts',
    // Viele Tests loggen sehr viel auf stdout/stderr. In manchen Terminals kann das den Run
    // am Ende "hängen" lassen (Output-Buffer). Silent macht den Run zuverlässig.
    silent: true,
  },
} as import('vite').UserConfig);