import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import config from '../config.json' with { type: 'json' }

export default defineConfig({
  plugins: [react(), tailwindcss(), babel({ presets: [reactCompilerPreset()] })],
  publicDir: path.resolve(__dirname, '../assets'),
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    chunkSizeWarningLimit: 2000,
    outDir: '../bin/client',
    emptyOutDir: true,
    target: 'esnext',
  },
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${config.port}`,
        changeOrigin: true,
      },
    },
  },
})
