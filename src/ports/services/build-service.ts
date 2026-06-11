// BuildService — wraps the toolchain pipeline. v0.5.0: dispatches to the
// active ToolchainPlugin (MADS first impl). Manifest-driven selection lands
// with 0897b06.

import type { BuildError, Result } from '../errors'
import type { Project } from '../project-repository'
import type { SourceMap } from '../source-map'

export interface BuildOptions {
  /** Hard-cancel any in-flight build before starting this one. */
  preempt?: boolean
}

export interface BuildResult {
  /** Compiled binary (xex / nes / prg / generic — toolchain decides). */
  binary: Uint8Array
  /** Toolchain stdout (e.g. MADS report). */
  stdout: string
  /** Toolchain stderr — present even on success when warnings emit. */
  stderr: string
  /** Parsed source map (PC ↔ source loc). Toolchain plugin owns the parse. */
  sourceMap?: SourceMap
  /** Parsed label dump — `name → address`. Toolchain plugin owns the parse. */
  labels?: Map<string, number>
  /** Toolchain-specific extras (e.g. raw listing for download). */
  extras?: Record<string, unknown>
}

/** Minimal project shape the build service needs. Either a full Project from
 *  ProjectRepository, or an ad-hoc snapshot built from React state — both
 *  fit. Callers pass the freshest in-memory view; the service does NOT
 *  re-read storage between debounce and run. */
export interface BuildInput {
  projectId: string
  files: Project['files']
  manifest: Project['manifest']
}

export interface BuildService {
  /** Assemble once. Returns Result; cancellation surfaces as Err(BuildError). */
  build(input: BuildInput, options?: BuildOptions): Promise<Result<BuildResult, BuildError>>

  /** Debounced rebuild — race-guard ensures only the latest assemble commits.
   *  Returns synchronously; subscribe to `build:done` events for results. */
  buildDebounced(input: BuildInput, delayMs?: number): void

  /** Cancel any in-flight or pending debounced build. */
  cancel(): void

  /** Idle (false) vs assembling (true). */
  readonly busy: boolean
}
