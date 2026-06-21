import { unzipSync } from 'fflate';
import type { VfsProvider } from './types';
import { cacheGet, cachePut } from './asset-cache';

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
      this.unpacked = (async () => {
        // Cross-session cache of the unpacked map, keyed by the hashed URL —
        // skips the fetch + unzip on later loads (#54).
        const cached = await cacheGet<Record<string, Uint8Array>>(`zip:${this.url}`);
        if (cached) return cached;
        const r = await fetch(this.url);
        if (!r.ok) throw new Error(`fetch ${this.url}: ${r.status}`);
        const map = unzipSync(new Uint8Array(await r.arrayBuffer()));
        void cachePut(`zip:${this.url}`, map);
        return map;
      })();
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
