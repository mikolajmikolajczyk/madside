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
} from '@ports'
import {
  createAssetPipelineService,
  createBuildService,
  createCommandRegistry,
  createDebugService,
  createEventBus,
  createPluginRegistry,
  createRunService,
  type RecipeRunnerFn,
  type RunBackendFactory,
  type ToolchainAssembleFn,
  type ToolchainResolverFn,
} from '@services'
import { runRecipes } from '@plugins/converters'
import { atariXl } from '@plugins/machine-atari-xl'
import { madsToolchain } from '@plugins/toolchain-mads'
import { atari6502DebugAdapter } from '@plugins/debug-atari-6502'
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
   *  audio / input / memoryMap from here. Atari-XL hardcoded today; v1.0.0
   *  (NES validation) drives selection from the active project manifest. */
  readonly machine: MachinePlugin
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
  const events = createEventBus()
  const commands = createCommandRegistry()
  const plugins = createPluginRegistry()

  // Register the bundled Atari-XL MachinePlugin + MADS ToolchainPlugin.
  // BuildService now dispatches via manifest.toolchain → PluginRegistry,
  // so adding a second toolchain (M9: ca65) is a register() call away.
  plugins.register({
    plugin: { ...atariXl, kind: 'machine' },
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
  const build = createBuildService({
    events,
    logger: deps.logger,
    toolchain: deps.toolchain ?? registryToolchainResolver(plugins),
    recipes: deps.recipes ?? defaultRecipes,
  })
  const run = createRunService({
    events,
    logger: deps.logger,
    backendFactory: deps.emuBackendFactory ?? defaultEmuBackendFactory,
    hardwareConfig: atariXl.hardwareConfig,
    media: atariXl.media,
  })
  const debug = createDebugService({
    events,
    logger: deps.logger,
    run,
    adapter: deps.debugAdapter ?? atari6502DebugAdapter,
  })
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
    machine: atariXl,
    toolchain: madsToolchain,
    logger: deps.logger,
  }
}
