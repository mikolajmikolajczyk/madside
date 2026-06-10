import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': r('./src/core'),
      '@ports': r('./src/ports'),
      '@adapters': r('./src/adapters'),
      '@services': r('./src/services'),
      '@plugins': r('./src/plugins'),
      '@app': r('./src/app'),
      '@ui': r('./src/ui'),
    },
  },
})
