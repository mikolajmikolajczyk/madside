import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

const appVersion = (JSON.parse(readFileSync(r('./package.json'), 'utf8')) as { version: string }).version

// https://vite.dev/config/
export default defineConfig({
  // Compile-time app version (read from package.json) — see src/ui/vite-env.d.ts.
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react()],
  // Pre-bundle the lazily-imported emulator dep up front. jsnes is reached only
  // through dynamic import() (createWorkbench's NES backend factory), so Vite's
  // scanner can miss it — the first NES boot would then trigger an on-the-fly
  // re-optimize + full page reload (a multi-second stall). Listing it keeps the
  // dep optimize one-shot.
  optimizeDeps: {
    include: ['jsnes'],
  },
  resolve: {
    alias: [
      { find: /^@core$/,       replacement: r('./src/core') },
      { find: /^@core\//,      replacement: r('./src/core/') },
      { find: /^@ports$/,      replacement: r('./src/ports') },
      { find: /^@ports\//,     replacement: r('./src/ports/') },
      { find: /^@adapters$/,   replacement: r('./src/adapters') },
      { find: /^@adapters\//,  replacement: r('./src/adapters/') },
      { find: /^@services$/,   replacement: r('./src/services') },
      { find: /^@services\//,  replacement: r('./src/services/') },
      { find: /^@plugins$/,    replacement: r('./src/plugins') },
      { find: /^@plugins\//,   replacement: r('./src/plugins/') },
      { find: /^@app$/,        replacement: r('./src/app') },
      { find: /^@app\//,       replacement: r('./src/app/') },
      { find: /^@ui$/,         replacement: r('./src/ui') },
      { find: /^@ui\//,        replacement: r('./src/ui/') },
    ],
  },
})
