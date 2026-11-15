import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// base: './' makes the built dist/ work from any static server sub-path.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          codemirror: ['@codemirror/state', '@codemirror/view', '@codemirror/commands', '@codemirror/lint'],
          react: ['react', 'react-dom'],
          motion: ['framer-motion'],
        },
      },
    },
  },
})
