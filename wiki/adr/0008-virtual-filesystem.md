# ADR-0008: App-wide virtual filesystem (mount layer)

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Mikołaj
- **Tags:** architecture, foundation, filesystem, plugins

## Context

Files in madside come from more than one place, and that number is growing:

- **Project files** — user sources, persisted in IndexedDB behind the `StorageBackend` port (the file tree edits these).
- **Toolchain sysroots** — read-only runtimes a toolchain mounts so its wasm tools can resolve includes + link libraries. MADS needs none; the cc65 plugin (#1) unpacks an 800 KB zip (`nes.lib`, `nes.cfg`, the cc65 `include/` + `asminc/` trees) into the WASI filesystem on every build. Per-target sysroots are coming (#52: NES, Atari, C64…).
- **Generated output** — `generated/*` recipe outputs, the assembled binary.

Two concrete smells already exist:

- The browser-side WASI filesystem assembly — `placeFile` / `mkdirP` / `readFile` / `PreopenDirectory` over `@bjorn3/browser_wasi_shim` — is **copy-pasted** between `toolchain-mads/wasm-mads/mads.ts` and `toolchain-ca65/wasm/cc65-wasm.ts`. Every new toolchain re-implements it.
- A toolchain's read-only sysroot is **invisible** to the rest of the app. The file tree shows only project files, so a user writing C can't see what they may `#include` (#50). The emulator, debugger, and converters each reach for files their own way.

As madside adds toolchains (each with its own libraries), machines, and emulators (some of which will read media/disk/source files), the question "what files exist, and where do they come from" has no single answer. Every subsystem invents its own composition of sources.

This is the plugin-workbench thesis (ADR-0001) hitting its filesystem: many plugins, many file sources, one workbench.

## Decision drivers

- **One way to compose file sources.** Project + sysroot + generated + (future) uploads / course content / remote should compose into one view, assembled the same way everywhere.
- **Consumers don't care about the source.** A toolchain, the file tree, an emulator should read `path` without knowing whether it's IndexedDB, a zip asset, or memory.
- **Not a new persistence layer.** `StorageBackend` stays the persistence port; the project mount is *backed by* it. The VFS is a read/compose view, not a store.
- **Not an OS.** No permissions model, no processes, no device files. WASI tools and the app need files + a tree — nothing more. Over-building a FUSE-like layer is the trap to avoid.
- **Incremental.** Existing code migrates one consumer at a time (toolchains first); nothing is rewritten in a big bang.
- **Lazy + cacheable.** A sysroot mount must not force-download until a build needs it, and should be cacheable (#54).

## Considered options

1. **Status quo — each subsystem assembles its own file set.** Toolchains hand-roll the WASI FS; the tree reads the store; emulators get a bare binary. Rejected: the duplication is already here with two toolchains, and every new file source multiplies it.
2. **Fold everything into `StorageBackend`.** Make the store also serve sysroots etc. Rejected: conflates persistence with composition; sysroots are read-only assets, not user data; pollutes the storage contract; RO/RW + lazy-load semantics don't belong in a persistence port.
3. **A thin VFS / mount layer over providers (chosen).** A small read-first interface assembled from mounts, each mount backed by a provider (StorageBackend, zip asset, memory). Consumers query the VFS; one adapter bridges a VFS to a `browser_wasi_shim` preopen for WASI tools.
4. **Full virtual OS (FUSE-style: permissions, symlinks, devices, processes).** Rejected explicitly: none of madside's consumers need it; it's a large surface to maintain for zero current benefit. The mount layer is deliberately the floor, not this.

## Decision outcome

Adopt option 3 — an **app-wide virtual filesystem as a thin mount/composition layer**, sitting above `StorageBackend`, not replacing it.

Shape (a port, exact names TBD in the epic):

```
VFS        = an ordered list of Mounts + read/list/stat, write to RW mounts
Mount      = { prefix: string; provider: VfsProvider; ro: boolean }
VfsProvider= lazily yields a file tree: read(path), list(prefix), stat(path)
```

Providers (initial set):

- **StorageProvider** — the project mount, RW, backed by `StorageBackend`.
- **ZipAssetProvider** — a toolchain sysroot, RO, backed by a hashed zip `?url` asset (lazy, cacheable per #54).
- **MemoryProvider** — generated output / scratch, RW, ephemeral.

Rules:

> The VFS is a **view that composes file sources**, never a persistence store. The project mount is backed by `StorageBackend`; writes to it delegate there. Read-only mounts reject writes. Any subsystem that needs files — toolchains, the file tree, emulators, converters — reads through the VFS rather than reaching a source directly. A single adapter bridges a VFS to the WASI `PreopenDirectory`; that bridge replaces the per-toolchain `placeFile` code.

Boundaries restated so they can't drift:

- **VFS ≠ StorageBackend** (composition vs persistence).
- **VFS ≠ OS** (no permissions / processes / devices; mount = tree + prefix + ro).
- **Read-first.** Writes are scoped to RW mounts and delegate to their backing.

Rollout is incremental and consumer-by-consumer (see the tracking epic):

1. Define the port + the StorageProvider + ZipAssetProvider + the WASI bridge.
2. Migrate the MADS and cc65 runners onto the bridge (delete the duplicated FS code).
3. Render read-only mounts in the file tree (subsumes #50).
4. Back the sysroot provider with the asset cache (#54).
5. Later, as concrete needs land: emulator file reads, converters, course/remote/upload providers.

## Consequences

**Positive**

- One assembler for the WASI filesystem; new toolchains declare mounts instead of re-implementing FS plumbing.
- The file tree can show a toolchain's sysroot read-only (#50) by rendering the same VFS — discovery of includes falls out.
- Per-machine sysroots (#52) are just a different RO mount; caching (#54) is a property of a provider; both stop being bespoke.
- A clean seam (ADR-0002) for every future file source: uploads, course content, remote libraries, multi-file emulator media.

**Negative / risks**

- Another abstraction to learn and keep minimal — the standing risk is scope creep toward option 4. Mitigation: the port is read-first and mount-shaped; anything OS-like is out of scope by this ADR.
- A migration, not a refactor: the two existing toolchain runners and the file tree change. Done incrementally, behind the new port, so each step is reviewable.
- Write semantics must stay simple (RW mounts delegate to their backing; RO rejects). If a future need wants overlay/union writes, that is a follow-up decision, not assumed here.

Supersedes the ad-hoc FS handling in the toolchain runners. Relates to ADR-0001 (plugin workbench) and ADR-0002 (layering). Tracking epic + migration steps live in GitHub.
