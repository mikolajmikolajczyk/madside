import type {
  BuildError as BuildErrorType,
  BuildInput,
  BuildOptions,
  BuildResult,
  BuildService,
  EventBus,
  Logger,
  Recipe,
  Result,
} from '@ports'
import { BuildError, err, ok } from '@ports'

// BuildService wraps the assemble pipeline (recipe engine → toolchain) and
// emits 'build:start' / 'build:done' / 'build:error' through the workbench
// EventBus. Race-guarded by a monotonic seq counter; debounce timer is
// cancelled on `cancel()` and on every fresh `buildDebounced` call.
//
// Per ADR-0002, services don't know about specific adapters. The toolchain
// invocation + the recipe engine are injected as functions; @app wires the
// concrete @adapters/wasm-mads + @plugins/converters implementations in.
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
  listing?: string
  labels?: string
  exitCode: number
}

export type ToolchainAssembleFn = (
  mainPath: string,
  files: BuildFileLike[],
) => Promise<ToolchainAssembleResult>

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
  toolchain: ToolchainAssembleFn
  recipes: RecipeRunnerFn
  logger?: Logger
}

interface ManifestShape {
  main?: string
  recipes?: Recipe[]
}

const DEFAULT_DEBOUNCE_MS = 400

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
      const manifest = input.manifest as ManifestShape
      const main = manifest.main
      if (!main) {
        throw new BuildError('manifest.main is missing — nothing to assemble')
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

      const assembleResult = await deps.toolchain(main, assembleInput)

      if (mySeq !== seq) {
        return err(new BuildError(`build superseded (seq ${mySeq} → ${seq})`))
      }

      if (!assembleResult.ok || !assembleResult.binary) {
        const message = `assemble exit ${assembleResult.exitCode}`
        const e = new BuildError(message, assembleResult.stderr)
        deps.events.emit('build:error', { projectId: input.projectId, message })
        log?.warn('build failed', { projectId: input.projectId, exit: assembleResult.exitCode })
        return err(e)
      }

      const result: BuildResult = {
        binary: assembleResult.binary,
        stdout: assembleResult.stdout,
        stderr: assembleResult.stderr,
        listing: assembleResult.listing,
        extras:
          assembleResult.labels !== undefined ? { labels: assembleResult.labels } : undefined,
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
