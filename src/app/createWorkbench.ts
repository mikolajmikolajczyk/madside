import type {
  AssetPipelineService,
  BuildService,
  CommandRegistry,
  DebugAdapterPlugin,
  DebugService,
  EventBus,
  Logger,
  MachinePlugin,
  PluginRegistry,
  ProjectRepository,
  RunBackend,
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
import { runRecipes } from '@plugins/converters'
import { atariXl } from '@plugins/machine-atari-xl'
import { machineNes } from '@plugins/machine-nes'
import { madsToolchain } from '@plugins/toolchain-mads'
import { atari6502DebugAdapter } from '@plugins/debug-atari-6502'
import { registersPanel } from '@plugins/panel-registers'
import { memoryPanel } from '@plugins/panel-memory'
import { outputPanel } from '@plugins/panel-output'
import { editorToPanel, listBuiltinEditors } from '@plugins/editors'
import { createEmu } from '@adapters/emu'

// Workbench Core — the headless workbench instance the rest of the app talks
// to. UI consumes it via React context; tests instantiate it directly with
// memory adapters. ADR-0002 puts wiring at the @app layer because @services /
// @adapters can't reach across each other directly.

export interface WorkbenchDeps {
  projectRepo: ProjectRepository
  logger: Logger
  /** Override the toolchain resolver — tests pass a stub keyed on the
   *  manifest.toolchain id. Default uses the PluginRegistry. */
  toolchain?: ToolchainResolverFn
  /** Override the recipe runner — defaults to @plugins/converters.runRecipes. */
  recipes?: RecipeRunnerFn
  /** Override the emulator backend factory — defaults to @adapters/emu.createEmu. */
  emuBackendFactory?: RunBackendFactory
  /** Override the active DebugAdapter — defaults to atari6502DebugAdapter.
   *  v1.0.0 manifest-driven selection lands with EmulatorPlugin (M4-followup). */
  debugAdapter?: DebugAdapterPlugin
}

export interface Workbench {
  readonly events: EventBus
  readonly commands: CommandRegistry
  readonly plugins: PluginRegistry
  readonly projects: ProjectRepository
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
  async (mainPath, files) => {
    const out = await plugin.build({
      projectId: '__buildservice__',
      main: mainPath,
      files: files.map((f) => ({ path: f.path, content: f.content })),
    })
    return {
      ok: out.ok,
      binary: out.binary,
      stdout: out.stdout,
      stderr: out.stderr,
      sourceMap: out.sourceMap,
      labels: out.labels,
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

const defaultRecipes: RecipeRunnerFn = async (projectId, recipes, files) => {
  const results = await runRecipes(projectId, recipes, files)
  return results.map((r) => ({
    ok: r.ok,
    output: r.output ? { path: r.output.path, content: r.output.bytes } : undefined,
  }))
}

const defaultEmuBackendFactory: RunBackendFactory = async () => {
  const emu = await createEmu()
  return emu as unknown as RunBackend
}

export function createWorkbench(deps: WorkbenchDeps): Workbench {
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

  // Register the bundled Atari-XL MachinePlugin + MADS ToolchainPlugin.
  // BuildService now dispatches via manifest.toolchain → PluginRegistry,
  // so adding a second toolchain (M9: ca65) is a register() call away.
  plugins.register({
    plugin: { ...atariXl, kind: 'machine' },
    source: { origin: 'builtin' },
  })
  // machine-nes resolves via the registry (plugins.get('machine','nes')); the
  // active `machine` field below stays atari-xl until manifest-driven machine
  // selection lands (the end-to-end NES path — separate from this plugin's
  // data + registration).
  plugins.register({
    plugin: { ...machineNes, kind: 'machine' },
    source: { origin: 'builtin' },
  })
  plugins.register({
    plugin: { ...madsToolchain, kind: 'toolchain' },
    source: { origin: 'builtin' },
  })
  plugins.register({
    plugin: { ...atari6502DebugAdapter, kind: 'debug-adapter' },
    source: { origin: 'builtin' },
  })
  for (const panel of [registersPanel, memoryPanel, outputPanel]) {
    plugins.register({
      plugin: { ...panel, kind: 'panel' },
      source: { origin: 'builtin' },
    })
  }
  // Phase 11 built-in editors surface through the unified PluginRegistry as
  // file-bound panels. Project-side editors (editors/*.js, Blob-URL-loaded)
  // still go through the legacy buildEditorRegistry path until UI swaps to
  // PanelSlot for file editing.
  for (const editor of listBuiltinEditors()) {
    plugins.register({
      plugin: { ...editorToPanel(editor), kind: 'panel' },
      source: { origin: 'builtin' },
    })
  }
  // Machine selection table (1972a36). Each machine pairs a MachinePlugin with
  // its emulator backend factory + debug adapter. setActiveMachine swaps the
  // active entry when the project manifest's `machine` changes. The atari-xl
  // entry honours the test overrides (emuBackendFactory / debugAdapter); NES
  // uses the jsnes backend. The atari6502 adapter is CPU-shape-generic
  // (reads backend.cpuState() in the 6502 struct JsnesBackend also returns),
  // so it serves NES verbatim until a labelled debug-nes adapter lands.
  interface MachineSetup {
    machine: MachinePlugin
    backendFactory: RunBackendFactory
    debugAdapter: DebugAdapterPlugin
  }
  const machineSetups: Record<string, MachineSetup> = {
    'atari-xl': {
      machine: atariXl,
      backendFactory: deps.emuBackendFactory ?? defaultEmuBackendFactory,
      debugAdapter: deps.debugAdapter ?? atari6502DebugAdapter,
    },
    nes: {
      machine: machineNes,
      // Lazy import so jsnes (~31 KB) is code-split out of the main bundle —
      // only fetched when a project actually selects the NES machine. Same
      // shape as Altirra (whose heavy wasm core is fetched on boot).
      backendFactory: async () =>
        (await import('@plugins/emulator-nes-jsnes')).createJsnesBackend(),
      debugAdapter: deps.debugAdapter ?? atari6502DebugAdapter,
    },
  }
  let activeMachine: MachinePlugin = atariXl
  const machineSubs = new Set<() => void>()

  const build = createBuildService({
    events,
    logger: deps.logger,
    toolchain: deps.toolchain ?? registryToolchainResolver(plugins),
    recipes: deps.recipes ?? defaultRecipes,
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
    projects: deps.projectRepo,
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
