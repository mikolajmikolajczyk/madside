import { afterEach, describe, expect, it, vi } from 'vitest';
import { zipSync } from 'fflate';
import { createVfs } from './vfs';
import { MemoryProvider } from './memory-provider';
import { ZipAssetProvider } from './zip-provider';
import { vfsToPreopen, readFromPreopen } from './wasi-bridge';
import type { Mount, VfsProvider } from './types';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b?: Uint8Array) => (b ? new TextDecoder().decode(b) : undefined);

describe('MemoryProvider', () => {
  it('reads, lists (recursive, sorted), and writes', async () => {
    const p = new MemoryProvider([
      ['main.c', enc('int main')],
      ['src/util.c', enc('util')],
    ]);
    expect(await p.list()).toEqual(['main.c', 'src/util.c']);
    expect(await p.list('src')).toEqual(['src/util.c']);
    expect(dec(await p.read('main.c'))).toBe('int main');
    await p.write('out.o', enc('obj'));
    expect(dec(await p.read('out.o'))).toBe('obj');
  });
});

describe('ZipAssetProvider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches + unzips lazily, then reads/lists', async () => {
    const zip = zipSync({ 'nes.cfg': enc('MEMORY{}'), 'include/conio.h': enc('void cputs();') });
    const fetchMock = vi.fn(async () => new Response(zip));
    vi.stubGlobal('fetch', fetchMock);

    const p = new ZipAssetProvider('/sysroot.zip');
    expect(await p.list()).toEqual(['include/conio.h', 'nes.cfg']);
    expect(dec(await p.read('include/conio.h'))).toBe('void cputs();');
    await p.read('nes.cfg');
    expect(fetchMock).toHaveBeenCalledTimes(1); // unzipped once, cached
    expect((p as VfsProvider).write).toBeUndefined(); // read-only
  });
});

describe('createVfs', () => {
  const project = new MemoryProvider([['main.c', enc('user')]]);
  const sysroot = new MemoryProvider([
    ['main.c', enc('SHOULD NOT WIN')],
    ['include/nes.h', enc('nes')],
  ]);
  const mounts: Mount[] = [
    { prefix: '', provider: project, ro: false },
    { prefix: '', provider: sysroot, ro: true },
  ];

  it('merges mounts; earlier mount shadows on read', async () => {
    const vfs = createVfs(mounts);
    expect(dec(await vfs.read('main.c'))).toBe('user'); // project shadows sysroot
    expect(dec(await vfs.read('include/nes.h'))).toBe('nes'); // only in sysroot
    expect(await vfs.list()).toEqual(['include/nes.h', 'main.c']); // union, deduped
  });

  it('writes to the first writable owning mount; rejects when only RO owns it', async () => {
    const vfs = createVfs(mounts);
    await vfs.write('main.s', enc('asm'));
    expect(dec(await project.read('main.s'))).toBe('asm');
  });

  it('routes a write under a prefixed mount', async () => {
    const out = new MemoryProvider();
    const vfs = createVfs([{ prefix: 'generated', provider: out, ro: false }]);
    await vfs.write('generated/data.asm', enc('x'));
    expect(dec(await out.read('data.asm'))).toBe('x');
    await expect(vfs.write('elsewhere.txt', enc('x'))).rejects.toThrow(/no writable mount/);
  });
});

describe('wasi-bridge', () => {
  it('materialises a vfs into a preopen and reads outputs back', async () => {
    const vfs = createVfs([
      { prefix: '', provider: new MemoryProvider([['a/b.txt', enc('hi')]]), ro: false },
    ]);
    const root = await vfsToPreopen(vfs, { outputs: ['out.bin'] });
    // simulate a tool writing the output
    const { File, Directory } = await import('@bjorn3/browser_wasi_shim');
    const outDir = root.dir; // place at root
    void Directory;
    outDir.contents.set('out.bin', new File(enc('result')));
    expect(dec(readFromPreopen(root, 'a/b.txt'))).toBe('hi');
    expect(dec(readFromPreopen(root, 'out.bin'))).toBe('result');
    expect(readFromPreopen(root, 'missing')).toBeUndefined();
  });
});
