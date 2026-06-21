import type { Mount, Vfs } from './types';

// Compose an ordered list of mounts into one read/list/write view. Mounts that
// share (or nest under) a prefix merge: a read tries each owning mount in order
// and the first hit wins; a list unions across all mounts; a write goes to the
// first writable mount that owns the path.

const norm = (p: string) => p.replace(/^\/+/, '').replace(/\/+$/, '');

/** Does `path` fall under mount `prefix`? `''` owns everything. */
const owns = (prefix: string, path: string) =>
  prefix === '' || path === prefix || path.startsWith(prefix + '/');

/** Strip a mount prefix from a path to get the provider-relative path. */
const rel = (prefix: string, path: string) =>
  prefix === '' ? path : path.slice(prefix.length + 1);

/** Re-attach a mount prefix to a provider-relative path. */
const abs = (prefix: string, path: string) => (prefix === '' ? path : `${prefix}/${path}`);

export function createVfs(mounts: Mount[]): Vfs {
  const ordered = mounts.map((m) => ({ ...m, prefix: norm(m.prefix) }));

  return {
    mounts: ordered,

    async read(path) {
      const p = norm(path);
      for (const m of ordered) {
        if (!owns(m.prefix, p)) continue;
        const hit = await m.provider.read(rel(m.prefix, p));
        if (hit) return hit;
      }
      return undefined;
    },

    async list(prefix = '') {
      const pre = norm(prefix);
      const out = new Set<string>();
      for (const m of ordered) {
        // Only ask a mount for paths that can fall under both its prefix and the
        // requested prefix.
        const childPrefix = owns(m.prefix, pre) ? rel(m.prefix, pre) : '';
        for (const child of await m.provider.list(childPrefix)) {
          const full = abs(m.prefix, child);
          if (owns(pre, full)) out.add(full);
        }
      }
      return [...out].sort();
    },

    async write(path, data) {
      const p = norm(path);
      for (const m of ordered) {
        if (!owns(m.prefix, p) || m.ro || !m.provider.write) continue;
        await m.provider.write(rel(m.prefix, p), data);
        return;
      }
      throw new Error(`vfs: no writable mount owns '${p}'`);
    },
  };
}
