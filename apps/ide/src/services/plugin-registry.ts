import type {
  PluginBase,
  PluginEntry,
  PluginKind,
  PluginRegistry,
} from '@ports'

// Per-kind map keyed by id. `register` allows shadowing (project overrides
// builtin) only when the incoming entry comes from a project source. Order:
// builtin-then-project-shadow is the canonical pattern; calling code is
// expected to register builtins first.

export function createPluginRegistry(): PluginRegistry {
  const byKind = new Map<PluginKind, Map<string, PluginEntry>>()

  const bucket = (kind: PluginKind): Map<string, PluginEntry> => {
    let m = byKind.get(kind)
    if (!m) {
      m = new Map()
      byKind.set(kind, m)
    }
    return m
  }

  return {
    register(entry) {
      const m = bucket(entry.plugin.kind)
      const existing = m.get(entry.plugin.id)
      if (existing && existing.source.origin === 'project' && entry.source.origin === 'builtin') {
        // Builtin must not overwrite an already-loaded project shadow.
        return () => {
          /* noop */
        }
      }
      m.set(entry.plugin.id, entry as PluginEntry)
      return () => {
        const cur = m.get(entry.plugin.id)
        if (cur === (entry as PluginEntry)) m.delete(entry.plugin.id)
      }
    },

    unregister(kind, id) {
      byKind.get(kind)?.delete(id)
    },

    get<T extends PluginBase>(kind: PluginKind, id: string): T | undefined {
      return byKind.get(kind)?.get(id)?.plugin as T | undefined
    },

    list<T extends PluginBase>(kind: PluginKind): T[] {
      const m = byKind.get(kind)
      return m ? ([...m.values()].map((e) => e.plugin) as T[]) : []
    },
  }
}
