import { openDB, type IDBPDatabase } from "idb";

// Persistent cache for large, content-addressed toolchain assets (#54, ADR-0008
// step 4): compiled WebAssembly.Module objects and unpacked sysroot byte maps.
// Keyed by the asset's Vite-hashed URL, so a new deploy (new hash) is a fresh
// key and stale entries simply stop being read.
//
// Lives in its own IndexedDB database, separate from project storage, and fails
// soft: if IndexedDB is unavailable (private mode, SSR, a test without a shim)
// every operation degrades to a miss and callers recompute. WebAssembly.Module
// is structured-cloneable, so it round-trips through IndexedDB where supported,
// skipping recompilation across sessions.

const DB_NAME = "madside-assets";
const STORE = "cache";

let dbPromise: Promise<IDBPDatabase | null> | null = null;

function db(): Promise<IDBPDatabase | null> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) { d.createObjectStore(STORE); },
    }).catch(() => null);
  }
  return dbPromise;
}

/** Read a cached value, or `undefined` on miss / unavailable store. */
export async function cacheGet<T>(key: string): Promise<T | undefined> {
  try {
    const d = await db();
    return d ? ((await d.get(STORE, key)) as T | undefined) : undefined;
  } catch {
    return undefined;
  }
}

/** Persist a value. Failures (unavailable / non-cloneable) are swallowed — the
 *  cache is an optimisation, never a correctness dependency. */
export async function cachePut(key: string, value: unknown): Promise<void> {
  try {
    const d = await db();
    if (d) await d.put(STORE, value, key);
  } catch {
    /* ignore */
  }
}

// In-memory module cache so repeat builds in one session don't even hit IDB.
const memModules = new Map<string, Promise<WebAssembly.Module>>();

/** Compile (or fetch from cache) a wasm module for `url`. Tries the in-memory
 *  cache, then IndexedDB (skips recompilation across sessions), then compiles
 *  and persists. */
export function loadWasmModule(url: string): Promise<WebAssembly.Module> {
  let p = memModules.get(url);
  if (!p) {
    p = (async () => {
      const cached = await cacheGet<unknown>(`mod:${url}`);
      if (cached instanceof WebAssembly.Module) return cached;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
      const mod = await WebAssembly.compileStreaming(r);
      void cachePut(`mod:${url}`, mod);
      return mod;
    })();
    memModules.set(url, p);
  }
  return p;
}
