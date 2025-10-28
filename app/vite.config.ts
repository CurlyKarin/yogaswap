import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  root: path.resolve(__dirname), // <-- Root für Vite
  publicDir: 'public',
  plugins: [react()],
  build: {
    outDir: 'build',
  },
  resolve: {
    alias: {
      'shared': path.resolve(__dirname, '../shared/dist'), // Checkmark neu
    },
    dedupe: ['react', 'react-dom'], // Checkmark WICHTIG!
  },
  optimizeDeps: {
    include: ['react', 'react-dom'], // Checkmark Vite muss react vorab laden
  },
});