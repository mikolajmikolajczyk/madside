// Virtual filesystem — a thin layer that composes file sources into one view
// (ADR-0008). Read-first; not a persistence store, not an OS. A `Vfs` is an
// ordered list of `Mount`s, each backed by a `VfsProvider` (an in-memory tree,
// an unzipped asset, the project store, …). Paths are POSIX, no leading slash;
// '' addresses the root.

/** A single file source: a lazily-enumerable, flat tree of byte files. */
export interface VfsProvider {
  /** Every file path under `prefix` (recursive, flat, no leading slash). `''`
   *  (or omitted) lists the whole provider. */
  list(prefix?: string): Promise<string[]>;
  /** File bytes, or `undefined` if the path isn't a file in this provider. */
  read(path: string): Promise<Uint8Array | undefined>;
  /** Present only on writable providers; absent ⇒ read-only. */
  write?(path: string, data: Uint8Array): Promise<void>;
}

/** A provider mounted at a point in the VFS. Mounts may share a prefix — they
 *  merge, earlier mounts shadowing later ones on read. */
export interface Mount {
  /** Mount point within the VFS (POSIX, no leading/trailing slash; `''` = root). */
  prefix: string;
  provider: VfsProvider;
  /** Read-only mount — `Vfs.write` to a path it owns is rejected. */
  ro: boolean;
}

/** The composed view over a set of mounts. */
export interface Vfs {
  readonly mounts: readonly Mount[];
  /** Union of all file paths under `prefix` across mounts (deduped, sorted). */
  list(prefix?: string): Promise<string[]>;
  /** Bytes for `path` from the first mount that has it, or `undefined`. */
  read(path: string): Promise<Uint8Array | undefined>;
  /** Write `path` to the first writable mount that owns it; throws if the only
   *  owner is read-only or no mount claims the path. */
  write(path: string, data: Uint8Array): Promise<void>;
}
