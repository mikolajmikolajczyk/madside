import type {
  BuildService,
  CommandRegistry,
  EventBus,
  Logger,
  PluginRegistry,
  ProjectRepository,
} from '@ports'
import {
  createBuildService,
  createCommandRegistry,
  createEventBus,
  createPluginRegistry,
  type RecipeRunnerFn,
  type ToolchainAssembleFn,
} from '@services'
import { assemble } from '@adapters/wasm-mads'
import { runRecipes } from '@plugins/converters'

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
}

export interface Workbench {
  readonly events: EventBus
  readonly commands: CommandRegistry
  readonly plugins: PluginRegistry
  readonly projects: ProjectRepository
  readonly build: BuildService
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

  return {
    events,
    commands,
    plugins,
    projects: deps.projectRepo,
    build,
    logger: deps.logger,
  }
}
