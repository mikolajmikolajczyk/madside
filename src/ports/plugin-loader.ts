// Contract for loading project-local plugin modules (converters, editors, and
// any future kind that ships as JS in the project VFS). The concrete loader
// (Blob URL + dynamic import + content-hash cache) lives in
// @adapters/plugin-loader; @app injects the factory into the @plugins
// registries, so the plugin layer depends on this port — not the adapter
// (ADR-0002, issue #25).

export interface ProjectPluginSource {
  path: string;
  /** Module source text (the project file's contents). */
  content: string;
}

export interface PluginLoader<T> {
  /** Load (or fetch from cache) a single project plugin, validating its shape. */
  load(src: ProjectPluginSource): Promise<T>;
}

/** Binds a per-kind validator to a loader instance. @app passes the concrete
 *  `createPluginLoader` from @adapters; the registries call it with their own
 *  module-shape validator. */
export type PluginLoaderFactory = <T>(validate: (mod: unknown) => T) => PluginLoader<T>;
