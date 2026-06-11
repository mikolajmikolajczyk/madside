import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import boundaries from 'eslint-plugin-boundaries'
import importPlugin from 'eslint-plugin-import'
import { defineConfig, globalIgnores } from 'eslint/config'

// Layer table from ADR-0002. Update tsconfig.app.json + vite.config.ts paths in
// lockstep when adding a layer; ESLint resolves @-aliases via the tsconfig.
const layers = ['core', 'ports', 'adapters', 'services', 'plugins', 'app', 'ui']

const elementTypes = layers.map((name) => ({
  type: name,
  pattern: `src/${name}/*`,
  mode: 'folder',
}))

// allow[X] = which layers X may import. Mirror of ADR-0002's table.
// Same-layer imports are always permitted; added explicitly per row.
const allowed = {
  core: ['core'],
  ports: ['core', 'ports'],
  adapters: ['core', 'ports', 'adapters'],
  services: ['core', 'ports', 'services'],
  plugins: ['core', 'ports', 'plugins'],
  app: ['core', 'ports', 'services', 'plugins', 'adapters', 'app'],
  ui: ['core', 'ports', 'services', 'app', 'ui'],
}

// boundaries/element-types rule shape: { from: ['layer-name'], allow: [...types] }
const dependencyRules = layers.map((from) => ({
  from: [from],
  allow: allowed[from],
}))

export default defineConfig([
  globalIgnores([
    'dist',
    'node_modules',
    '_notes',
    'public',
    '.direnv',
    '.emcache',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: { boundaries, import: importPlugin },
    settings: {
      'boundaries/elements': elementTypes,
      'boundaries/include': ['src/**/*'],
      'import/resolver': {
        typescript: { project: './tsconfig.app.json' },
      },
    },
    rules: {
      'boundaries/element-types': [
        'error',
        { default: 'disallow', rules: dependencyRules },
      ],

      // React-hooks v7 ships a batch of React-Compiler-readiness rules
      // (set-state-in-effect, refs, preserve-manual-memoization). Existing
      // UI works at runtime; refactoring for the compiler comes after M3
      // when service extraction touches these surfaces. Downgrade to warn so
      // they're visible but don't block.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'preserve-caught-error': 'off',

      // Module barrel discipline: cross-folder imports use a folder's barrel.
      // Forbid only deep alias paths (depth >= 2); leave relative imports
      // (`./sibling`, `./sub/file`) alone — those are intra-folder concerns.
      // External deps (react, vitest, …) are also untouched.
      'import/no-internal-modules': [
        'error',
        {
          forbid: [
            '@core/*/*',
            '@ports/*/*',
            '@adapters/*/*',
            '@services/*/*',
            '@plugins/*/*',
            '@app/*/*',
            '@ui/*/*',
          ],
        },
      ],
      // main.tsx + Vite entry sit at src/ root — not a layer. Exempt from
      // boundaries; they're allowed to import from @ui.
    },
  },
  {
    files: ['src/main.tsx'],
    rules: { 'boundaries/element-types': 'off' },
  },
  {
    // Radix wrapper components re-export primitive parts as `const`. The
    // react-refresh rule misclassifies those as non-component exports.
    files: ['src/ui/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
])
