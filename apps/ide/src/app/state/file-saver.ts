// Debounced per-file persistence, extracted from the React store so it is
// unit-testable with fake timers (no DOM). The store calls `sync` from an effect
// and wires its return value as the effect cleanup.
//
// Correctness invariant: a file removed or renamed inside the debounce window
// must NOT be resurrected. The pending timer captured the old bytes, and the
// next `sync` no longer lists that key — so `sync` returns a cleanup that
// cancels exactly the timers it scheduled, which the caller runs before the
// next `sync`.

export interface FileSaverDeps {
  write: (projectId: string, path: string, content: Uint8Array) => Promise<void>
  /** Notified after a successful write (the store emits `file:changed`). */
  onSaved?: (path: string) => void
  delayMs: number
}

export interface DirtyFile {
  path: string
  content: Uint8Array
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export interface FileSaver {
  /** Schedule debounced writes for a project's currently-dirty files. Returns a
   *  cleanup that cancels the timers scheduled by THIS call — run it before the
   *  next `sync` (React effect cleanup) so a removed file can't write stale
   *  bytes after it's gone. */
  sync(projectId: string, files: DirtyFile[]): () => void
  /** Cancel all pending writes and forget save history (project switch /
   *  unmount). */
  reset(): void
}

export function createFileSaver({ write, onSaved, delayMs }: FileSaverDeps): FileSaver {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const lastSaved = new Map<string, Uint8Array>()

  function sync(projectId: string, files: DirtyFile[]): () => void {
    const scheduled: string[] = []
    for (const { path, content } of files) {
      const key = `${projectId}::${path}`
      const prev = lastSaved.get(key)
      if (prev && bytesEqual(prev, content)) continue
      const existing = timers.get(key)
      if (existing != null) clearTimeout(existing)
      const handle = setTimeout(() => {
        timers.delete(key)
        void write(projectId, path, content).then(() => {
          lastSaved.set(key, content)
          onSaved?.(path)
        })
      }, delayMs)
      timers.set(key, handle)
      scheduled.push(key)
    }
    return () => {
      for (const key of scheduled) {
        const h = timers.get(key)
        if (h != null) {
          clearTimeout(h)
          timers.delete(key)
        }
      }
    }
  }

  function reset(): void {
    for (const h of timers.values()) clearTimeout(h)
    timers.clear()
    lastSaved.clear()
  }

  return { sync, reset }
}
