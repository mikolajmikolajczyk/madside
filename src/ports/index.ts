// @ports — interfaces only. ADR-0002 says any layer above ports/ may import
// from here; ports/ depends only on @core (and its own siblings).
//
// Implementations live in @adapters. Wire-up lives in @app.

// Errors + Result helpers (ADR-0004)
export * from './errors'

// Cross-cutting ports
export type { Logger, LogLevel } from './logger'
export type {
  EventBus,
  EventName,
  EventPayload,
  Unsubscribe,
  WorkbenchEvents,
} from './event-bus'
export type {
  Command,
  CommandContext,
  CommandRegistry,
} from './command-registry'
export type {
  PluginBase,
  PluginEntry,
  PluginKind,
  PluginRegistry,
  PluginSource,
} from './plugin-registry'

// Plugin contracts
export type {
  ConvertFn,
  ConverterMeta,
  ConverterModule,
  ConvertOutput,
  OptionSpec,
  OptionType,
  Recipe,
} from './plugin-converter'

// Storage port
export type {
  Project,
  ProjectFile,
  ProjectMeta,
  ProjectRepository,
  Snapshot,
  SnapshotMeta,
} from './project-repository'

// Service interfaces (implementations land in @services during M3)
export type {
  AssetPipelineService,
  BuildInput,
  BuildOptions,
  BuildResult,
  BuildService,
  DebugService,
  FlagState,
  RecipeRunResult,
  RegState,
  RunBackend,
  RunService,
  RunStatus,
} from './services'
