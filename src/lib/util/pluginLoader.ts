// Project-local ES module loader. Common backbone for converters,
// editors, and any future plugin type that ships as JS in the project
// VFS.
//
// Each plugin source is a `{ path, content }` pair. We hash the content
// (sha-256), instantiate a Blob URL, dynamic-import it, and run a
// caller-supplied validator that turns the module's exports into the
// concrete plugin shape. The Blob URL is cached by source path; if the
// content hash changes we revoke the old URL and re-import.

import { sha256Hex } from "./hash";

export interface PluginSource {
  path: string;
  content: string;
}

interface CachedModule<T> {
  hash: string;
  module: T;
  url: string;
}

export interface PluginLoader<T> {
  /** Load (or fetch from cache) a single project plugin. */
  load(src: PluginSource): Promise<T>;
}

export function createPluginLoader<T>(
  /** Turn the dynamically-imported module into the concrete plugin
   *  shape. Throw on shape mismatch — the loader will revoke the
   *  Blob URL and propagate. */
  validate: (mod: unknown) => T,
): PluginLoader<T> {
  const cache = new Map<string, CachedModule<T>>();
  return {
    async load(src) {
      const hash = await sha256Hex(src.content);
      const cached = cache.get(src.path);
      if (cached && cached.hash === hash) return cached.module;
      if (cached) URL.revokeObjectURL(cached.url);

      const blob = new Blob([src.content], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      let mod: unknown;
      try {
        mod = await import(/* @vite-ignore */ url);
      } catch (e) {
        URL.revokeObjectURL(url);
        throw e;
      }
      let plugin: T;
      try {
        plugin = validate(mod);
      } catch (e) {
        URL.revokeObjectURL(url);
        throw e;
      }
      cache.set(src.path, { hash, module: plugin, url });
      return plugin;
    },
  };
}
