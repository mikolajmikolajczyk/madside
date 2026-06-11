import type {
  CommandRegistry,
  EventBus,
  Logger,
  PluginRegistry,
  ProjectRepository,
} from '@ports'
import {
  createCommandRegistry,
  createEventBus,
  createPluginRegistry,
} from '@services'

// Workbench Core — the headless workbench instance the rest of the app talks
// to. UI consumes it via React context; tests instantiate it directly with
// memory adapters. ADR-0002 puts wiring at the @app layer because @services /
// @adapters can't reach across each other directly.
//
// Build / Run / Debug services land here in M3 once their implementations
// exist; until then this is the minimum wiring needed to host plugins, events,
// commands, and storage.

export interface WorkbenchDeps {
  projectRepo: ProjectRepository
  logger: Logger
}

export interface Workbench {
  readonly events: EventBus
  readonly commands: CommandRegistry
  readonly plugins: PluginRegistry
  readonly projects: ProjectRepository
  readonly logger: Logger
}

export function createWorkbench(deps: WorkbenchDeps): Workbench {
  const events = createEventBus()
  const commands = createCommandRegistry()
  const plugins = createPluginRegistry()

  return {
    events,
    commands,
    plugins,
    projects: deps.projectRepo,
    logger: deps.logger,
  }
}
