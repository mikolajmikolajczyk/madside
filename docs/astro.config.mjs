import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

// Public documentation for madside (epic de964f7). Hosted at /docs/ on the
// same Pages site as the IDE; the IDE's Help menu links out here. Latest-only,
// English. Content lives in src/content/docs/ — the canonical public docs
// (wiki/ stays for internal/agent-facing notes).
export default defineConfig({
  base: '/docs',
  integrations: [
    starlight({
      title: 'madside',
      description: 'In-browser IDE for retro hardware — Atari 8-bit, NES, plugin-based.',
      // Pagefind full-text search, dark/light, shiki highlighting are on by
      // default. Sidebar mirrors the IA in the docs epic; most pages under the
      // later sections are navigable stubs until their own issues fill them.
      sidebar: [
        { label: 'Introduction', link: '/' },
        {
          label: 'Getting Started',
          items: [
            { label: 'Open the app', link: '/getting-started/open/' },
            { label: 'Your first build & run', link: '/getting-started/first-run/' },
            { label: 'Workspace tour', link: '/getting-started/workspace/' },
          ],
        },
        { label: 'Using the IDE', items: [{ autogenerate: { directory: 'using' } }] },
        { label: 'Extending madside', items: [{ autogenerate: { directory: 'extending' } }] },
        { label: 'Reference', items: [{ autogenerate: { directory: 'reference' } }] },
        { label: 'Meta', items: [{ autogenerate: { directory: 'meta' } }] },
      ],
    }),
  ],
})
