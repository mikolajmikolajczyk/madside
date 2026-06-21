import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// Vitest shares the path aliases with vite.config.ts. Tests run headless
// (no jsdom by default) per ADR-0005; opt-in environment per test file via
// `// @vitest-environment happy-dom`.
export default defineConfig({
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
      { find: /^@app$/,        replacement: r('./src/app') },
      { find: /^@app\//,       replacement: r('./src/app/') },
      { find: /^@ui$/,         replacement: r('./src/ui') },
      { find: /^@ui\//,        replacement: r('./src/ui/') },
    ],
  },
  test: {
    include: ['src/**/*.test.ts', 'packages/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
})
