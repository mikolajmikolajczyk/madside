import type {
  BuildDiagnostic,
  BuildError as BuildErrorType,
  BuildInput,
  BuildOptions,
  BuildResult,
  BuildService,
  DebugInfo,
  EventBus,
  Logger,
  Recipe,
  Result,
  SourceMap,
} from '@ports'
import { BuildError, err, ok } from '@ports'

// BuildService wraps the assemble pipeline (recipe engine → toolchain) and
// emits 'build:start' / 'build:done' / 'build:error' through the workbench
// EventBus. Race-guarded by a monotonic seq counter; debounce timer is
// cancelled on `cancel()` and on every fresh `buildDebounced` call.
//
// Per ADR-0002, services don't know about specific adapters. The toolchain
// invocation + the recipe engine are injected as functions; @app wires the
// concrete @adapters/wasm-mads + @madside/converters implementations in.
// When ToolchainPlugin (M5) lands, the same hooks become PluginRegistry
// lookups.

export interface BuildFileLike {
  path: string
  content: Uint8Array
}

export interface ToolchainAssembleResult {
  ok: boolean
  binary?: Uint8Array
  stdout: string
  stderr: string
  sourceMap?: SourceMap
  labels?: Map<string, number>
  /** Typed-symbol model for the debugger (ADR-0011, #130). */
  debugInfo?: DebugInfo
  /** Parsed error/warning locations (#29). Present on success too (warnings). */
  diagnostics?: BuildDiagnostic[]
  /** Toolchain-specific extras forwarded to BuildResult.extras unchanged. */
  extras?: Record<string, unknown>
  exitCode: number
}

export type ToolchainAssembleFn = (
  mainPath: string,
  files: BuildFileLike[],
  /** Free-form build options from `manifest.build` (e.g. raw toolchain args). */
  options?: Record<string, unknown>,
  /** Active machine id (`manifest.machine`) — a multi-target toolchain (cc65)
   *  derives its target + sysroot from it. */
  machine?: string,
) => Promise<ToolchainAssembleResult>

/** Resolve the assemble function for a given toolchain id (from manifest.toolchain).
 *  Undefined means "no plugin of that id registered" — BuildService surfaces
 *  a clear ManifestError-equivalent. */
export type ToolchainResolverFn = (toolchainId: string) => ToolchainAssembleFn | undefined

export interface RecipeRunResult {
  ok: boolean
  output?: BuildFileLike
}

export type RecipeRunnerFn = (
  projectId: string,
  recipes: Recipe[],
  files: BuildFileLike[],
) => Promise<RecipeRunResult[]>

export interface BuildServiceDeps {
  events: EventBus
  /** Manifest-driven toolchain dispatch. Plugin id (from manifest.toolchain)
   *  → assemble function. */
  toolchain: ToolchainResolverFn
  recipes: RecipeRunnerFn
  logger?: Logger
}

/** Auto-build debounce. Exported so the React-side auto-assemble hook reuses the
 *  same value instead of hardcoding its own (they must not drift — #23). */
export const DEFAULT_DEBOUNCE_MS = 400

export function createBuildService(deps: BuildServiceDeps): BuildService {
  const log = deps.logger?.child('build') ?? deps.logger
  let seq = 0
  let pendingTimer: ReturnType<typeof setTimeout> | null = null
  let busy = false

  const cancelTimer = () => {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer)
      pendingTimer = null
    }
  }

  const buildOnce = async (
    input: BuildInput,
  ): Promise<Result<BuildResult, BuildErrorType>> => {
    const mySeq = ++seq
    busy = true
    deps.events.emit('build:start', { projectId: input.projectId })
    try {
      const manifest = input.manifest
      const main = manifest.main
      const assemble = deps.toolchain(manifest.toolchain)
      if (!assemble) {
        throw new BuildError(`toolchain '${manifest.toolchain}' is not registered`)
      }

      const fileLikes: BuildFileLike[] = input.files.map((f) => ({
        path: f.path,
        content: new Uint8Array(f.content),
      }))

      const recipes = manifest.recipes ?? []
      const recipeResults =
        recipes.length > 0 ? await deps.recipes(input.projectId, recipes, fileLikes) : []

      if (mySeq !== seq) {
        return err(new BuildError(`build superseded (seq ${mySeq} → ${seq})`))
      }

      const merged = new Map<string, Uint8Array>()
      for (const f of fileLikes) merged.set(f.path, f.content)
      for (const r of recipeResults) {
        if (r.ok && r.output) merged.set(r.output.path, r.output.content)
      }
      const assembleInput: BuildFileLike[] = [...merged.entries()].map(([path, content]) => ({
        path,
        content,
      }))

      const assembleResult = await assemble(main, assembleInput, manifest.build?.options, manifest.machine)

      if (mySeq !== seq) {
        return err(new BuildError(`build superseded (seq ${mySeq} → ${seq})`))
      }

      if (!assembleResult.ok || !assembleResult.binary) {
        const message = `assemble exit ${assembleResult.exitCode}`
        const e = new BuildError(
          message,
          assembleResult.stderr,
          undefined,
          assembleResult.diagnostics,
          assembleResult.stdout,
        )
        // Carry the assembler's output so the Output panel shows *where* it
        // failed, not just the exit code (#4). MADS prints diagnostics
        // (file + line + message) to stdout, so include both streams. The
        // structured `diagnostics` drive inline editor markers (#29).
        deps.events.emit('build:error', {
          projectId: input.projectId,
          message,
          stdout: assembleResult.stdout,
          stderr: assembleResult.stderr,
          diagnostics: assembleResult.diagnostics,
        })
        log?.warn('build failed', { projectId: input.projectId, exit: assembleResult.exitCode })
        return err(e)
      }

      const result: BuildResult = {
        binary: assembleResult.binary,
        stdout: assembleResult.stdout,
        stderr: assembleResult.stderr,
        sourceMap: assembleResult.sourceMap,
        labels: assembleResult.labels,
        debugInfo: assembleResult.debugInfo,
        diagnostics: assembleResult.diagnostics,
        extras: assembleResult.extras,
      }

      deps.events.emit('build:done', { projectId: input.projectId, result })
      return ok(result)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'build failed'
      deps.events.emit('build:error', { projectId: input.projectId, message })
      log?.error('build threw', cause, { projectId: input.projectId })
      const e = cause instanceof BuildError ? cause : new BuildError(message, undefined, cause)
      return err(e)
    } finally {
      if (mySeq === seq) busy = false
    }
  }

  return {
    async build(input, options?: BuildOptions) {
      if (options?.preempt) {
        cancelTimer()
        seq++
      }
      return buildOnce(input)
    },

    buildDebounced(input, delayMs = DEFAULT_DEBOUNCE_MS) {
      cancelTimer()
      pendingTimer = setTimeout(() => {
        pendingTimer = null
        void buildOnce(input)
      }, delayMs)
    },

    cancel() {
      cancelTimer()
      seq++
      busy = false
    },

    get busy() {
      return busy
    },
  }
}
