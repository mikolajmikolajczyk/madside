import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { zipSync } from 'fflate';
import { cacheGet, cachePut } from './asset-cache';
import { ZipAssetProvider } from './zip-provider';

const enc = (s: string) => new TextEncoder().encode(s);

describe('asset cache', () => {
  it('round-trips a value and misses cleanly on an absent key', async () => {
    expect(await cacheGet('absent-key')).toBeUndefined();
    await cachePut('k1', { 'a.txt': enc('hi') });
    const got = await cacheGet<Record<string, Uint8Array>>('k1');
    expect(new TextDecoder().decode(got!['a.txt'])).toBe('hi');
  });
});

describe('ZipAssetProvider caching', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('unzips once, then serves a second provider from the cache (no refetch)', async () => {
    const zip = zipSync({ 'nes.cfg': enc('cfg') });
    const fetchMock = vi.fn(async () => new Response(zip));
    vi.stubGlobal('fetch', fetchMock);

    // distinct URL so the persistent cache key is fresh for this test
    const url = '/sysroot-cache-test.zip';
    const first = new ZipAssetProvider(url);
    expect(new TextDecoder().decode((await first.read('nes.cfg'))!)).toBe('cfg');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // a brand-new provider for the same URL should hit the IndexedDB cache
    const second = new ZipAssetProvider(url);
    expect(new TextDecoder().decode((await second.read('nes.cfg'))!)).toBe('cfg');
    expect(fetchMock).toHaveBeenCalledTimes(1); // still 1 — no second fetch
  });
});
