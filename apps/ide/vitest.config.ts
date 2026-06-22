import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// Repo-wide test runner. Lives in apps/ide (the app package) so every runtime
// dep — react, the @madside/* packages — resolves from this package's
// node_modules; the include globs reach back to the root tests/ and the
// packages/** co-located tests. Mirrors vite.config.ts's aliases (resolved from
// apps/ide): app layers at ./src, core/ports at ../../packages. Tests run
// headless (no jsdom by default) per ADR-0005; opt-in environment per test file
// via `// @vitest-environment happy-dom`.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@core$/,       replacement: r('../../packages/core/src') },
      { find: /^@core\//,      replacement: r('../../packages/core/src/') },
      { find: /^@ports$/,      replacement: r('../../packages/ports/src') },
      { find: /^@ports\//,     replacement: r('../../packages/ports/src/') },
      // Resolve every @madside/* workspace package to its dir so the root
      // tests/ (which aren't a package and can't resolve workspace deps from
      // their own node_modules) still find them; each package.json "main"
      // routes to src/index.ts (plugins/core/ports) or index.js (wasm-*).
      { find: /^@madside\/(.+)$/, replacement: r('../../packages/$1') },
      { find: /^@adapters$/,   replacement: r('./src/adapters') },
      { find: /^@adapters\//,  replacement: r('./src/adapters/') },
      { find: /^@app$/,        replacement: r('./src/app') },
      { find: /^@app\//,       replacement: r('./src/app/') },
      { find: /^@ui$/,         replacement: r('./src/ui') },
      { find: /^@ui\//,        replacement: r('./src/ui/') },
    ],
  },
  test: {
    // Target each package's own src/ + test/ dirs directly. A broad
    // `packages/**` glob would also reach packages/<X>/node_modules, where the
    // workspace symlinks re-expose every other package's tests — running the
    // same file once per consumer (the default node_modules exclude misses them
    // because this include is rooted above apps/ide via `../`).
    include: [
      'src/**/*.test.ts',
      '../../packages/*/src/**/*.test.ts',
      '../../packages/*/test/**/*.test.ts',
      '../../tests/**/*.test.ts',
    ],
    environment: 'node',
    globals: false,
  },
})
