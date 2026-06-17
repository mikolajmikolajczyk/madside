import {
  File,
  Directory,
  PreopenDirectory,
  type Inode,
} from '@bjorn3/browser_wasi_shim';
import type { Vfs } from './types';

// Bridge a VFS to a `@bjorn3/browser_wasi_shim` preopen directory: materialise
// every file in the VFS into one in-memory tree the WASI tools run over, then
// read their outputs back. This is the single assembler that replaces the
// per-toolchain `placeFile` / `mkdirP` / `readFile` plumbing (ADR-0008).

const segs = (path: string) => path.split('/').filter((p) => p.length > 0);

function mkdirP(root: Directory, dirs: string[]): Directory {
  return dirs.reduce((dir, name) => {
    const existing = dir.contents.get(name);
    if (existing instanceof Directory) return existing;
    const next = new Directory(new Map<string, Inode>());
    dir.contents.set(name, next);
    return next;
  }, root);
}

function placeFile(root: Directory, path: string, data: Uint8Array) {
  const parts = segs(path);
  if (parts.length === 0) return;
  const dir = mkdirP(root, parts.slice(0, -1));
  dir.contents.set(parts[parts.length - 1]!, new File(data));
}

function readFile(root: Directory, path: string): Uint8Array | undefined {
  const parts = segs(path);
  let dir: Directory = root;
  for (const name of parts.slice(0, -1)) {
    const next = dir.contents.get(name);
    if (!(next instanceof Directory)) return undefined;
    dir = next;
  }
  const leaf = dir.contents.get(parts[parts.length - 1]!);
  return leaf instanceof File ? leaf.data : undefined;
}

/** Materialise every file in `vfs` into a fresh preopen directory. `outputs`
 *  pre-creates empty files (some tools want the output path to exist). */
export async function vfsToPreopen(
  vfs: Vfs,
  opts: { name?: string; outputs?: string[] } = {},
): Promise<PreopenDirectory> {
  const root = new PreopenDirectory(opts.name ?? '.', new Map<string, Inode>());
  for (const path of await vfs.list()) {
    const data = await vfs.read(path);
    if (data) placeFile(root.dir, path, data);
  }
  for (const path of opts.outputs ?? []) placeFile(root.dir, path, new Uint8Array());
  return root;
}

/** Read a file written into the preopen tree by a tool (e.g. the output binary).
 *  Returns a copy; `undefined` if missing or empty. */
export function readFromPreopen(root: PreopenDirectory, path: string): Uint8Array | undefined {
  const data = readFile(root.dir, path);
  return data && data.length > 0 ? data.slice() : undefined;
}
