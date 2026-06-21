// VFS — app-wide virtual filesystem (ADR-0008). Import via `@core/vfs` so the
// WASI-shim / fflate deps stay out of the eager `@core` barrel.
export type { Vfs, Mount, VfsProvider } from './types';
export { createVfs } from './vfs';
export { MemoryProvider } from './memory-provider';
export { ZipAssetProvider } from './zip-provider';
export { vfsToPreopen, readFromPreopen, mkdirP, placeFile, readFile } from './wasi-bridge';
export { loadWasmModule, cacheGet, cachePut } from './asset-cache';
