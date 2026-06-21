// PluginRegistry — unified discovery for every plugin kind. Replaces the
// per-domain registries (converters/registry, editors/registry). Resolution
// rule unchanged: project-local plugin shadows built-in by `id`.

export type PluginKind =
  | 'converter'
  | 'editor'
  | 'machine'
  | 'toolchain'
  | 'emulator'
  | 'debug-adapter'
  | 'panel'

/** Minimum surface every plugin instance shares. Specific contracts (Machine,
 *  Toolchain, …) extend this in their own ports modules. */
export interface PluginBase {
  readonly id: string
  readonly kind: PluginKind
  readonly name?: string
  readonly version?: string
}

/** Source descriptor — where the registry pulls the module from. Resolves via
 *  the @adapters/plugin-loader (Blob URL + dynamic import) or a built-in
 *  factory. Loader policy + worker host (ADR-0003) decided per kind. */
export interface PluginSource {
  origin: 'builtin' | 'project'
  /** For 'project' origin: path inside the project tree, e.g.
   *  `converters/png-to-charset.js`. Ignored for 'builtin'. */
  path?: string
}

export interface PluginEntry<T extends PluginBase = PluginBase> {
  plugin: T
  source: PluginSource
}

export interface PluginRegistry {
  register<T extends PluginBase>(entry: PluginEntry<T>): () => void
  unregister(kind: PluginKind, id: string): void
  get<T extends PluginBase>(kind: PluginKind, id: string): T | undefined
  list<T extends PluginBase>(kind: PluginKind): T[]
}
