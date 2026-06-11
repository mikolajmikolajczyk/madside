import type {
  AssetPipelineService,
  BuildService,
  CommandRegistry,
  DebugService,
  EventBus,
  Logger,
  PluginRegistry,
  ProjectRepository,
  RunBackend,
  RunService,
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
} from '@services'
import { assemble } from '@adapters/wasm-mads'
import { runRecipes } from '@plugins/converters'
import { createEmu } from '@adapters/emu'

// Workbench Core — the headless workbench instance the rest of the app talks
// to. UI consumes it via React context; tests instantiate it directly with
// memory adapters. ADR-0002 puts wiring at the @app layer because @services /
// @adapters can't reach across each other directly.

export interface WorkbenchDeps {
  projectRepo: ProjectRepository
  logger: Logger
  /** Override the assemble path — defaults to @adapters/wasm-mads. Tests pass
   *  a stub; later toolchain plugins replace this with a registry lookup. */
  toolchain?: ToolchainAssembleFn
  /** Override the recipe runner — defaults to @plugins/converters.runRecipes. */
  recipes?: RecipeRunnerFn
  /** Override the emulator backend factory — defaults to @adapters/emu.createEmu. */
  emuBackendFactory?: RunBackendFactory
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
  readonly logger: Logger
}

const defaultToolchain: ToolchainAssembleFn = async (mainPath, files) => {
  const r = await assemble(mainPath, files)
  return {
    ok: r.ok,
    binary: r.xex,
    stdout: r.stdout,
    stderr: r.stderr,
    listing: r.lst,
    labels: r.lab,
    exitCode: r.exitCode,
  }
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
  const build = createBuildService({
    events,
    logger: deps.logger,
    toolchain: deps.toolchain ?? defaultToolchain,
    recipes: deps.recipes ?? defaultRecipes,
  })
  const run = createRunService({
    events,
    logger: deps.logger,
    backendFactory: deps.emuBackendFactory ?? defaultEmuBackendFactory,
  })
  const debug = createDebugService({
    events,
    logger: deps.logger,
    run,
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
    logger: deps.logger,
  }
}
