// project.json schema v2 (ADR-0001 §Project manifest v2). Hard cut from v1
// — no back-compat shim, no migration path. v1 manifests are rejected with
// an actionable error so the user knows to recreate the project.
//
// Validator is hand-rolled (no zod dependency). Inputs are user-typed JSON
// so we can't trust shape; outputs are a strictly-typed ProjectManifestV2
// that downstream code (BuildService manifest reads, plugin-registry lookups)
// can rely on without further guards.

import { ManifestError } from './errors'
import { err, ok, type Result } from './errors'
import type { Recipe } from './plugin-converter'

export const MANIFEST_VERSION = 2 as const

export interface ProjectManifestV2 {
  version: typeof MANIFEST_VERSION
  name: string
  /** POSIX path of the entry source the toolchain assembles. */
  main: string
  /** MachinePlugin id. Required. */
  machine: string
  /** ToolchainPlugin id. Required. */
  toolchain: string
  /** EmulatorPlugin id. Optional — workbench resolves via the active
   *  MachinePlugin.compatibleEmulators when absent. */
  emulator?: string
  /** DebugAdapter id. Optional — same resolution rule as emulator. */
  debugAdapter?: string
  /** Panel plugin ids to surface by default. Optional — falls back to
   *  MachinePlugin.defaultPanels. */
  panels?: string[]
  run?: { default?: { audio?: boolean } }
  recipes?: Recipe[]
  /** Map of file-extension (no dot, lowercase) → editor module path. */
  editors?: Record<string, string>
  /** Build configuration forwarded to the toolchain. `args` are raw,
   *  toolchain-specific assembler flags (e.g. MADS `-d:SYM=1`, extra `-i:`
   *  include paths); the toolchain appends them to its own invocation.
   *  `trigger` controls when the build runs: `'manual'` (default) builds only
   *  on Ctrl+S / Run; `'auto'` rebuilds on every (debounced) edit. Manual keeps
   *  large projects snappy by not recompiling on every keystroke. */
  build?: { args?: string[]; trigger?: 'auto' | 'manual' }
  /** Editor preferences. `tabWidth` = spaces per indent level + literal-tab
   *  render width (default 4). `format` = clang-format style for C sources: a
   *  preset name (`LLVM`, `Google`, `WebKit`, …) or inline `.clang-format` YAML.
   *  A `.clang-format` file in the project overrides this; absent ⇒ `LLVM`. */
  editor?: { tabWidth?: number; format?: string }
  /** Set when the project was instantiated from a course lesson — drives
   *  course mode (the lesson panel). Carries which lesson the project is. */
  course?: { id: string; lesson: string }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const requireString = (raw: Record<string, unknown>, key: string): string | undefined => {
  const v = raw[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/** Validate + narrow a raw JSON object into ProjectManifestV2. Rejects v1
 *  manifests with `'project.json v1 unsupported, recreate project'` so the
 *  UI can surface a single actionable message. */
export function parseProjectManifest(raw: unknown): Result<ProjectManifestV2, ManifestError> {
  if (!isObject(raw)) {
    return err(new ManifestError('project.json is not an object'))
  }
  const version = raw['version']
  if (version === 1) {
    return err(new ManifestError('project.json v1 unsupported, recreate project'))
  }
  if (version !== MANIFEST_VERSION) {
    return err(new ManifestError(`project.json version ${String(version)} unsupported (expected 2)`))
  }

  const name = requireString(raw, 'name')
  if (!name) return err(new ManifestError('project.json: name missing or empty'))
  const main = requireString(raw, 'main')
  if (!main) return err(new ManifestError('project.json: main missing or empty'))
  const machine = requireString(raw, 'machine')
  if (!machine) return err(new ManifestError('project.json: machine id missing — set "machine": "<plugin-id>"'))
  const toolchain = requireString(raw, 'toolchain')
  if (!toolchain) return err(new ManifestError('project.json: toolchain id missing — set "toolchain": "<plugin-id>"'))

  const out: ProjectManifestV2 = {
    version: MANIFEST_VERSION,
    name,
    main,
    machine,
    toolchain,
  }
  const emulator = requireString(raw, 'emulator')
  if (emulator) out.emulator = emulator
  const debugAdapter = requireString(raw, 'debugAdapter')
  if (debugAdapter) out.debugAdapter = debugAdapter

  const panels = raw['panels']
  if (Array.isArray(panels) && panels.every((p) => typeof p === 'string')) {
    out.panels = panels as string[]
  }

  const run = raw['run']
  if (isObject(run)) out.run = run as ProjectManifestV2['run']

  const recipes = raw['recipes']
  if (Array.isArray(recipes)) out.recipes = recipes as Recipe[]

  const editors = raw['editors']
  if (isObject(editors) && Object.values(editors).every((v) => typeof v === 'string')) {
    out.editors = editors as Record<string, string>
  }

  const course = raw['course']
  if (isObject(course)) {
    const id = requireString(course, 'id')
    const lesson = requireString(course, 'lesson')
    if (id && lesson) out.course = { id, lesson }
  }

  const build = raw['build']
  if (isObject(build)) {
    out.build = {}
    const args = build['args']
    if (args !== undefined) {
      if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) {
        return err(new ManifestError('project.json: build.args must be an array of strings'))
      }
      out.build.args = args as string[]
    }
    const trigger = build['trigger']
    if (trigger !== undefined) {
      if (trigger !== 'auto' && trigger !== 'manual') {
        return err(new ManifestError("project.json: build.trigger must be 'auto' or 'manual'"))
      }
      out.build.trigger = trigger
    }
  }

  const editor = raw['editor']
  if (isObject(editor)) {
    const tabWidth = editor['tabWidth']
    if (tabWidth !== undefined) {
      if (typeof tabWidth !== 'number' || !Number.isInteger(tabWidth) || tabWidth < 1 || tabWidth > 16) {
        return err(new ManifestError('project.json: editor.tabWidth must be an integer 1–16'))
      }
      out.editor = { ...out.editor, tabWidth }
    }
    const format = editor['format']
    if (format !== undefined) {
      if (typeof format !== 'string' || format.length === 0) {
        return err(new ManifestError('project.json: editor.format must be a non-empty string'))
      }
      out.editor = { ...out.editor, format }
    }
  }

  return ok(out)
}
