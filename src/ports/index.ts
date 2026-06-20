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
export type {
  PluginLoader,
  PluginLoaderFactory,
  ProjectPluginSource,
} from './plugin-loader'

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
export type {
  EditorAsset,
  EditorContext,
  EditorHandle,
  EditorMeta,
  EditorModule,
  EditorMount,
} from './plugin-editor'
export type {
  ToolchainBuildInput,
  ToolchainBuildOutput,
  ToolchainFile,
  ToolchainLanguage,
  ToolchainPlugin,
  ToolchainSnippet,
} from './plugin-toolchain'
export type {
  DebugAdapterPlugin,
  DebugTarget,
  FlagDescriptor,
  RegisterDescriptor,
} from './plugin-debug'
export type {
  PanelComponent,
  PanelContext,
  PanelData,
  PanelFile,
  PanelMount,
  PanelPlugin,
} from './plugin-panel'
export type { EmulatorPlugin } from './plugin-emulator'
export type { Cpu6502State, CpuZ80State } from './cpu'
export type {
  BootEquates,
  CpuId,
  DeviceDescriptor,
  InputLayout,
  InputLayoutKind,
  MachineAudio,
  MachineDisplay,
  MachineHardwareConfig,
  MachineMedia,
  MachinePlugin,
  MemoryRegion,
  MemoryRegionKind,
  MemorySpace,
  ProgramLoadRange,
} from './plugin-machine'

// Toolchain output types
export type { SourceLoc, SourceMap } from './source-map'
export type { BuildDiagnostic } from './diagnostics'

// Project manifest schema v2 (hard cut from v1)
export { MANIFEST_VERSION, parseProjectManifest } from './project-manifest'
export type { ProjectManifestV2 } from './project-manifest'

// Storage port — complete persistence seam (supersedes ProjectRepository)
export type {
  BreakpointsMap,
  BreakpointsRecord,
  BreakpointStore,
  BuildStore,
  CourseStore,
  FileRow,
  InstalledCourseRow,
  KeyValueStore,
  LoadedProject,
  ProjectFile,
  ProjectFileInput,
  ProjectRow,
  ProjectStore,
  SnapshotDiff,
  SnapshotInput,
  SnapshotMeta,
  SnapshotStore,
  StorageBackend,
  StoredBuild,
} from './storage'

// Service interfaces (implementations land in @services during M3)
export type {
  AssetPipelineFile,
  AssetPipelineInput,
  AssetPipelineService,
  BuildInput,
  BuildOptions,
  BuildResult,
  BuildService,
  DebugService,
  EmuMediaFormat,
  FlagState,
  RecipeRunResult,
  RegState,
  RunBackend,
  RunService,
  RunStatus,
} from './services'
