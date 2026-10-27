import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Sample data lives in ../data/samples (single source of truth shared with the backend/tests).
    alias: { '@data': path.resolve(here, '../data/samples') },
  },
  server: {
    port: 5173,
    fs: { allow: ['..'] }, // let the dev server read ../data/samples
  },
})
