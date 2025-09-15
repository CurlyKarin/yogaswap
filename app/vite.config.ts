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
});