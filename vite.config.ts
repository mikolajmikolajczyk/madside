import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
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
  server: {
    // Bind all interfaces so the dev server is reachable over Tailscale (and
    // LAN) — not just localhost. Vite rejects requests whose Host header isn't
    // allow-listed (DNS-rebinding guard); '.ts.net' admits the Tailscale
    // MagicDNS hostname (leading dot = any subdomain) without pinning a machine.
    host: true,
    allowedHosts: ['.ts.net'],
  },
  // React Compiler (#28): auto-memoizes components at build time so re-renders
  // skip unchanged work without hand-written useMemo/useCallback/memo. plugin-
  // react v6 runs on OXC, so the compiler is wired as a Babel preset through
  // @rolldown/plugin-babel. React 19 ships the compiler runtime, so there's no
  // extra runtime dep. Requires Rules-of-React compliance — enforced by the
  // react-hooks compiler-readiness eslint rules (refs / set-state-in-effect /
  // preserve-manual-memoization).
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  // Pre-bundle the lazily-imported emulator dep up front. jsnes is reached only
  // through dynamic import() (createWorkbench's NES backend factory), so Vite's
  // scanner can miss it — the first NES boot would then trigger an on-the-fly
  // re-optimize + full page reload (a multi-second stall). Listing it keeps the
  // dep optimize one-shot.
  optimizeDeps: {
    include: ['jsnes'],
  },
  build: {
    rollupOptions: {
      output: {
        // Split the big eager vendors out of the index chunk so they cache
        // independently and load in parallel (react-dom, CodeMirror, and Radix
        // are the heavy ones). Everything else stays in the entry chunk.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
          if (id.includes('@codemirror') || id.includes('@lezer')) return 'codemirror'
          if (id.includes('@radix-ui')) return 'radix'
        },
      },
    },
  },
  resolve: {
    alias: [
      { find: /^@core$/,       replacement: r('./packages/core/src') },
      { find: /^@core\//,      replacement: r('./packages/core/src/') },
      { find: /^@ports$/,      replacement: r('./packages/ports/src') },
      { find: /^@ports\//,     replacement: r('./packages/ports/src/') },
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
