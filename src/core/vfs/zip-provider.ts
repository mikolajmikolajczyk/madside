import { unzipSync } from 'fflate';
import type { VfsProvider } from './types';

// Read-only provider backed by a zip asset (a toolchain sysroot). Fetches +
// unzips once on first access; the unpacked map is cached for the provider's
// lifetime. The zip is a Vite-hashed `?url`, so the browser HTTP cache covers
// re-downloads; a persistent compiled/unpacked cache is a separate concern (#54).

const norm = (p: string) => p.replace(/^\/+/, '').replace(/\/+$/, '');
const underPrefix = (path: string, prefix: string) =>
  prefix === '' || path === prefix || path.startsWith(prefix + '/');

export class ZipAssetProvider implements VfsProvider {
  private readonly url: string;
  private unpacked: Promise<Record<string, Uint8Array>> | null = null;

  /** @param url a fetchable URL for the zip (typically a Vite `?url` import). */
  constructor(url: string) {
    this.url = url;
  }

  private load(): Promise<Record<string, Uint8Array>> {
    if (!this.unpacked) {
      this.unpacked = fetch(this.url)
        .then((r) => {
          if (!r.ok) throw new Error(`fetch ${this.url}: ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => unzipSync(new Uint8Array(buf)));
    }
    return this.unpacked;
  }

  async list(prefix = ''): Promise<string[]> {
    const pre = norm(prefix);
    const map = await this.load();
    // Zip entries can carry directory records (trailing /) — keep files only.
    return Object.keys(map)
      .map(norm)
      .filter((p) => p !== '' && underPrefix(p, pre))
      .sort();
  }

  async read(path: string): Promise<Uint8Array | undefined> {
    const map = await this.load();
    return map[norm(path)];
  }
}
