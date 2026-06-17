import type { VfsProvider } from './types';

// In-memory file tree. The simplest provider — a flat Map of path → bytes.
// Used for project sources handed to a toolchain (materialised from the build
// input) and for scratch / generated output. Writable.

const norm = (p: string) => p.replace(/^\/+/, '').replace(/\/+$/, '');
const underPrefix = (path: string, prefix: string) =>
  prefix === '' || path === prefix || path.startsWith(prefix + '/');

export class MemoryProvider implements VfsProvider {
  private readonly files = new Map<string, Uint8Array>();

  constructor(initial?: Iterable<readonly [string, Uint8Array]>) {
    if (initial) for (const [p, data] of initial) this.files.set(norm(p), data);
  }

  list(prefix = ''): Promise<string[]> {
    const pre = norm(prefix);
    return Promise.resolve([...this.files.keys()].filter((p) => underPrefix(p, pre)).sort());
  }

  read(path: string): Promise<Uint8Array | undefined> {
    return Promise.resolve(this.files.get(norm(path)));
  }

  write(path: string, data: Uint8Array): Promise<void> {
    this.files.set(norm(path), data);
    return Promise.resolve();
  }
}
