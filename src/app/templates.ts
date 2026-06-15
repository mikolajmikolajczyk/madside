// Bundled project templates (epic 3bca2f6). Templates live in the repo-root
// `templates/<id>/` directory — a project.json manifest + source files + a
// template.json descriptor — and are bundled at build time via Vite's glob
// import (no separate repo, no hosting, always available offline). The File →
// Templates menu + the first-run welcome picker list them; picking one
// instantiates a fresh project into storage.

import { storage } from './storage'
import { MANIFEST_PATH, textToBytes } from '@adapters/storage-idb'
import type { ProjectManifestV2 as Manifest, ProjectRow } from '@ports'

/** Picker-facing descriptor, parsed from each template's template.json. */
export interface TemplateMeta {
  /** Display name shown in the menu + welcome cards. */
  name: string
  /** One-line summary of what the template demonstrates. */
  description: string
  /** Machine id this template targets (badge in the picker). */
  machine: string
  /** Sort hint for the listing (ascending; missing sorts last). */
  order?: number
}

export interface TemplateInfo extends TemplateMeta {
  id: string
  /** Project-relative file paths the template ships (for an architecture
   *  preview in the picker), sorted, including the project.json manifest. */
  files: string[]
}

interface TemplateBundle {
  id: string
  meta: TemplateMeta
  manifest: Manifest
  /** Source files (everything except the two json descriptors), project-root
   *  relative paths. */
  files: { path: string; content: string }[]
}

// Eager raw glob — keys are absolute repo-root paths, values the file text.
// Vite inlines these at build; vitest resolves them against the filesystem.
const RAW = import.meta.glob('/templates/**/*', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>

function loadBundles(): Map<string, TemplateBundle> {
  const acc = new Map<string, { id: string; meta?: TemplateMeta; manifest?: Manifest; files: { path: string; content: string }[] }>()
  for (const [key, content] of Object.entries(RAW)) {
    const rel = key.replace(/^\/templates\//, '')
    const slash = rel.indexOf('/')
    if (slash < 0) continue // stray file directly under templates/
    const id = rel.slice(0, slash)
    const path = rel.slice(slash + 1)
    let b = acc.get(id)
    if (!b) {
      b = { id, files: [] }
      acc.set(id, b)
    }
    if (path === 'template.json') b.meta = JSON.parse(content) as TemplateMeta
    else if (path === MANIFEST_PATH) b.manifest = JSON.parse(content) as Manifest
    else b.files.push({ path, content })
  }
  const out = new Map<string, TemplateBundle>()
  for (const b of acc.values()) {
    if (!b.meta || !b.manifest) {
      // A template missing its descriptor or manifest is a packaging error —
      // skip it rather than crash the menu.
      continue
    }
    out.set(b.id, { id: b.id, meta: b.meta, manifest: b.manifest, files: b.files })
  }
  return out
}

const BUNDLES = loadBundles()

/** Templates available out of the box, sorted by `order` then name. */
export function listTemplates(): TemplateInfo[] {
  return [...BUNDLES.values()]
    .map((b) => ({
      id: b.id,
      ...b.meta,
      files: [...b.files.map((f) => f.path), MANIFEST_PATH].sort(),
    }))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name))
}

/** Instantiate a template into storage as a new project. `name` overrides the
 *  template's default project name. Returns the created row (caller switches
 *  to it). Throws on an unknown template id. */
export async function instantiateTemplate(id: string, name?: string): Promise<ProjectRow> {
  const b = BUNDLES.get(id)
  if (!b) throw new Error(`instantiateTemplate: unknown template '${id}'`)
  const manifest: Manifest = { ...b.manifest, name: name ?? b.manifest.name }
  const files = [
    ...b.files.map((f) => ({ path: f.path, content: textToBytes(f.content) })),
    { path: MANIFEST_PATH, content: textToBytes(JSON.stringify(manifest, null, 2) + '\n') },
  ]
  return storage.projects.create(manifest.name, files, manifest)
}

/** The template's default project.json text — seeds the blank-project form in
 *  the welcome picker. */
export function getTemplateManifestText(id: string): string | undefined {
  const b = BUNDLES.get(id)
  return b ? JSON.stringify(b.manifest, null, 2) + '\n' : undefined
}

/** Create a blank project: the 'empty' template's source files + a
 *  caller-supplied project.json (edited in the welcome picker's manifest form).
 *  The manifest text is assumed already validated by the form. */
export async function createBlankProject(manifestText: string): Promise<ProjectRow> {
  const b = BUNDLES.get('empty')
  if (!b) throw new Error('createBlankProject: empty template missing')
  const manifest = JSON.parse(manifestText) as Manifest
  const files = [
    ...b.files.map((f) => ({ path: f.path, content: textToBytes(f.content) })),
    { path: MANIFEST_PATH, content: textToBytes(manifestText) },
  ]
  return storage.projects.create(manifest.name, files, manifest)
}
