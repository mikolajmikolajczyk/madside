# ADR-0003: Plugin host model — main thread vs Web Worker

- **Status:** Accepted
- **Date:** 2026-06-10
- **Deciders:** Mikołaj
- **Tags:** architecture, foundation, plugins, runtime

## Context

ADR-0001 lists seven plugin kinds (Machine, Toolchain, Emulator, DebugAdapter, Panel, Converter, Editor) that all execute inside the workbench. Today every plugin and every internal component runs on the main thread: MADS assembly, Altirra wasm step loop, recipe-driven asset conversion, the React tree, audio scheduling. Anything heavy stalls the editor.

Before plugin contracts ossify in M3–M7, we have to commit to *where* each plugin kind runs. Once a Machine plugin declares it provides a synchronous `display.tick()`, every machine plugin author depends on that being callable from the same execution context — and we can't change our mind without breaking the contract. Picking the host now constrains:

- The transport API the plugin author writes against (synchronous calls vs `await` boundary).
- Whether plugin code can touch the DOM (panels yes, toolchains no).
- Crash containment characteristics.
- Build/bundling — workers are separate entry points to Vite.
- Hosting requirements (SharedArrayBuffer needs COOP/COEP).

This ADR decides the *default host per plugin kind* and the *transport contract* between hosts. Implementation is deferred to a later milestone (M4/M5/M7 carries it depending on plugin kind); the contract lands now so we don't have to renegotiate it later.

## Decision drivers

- **UI stays responsive.** A long MADS assemble or a 60 fps emulator step must not block the editor or React render.
- **Crash isolation where free.** A misbehaving converter shouldn't take down the workbench; a worker crash is recoverable, a main-thread throw can be too.
- **No premature isolation.** A panel that draws an oscilloscope view of POKEY audio doesn't need a worker — it needs the DOM and a 60 fps render slot.
- **Transport ergonomics for plugin authors.** `await pkg.build(project)` is fine; `postMessage({kind: 'build', id, payload})` is not.
- **Reversible defaults, irreversible contracts.** If we get the *contract* right, we can move a plugin between hosts later as a perf optimisation. If we get the *contract* wrong, every plugin breaks.
- **No SharedArrayBuffer requirement at v1.** SAB needs COOP/COEP headers, complicates VPS hosting, and breaks if any third-party script is included. Plain `postMessage` is enough until profiling proves otherwise.

## Considered options

1. **Everything on main thread.** Status quo. Rejected: assemble + step loop already cause perceptible jank; multi-machine + plugin authors who write CPU-heavy converters will make it worse.
2. **Everything in workers.** Each plugin instance gets its own worker. Rejected: panels need DOM, file editors need DOM, machine plugins are mostly descriptive metadata — workers for those add only postMessage cost. Also: 7 plugin kinds × N instances = a lot of workers.
3. **One shared worker for all non-DOM plugins.** Single worker hosts every toolchain, every converter, every emulator. Rejected: a crashing emulator would take down the toolchain mid-build; emulator step rate (~60 fps) competes for the same single thread as a long-running converter.
4. **Per-kind host policy with per-instance worker spawning where needed (chosen).** Each plugin *kind* declares its host policy. Toolchains run in their own worker per build; emulator runs in its own worker (or main, see below); converters run in a shared pool. Panels and editors run on main. DebugAdapter shares the host of the EmulatorPlugin it adapts.
5. **iframe-based isolation.** Strong sandbox, but heavy and limits direct port access. Rejected: workers give enough containment for trusted-plugin era; iframes are overkill until we ship a marketplace.

## Decision outcome

Adopt **per-kind host policy** with a typed RPC transport. Plugin authors write against the policy for their kind; the workbench handles the wiring.

### Host matrix

| Plugin kind | Host | Why |
|-------------|------|-----|
| **MachinePlugin** | main | Mostly static descriptors (memory map, dims, sample rate). No heavy compute. Pinning to main avoids serialisation of typed-array layout. |
| **ToolchainPlugin** | dedicated worker per build | MADS assemble is wasm + heavy I/O. Long runs (~seconds) must not block UI. Per-build worker = clean memory + simple cancel. |
| **EmulatorPlugin** | main (v1) → dedicated worker (later) | Altirra wasm + Web Audio scheduling currently run on main. Moving emulator to a worker requires either `OffscreenCanvas` for video (mostly ok), audio worklet (fine), and a low-latency RPC for step/run. v1 keeps emulator on main; M4 follow-up issue to migrate, deferred until cycle budget says we need it. |
| **DebugAdapter** | same host as its EmulatorPlugin | Adapter pokes the emulator's debug interface synchronously (StepInto, GetReg, ReadMem). Splitting host would mean an async boundary on every step — kills step-rate. |
| **PanelPlugin** | main | DOM access is the whole point of a panel. Off-main panels would need `OffscreenCanvas` + worker DOM polyfills — not worth it for first-party panels. |
| **FileEditorPlugin** | main | Same reasoning as PanelPlugin. Editors mount into the DOM. |
| **AssetPlugin (converter)** | shared worker pool | Converters are pure functions (`bytes → bytes`). Easy to serialise. A pool (size ~ navigator.hardwareConcurrency / 2) prevents starvation when running many recipes. |

Default for any future plugin kind: **main thread unless heavy compute or untrusted code says otherwise.**

### Transport contract

All cross-host plugin calls use a typed RPC over `postMessage`. We adopt **Comlink** (≈ 5 KB) for the proxy machinery — it gives `await proxy.build(project)` ergonomics on top of `postMessage` without us writing serialisation glue. Comlink is a hard dep of the workbench, not a per-plugin import.

```ts
// In @ports/PluginTransport.ts (lands with the contracts in M3-services)
type PluginEndpoint<T> = {
  call<K extends keyof T>(method: K, ...args: Parameters<T[K]>): Promise<ReturnType<T[K]>>;
  on(event: string, handler: (payload: unknown) => void): () => void;
  dispose(): Promise<void>;
};
```

Same shape regardless of host. Main-thread plugins also expose a `PluginEndpoint` so the host-policy boundary is invisible to callers — that's how a future "move emulator to worker" can land without changing call sites.

Restrictions on what crosses the boundary:

- **Transferable types only** for hot paths: `ArrayBuffer`, `Uint8Array`, `MessagePort`, `ImageBitmap`, `OffscreenCanvas`. No `Map`/`Set` over the wire; convert to arrays first.
- **No function references over the wire.** Callbacks become `MessagePort`s or named events on the endpoint.
- **No DOM nodes over the wire.** Panel plugins never cross the boundary, so this is moot for them.

### Lifecycle

Each plugin instance has four states: `loading`, `ready`, `running`, `disposed`. The host owns the lifecycle:

1. **Load** — fetch the plugin module (Blob URL or worker entry), call `init(ctx)` with a context object.
2. **Run** — endpoint calls. Synchronous from the caller's perspective via `await`.
3. **Crash** — worker `onerror` or `unhandledrejection` from main-host plugins. Host emits `plugin:crashed` event; PluginRegistry can reload by re-running step 1. ADR-0004 (error boundaries) defines the user-facing behaviour.
4. **Dispose** — `endpoint.dispose()` runs plugin teardown, then worker terminates (or main-host plugin context is dropped).

Crashed plugins do **not** auto-reload. The user (or a service) decides whether to retry; otherwise the plugin slot stays empty with a "plugin crashed, click to retry" UI.

### Hot reload

Out of scope for v1. The transport contract supports it (just dispose + reload), but the registry-level "watch plugin source, reload on change" loop lands later if/when DX demands it. Tracked in [`wiki/agents/deferred.md`](../agents/deferred.md).

### SharedArrayBuffer

Not used at v1. If a future EmulatorPlugin wants zero-copy frame buffers or atomic CPU state, SAB requires COOP/COEP headers from the hosting layer (see hosting issue). Decision then.

### Bundle structure

- Workers are separate Vite entries (`?worker` import) — first-party (toolchain, emulator, converter pool) ship as part of the workbench bundle.
- Third-party plugin modules continue to load via Blob URL + dynamic `import()`. For worker-hosted kinds, the plugin module is loaded *inside* the worker (importScripts equivalent). The host policy decides which side of the boundary loads the third-party code.
- No CSP relaxation is needed — Blob URLs + workers stay within the same origin.

## Migration

- M3-services lands the `PluginRegistry`, `PluginEndpoint` types, and the Comlink dependency. Stubs for each host policy.
- M4 (MachinePlugin) and M5 (ToolchainPlugin) implement the policies for their kinds. The toolchain-worker pathway is the first real test of the contract; if Comlink ergonomics hurt, this is the moment to swap.
- M7 (PanelPlugin) keeps main-thread hosting; the contract changes for it are minimal (a `PanelContext` instead of an `EndpointContext`).
- Emulator-in-worker migration is its own follow-up issue under M4 (not blocking).
- AssetPlugin (converters) keeps its current Blob-URL loader for now; the worker-pool move lands when there's a recipe slow enough to justify it. Until then, "converter runs in worker" is a host-policy intent that the workbench can satisfy by adding a thin worker shim.

## Positive consequences

- Plugin authors get a uniform `await endpoint.method(...)` API regardless of host. They don't write `postMessage`.
- Crash containment for the heavy paths (assemble, asset conversion) without paying isolation cost on panels and editors.
- Future move of any plugin between hosts is a workbench-level change, not a contract break.
- Comlink as a single, small dependency keeps the transport boilerplate minimal.

## Negative consequences

- Workers add a build configuration step (Vite worker entries) — one-time cost in Foundation / M3.
- Comlink is a third-party dependency we now own keeping up to date. Tracked in `wiki/decisions/` if we ever swap (Comlink → Penpal → hand-rolled). For now: small surface, mature, MIT.
- The "everything async" pretence (main-host plugins also return `Promise`s) costs a microtask per call. Negligible in practice; explicitly accepted to keep contract uniform.
- The "emulator on main thread for v1" decision means a perf-conscious user can still observe React jank during heavy step bursts. That's a known limitation, documented, and addressable later without a contract change.

## Open questions

- **Converter worker pool sizing.** Pick a concrete number once the recipe engine + worker pool both land. Hard-coded `navigator.hardwareConcurrency / 2` with a minimum of 1 is the v1 sketch.
- **Worker termination on idle.** Long-lived toolchain worker vs cold-start per build. Default: cold per build; revisit if cold-start time hurts.
- **DebugAdapter when the emulator moves to a worker.** The "adapter runs in the same host" rule means the adapter moves too. The debugger UI talks to the adapter over the same `PluginEndpoint`, so the migration is transparent to UI code. The thing that changes: panel plugins that today touch debug state via shared memory need to switch to event-based subscription.

## Links

- Foundation epic: `b1236bb`
- This issue: `8a46005`
- ADR-0001 — Plugin-based retro-development workbench
- ADR-0002 — Layering rules + dependency direction (defines `@ports/PluginTransport.ts` location)
- ADR-0004 — Error boundary strategy (defines crash-handling UX)
- Issue `27fa821` — migrate audio output from ScriptProcessorNode to AudioWorklet (precondition for emulator-in-worker)
- Issue `c2f4590` — M8 monorepo split (when comlink + per-host code becomes its own package)
