import type {
  AssetPipelineService,
  BuildService,
  CommandRegistry,
  DebugAdapterPlugin,
  DebugService,
  EmulatorPlugin,
  EventBus,
  Logger,
  MachinePlugin,
  PluginRegistry,
  StorageBackend,
  RunService,
  ToolchainPlugin,
  Unsubscribe,
} from '@ports'
import {
  createAssetPipelineService,
  createBuildService,
  createCommandRegistry,
  createDebugService,
  createEventBus,
  createPluginRegistry,
  createRunService,
  wrapEventBusWithLogger,
  type RecipeRunnerFn,
  type RunBackendFactory,
  type ToolchainAssembleFn,
  type ToolchainResolverFn,
} from '@services'
import { runRecipes, setConverterLoaderFactory } from '@plugins/converters'
import { setEditorLoaderFactory } from '@plugins/editors'
import { createPluginLoader } from '@adapters'
// NOTE: editorToPanel/listBuiltinEditors intentionally NOT imported — built-in
// editors are no longer registered as panels (see the deleted dead scaffolding
// + decision note below).
import { builtinPlugins } from './builtin-plugins'
// Composition-time references: these specific plugins are wired into the
// machine-selection table / RunService init / introspection fields below, on
// top of being registered via the builtin manifest. Every other built-in is
// register-then-resolve-by-id only, so it lives only in builtin-plugins.ts.
import { atariXl } from '@plugins/machine-atari-xl'
import { machineNes } from '@plugins/machine-nes'
import { machineC64 } from '@plugins/machine-c64'
import { machineZx } from '@plugins/machine-zx'
import { madsToolchain } from '@madside/toolchain-mads'

// Workbench Core — the headless workbench instance the rest of the app talks
// to. UI consumes it via React context; tests instantiate it directly with
// memory adapters. ADR-0002 puts wiring at the @app layer because @services /
// @adapters can't reach across each other directly.

export interface WorkbenchDeps {
  storage: StorageBackend
  logger: Logger
  /** Override the toolchain resolver — tests pass a stub keyed on the
   *  manifest.toolchain id. Default uses the PluginRegistry. */
  toolchain?: ToolchainResolverFn
  /** Override the recipe runner — defaults to @plugins/converters.runRecipes. */
  recipes?: RecipeRunnerFn
  /** Override the emulator backend factory (atari-xl only; tests pass a stub).
   *  Default resolves the machine's `compatibleEmulators[0]` from the registry. */
  emuBackendFactory?: RunBackendFactory
  /** Override the active DebugAdapter — tests pass a stub. Default resolves the
   *  machine's `compatibleDebugAdapters[0]` from the registry. */
  debugAdapter?: DebugAdapterPlugin
}

export interface Workbench {
  readonly events: EventBus
  readonly commands: CommandRegistry
  readonly plugins: PluginRegistry
  readonly storage: StorageBackend
  readonly build: BuildService
  readonly run: RunService
  readonly debug: DebugService
  readonly assets: AssetPipelineService
  /** Currently active MachinePlugin. UI panels (Emulator, Debug) read display /
   *  audio / input / memoryMap from here. Reactive: read via `useActiveMachine`
   *  (ADR-0007), which subscribes through `subscribeMachine`. */
  readonly machine: MachinePlugin
  /** Switch the active machine by id (from `project.manifest.machine`). Swaps
   *  the MachinePlugin + RunService backend + DebugService adapter, then
   *  notifies `subscribeMachine` listeners. No-op when the id is already active
   *  or unknown. */
  setActiveMachine(machineId: string): void
  /** Subscribe to active-machine changes. Fires after `setActiveMachine`
   *  swaps. `useActiveMachine` wraps this through `useSyncExternalStore`. */
  subscribeMachine(listener: () => void): Unsubscribe
  /** Currently active ToolchainPlugin. BuildService dispatches by
   *  `manifest.toolchain` id via the PluginRegistry resolver; this field is
   *  retained for UI introspection only. */
  readonly toolchain: ToolchainPlugin
  readonly logger: Logger
}

/** Adapt a ToolchainPlugin into the BuildService's narrower hook shape.
 *  Service stays adapter-free; plugin owns the assemble call. */
const toolchainToBuildHook = (plugin: ToolchainPlugin): ToolchainAssembleFn =>
  async (mainPath, files, options, machine) => {
    const out = await plugin.build({
      projectId: '__buildservice__',
      main: mainPath,
      files: files.map((f) => ({ path: f.path, content: f.content })),
      options,
      machine,
    })
    return {
      ok: out.ok,
      binary: out.binary,
      stdout: out.stdout,
      stderr: out.stderr,
      sourceMap: out.sourceMap,
      labels: out.labels,
      diagnostics: out.diagnostics,
      extras: out.extras,
      exitCode: out.exitCode,
    }
  }

/** Build the registry-backed toolchain resolver. Used as the default for the
 *  BuildService.toolchain dep when no override is supplied. */
const registryToolchainResolver =
  (plugins: PluginRegistry): ToolchainResolverFn =>
  (id: string) => {
    const plugin = plugins.get('toolchain', id) as ToolchainPlugin | undefined
    return plugin ? toolchainToBuildHook(plugin) : undefined
  }

const makeDefaultRecipes = (storage: StorageBackend): RecipeRunnerFn => async (projectId, recipes, files) => {
  const results = await runRecipes(projectId, recipes, files, (path, bytes) =>
    storage.projects.writeFile(projectId, path, bytes),
  )
  return results.map((r) => ({
    ok: r.ok,
    output: r.output ? { path: r.output.path, content: r.output.bytes } : undefined,
  }))
}

export function createWorkbench(deps: WorkbenchDeps): Workbench {
  // Inject the concrete Blob-URL plugin loader (an adapter) into the converter
  // and editor registries. They depend on the @ports loader contract; @app is
  // the only layer allowed to hand them the adapter implementation (#25).
  setConverterLoaderFactory(createPluginLoader)
  setEditorLoaderFactory(createPluginLoader)

  // Vite injects import.meta.env.VITE_* at build time. When the dev-mode
  // event logger is on, every emit goes through console.group with a
  // monotonic counter + delta + subscriber count. Off by default (zero
  // runtime cost when undefined or '0').
  const eventLogEnv =
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env.VITE_MADSIDE_EVENT_LOG as string | undefined)
      : undefined
  const baseEvents = createEventBus()
  const events = eventLogEnv === '1' ? wrapEventBusWithLogger(baseEvents) : baseEvents
  const commands = createCommandRegistry()
  const plugins = createPluginRegistry()

  // Register every bundled plugin from the built-in manifest (#67). The
  // registry keys by kind+id, so order is irrelevant; machines resolve their
  // emulator / debug adapter by id below via `compatibleEmulators` /
  // `compatibleDebugAdapters`, and BuildService dispatches toolchains via
  // manifest.toolchain → PluginRegistry. Adding a capability = one line in
  // builtin-plugins.ts.
  for (const plugin of builtinPlugins) {
    plugins.register({ plugin, source: { origin: 'builtin' } })
  }
  // NOTE: converters + editors are deliberately NOT in the PluginRegistry —
  // they have a different lifecycle (project-local, per-file, content-addressed
  // JS loaded on demand via Blob URL, resolved by file extension). The
  // PluginRegistry models built-in singletons (machine/toolchain/emulator/
  // debug/panel); converters/editors use their dedicated content-addressed
  // loaders (@plugins/converters, @plugins/editors). See
  // wiki/decisions/2026-06-16-plugin-registry-vs-dedicated-loaders.md.

  // Resolve a machine's emulator backend through the registry: the machine
  // names its emulator in `compatibleEmulators`, the EmulatorPlugin builds the
  // RunBackend (lazy, so the core loads only on boot).
  const resolveEmulatorBackend = (machine: MachinePlugin): RunBackendFactory => {
    const emuId = machine.compatibleEmulators[0]
    const emulator = plugins.get<EmulatorPlugin>('emulator', emuId)
    if (!emulator) {
      throw new Error(`machine '${machine.id}' requires emulator '${emuId}', not registered`)
    }
    return () => emulator.createBackend()
  }

  // Same pattern for the debug adapter: the machine names it via
  // `compatibleDebugAdapters`, resolved from the registry (no hardcoded table).
  const resolveDebugAdapter = (machine: MachinePlugin): DebugAdapterPlugin => {
    const id = machine.compatibleDebugAdapters[0]
    const adapter = plugins.get<DebugAdapterPlugin>('debug-adapter', id)
    if (!adapter) {
      throw new Error(`machine '${machine.id}' requires debug adapter '${id}', not registered`)
    }
    return adapter
  }

  // Machine selection table (1972a36). Each machine pairs a MachinePlugin with
  // its emulator backend + debug adapter, both resolved from the registry via
  // the machine's `compatibleEmulators` / `compatibleDebugAdapters`. The
  // atari-xl entry honours the test overrides (emuBackendFactory / debugAdapter).
  // setActiveMachine swaps the active entry when the manifest's `machine` changes.
  interface MachineSetup {
    machine: MachinePlugin
    backendFactory: RunBackendFactory
    debugAdapter: DebugAdapterPlugin
  }
  const machineSetups: Record<string, MachineSetup> = {
    'atari-xl': {
      machine: atariXl,
      backendFactory: deps.emuBackendFactory ?? resolveEmulatorBackend(atariXl),
      debugAdapter: deps.debugAdapter ?? resolveDebugAdapter(atariXl),
    },
    nes: {
      machine: machineNes,
      backendFactory: resolveEmulatorBackend(machineNes),
      debugAdapter: deps.debugAdapter ?? resolveDebugAdapter(machineNes),
    },
    c64: {
      machine: machineC64,
      backendFactory: resolveEmulatorBackend(machineC64),
      debugAdapter: deps.debugAdapter ?? resolveDebugAdapter(machineC64),
    },
    'zx-spectrum': {
      machine: machineZx,
      backendFactory: resolveEmulatorBackend(machineZx),
      debugAdapter: deps.debugAdapter ?? resolveDebugAdapter(machineZx),
    },
  }
  let activeMachine: MachinePlugin = atariXl
  const machineSubs = new Set<() => void>()

  const build = createBuildService({
    events,
    logger: deps.logger,
    toolchain: deps.toolchain ?? registryToolchainResolver(plugins),
    recipes: deps.recipes ?? makeDefaultRecipes(deps.storage),
  })
  const run = createRunService({
    events,
    logger: deps.logger,
    backendFactory: machineSetups['atari-xl']!.backendFactory,
    hardwareConfig: atariXl.hardwareConfig,
    media: atariXl.media,
  })
  const debug = createDebugService({
    events,
    logger: deps.logger,
    run,
    adapter: machineSetups['atari-xl']!.debugAdapter,
  })

  const setActiveMachine = (machineId: string): void => {
    const setup = machineSetups[machineId]
    if (!setup) {
      deps.logger.warn?.(`setActiveMachine: unknown machine '${machineId}' — keeping ${activeMachine.id}`)
      return
    }
    if (setup.machine === activeMachine) return
    activeMachine = setup.machine
    run.reconfigure({
      backendFactory: setup.backendFactory,
      media: setup.machine.media,
      hardwareConfig: setup.machine.hardwareConfig,
    })
    debug.setAdapter(setup.debugAdapter)
    for (const cb of machineSubs) cb()
  }
  const assets = createAssetPipelineService({
    events,
    logger: deps.logger,
    recipes: async (projectId, recipes, files) => {
      // runRecipes returns its native shape; map to RecipeRunnerResultLike for
      // the service. Pass-through recipe object preserves converter/input/output
      // so AssetPipelineService can index recipes by their output path.
      const native = await runRecipes(
        projectId,
        recipes,
        files.map((f) => ({ path: f.path, content: new Uint8Array(f.content) })),
        (path, bytes) => deps.storage.projects.writeFile(projectId, path, bytes),
      )
      return native.map((r) => ({
        ok: r.ok,
        output: r.output
          ? { path: r.output.path, content: new Uint8Array(r.output.bytes) }
          : undefined,
        recipe: r.recipe,
        error: r.error,
      }))
    },
  })

  return {
    events,
    commands,
    plugins,
    storage: deps.storage,
    build,
    run,
    debug,
    assets,
    get machine() {
      return activeMachine
    },
    setActiveMachine,
    subscribeMachine(listener: () => void): Unsubscribe {
      machineSubs.add(listener)
      return () => machineSubs.delete(listener)
    },
    toolchain: madsToolchain,
    logger: deps.logger,
  }
}
