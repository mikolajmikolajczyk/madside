// BuildService — wraps the toolchain pipeline. Today: MADS via
// @adapters/wasm-mads. M5: dispatches to whichever ToolchainPlugin the
// project manifest selects.

import type { BuildError, Result } from '../errors'
import type { Project } from '../project-repository'

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
  /** Listing file content (used to build the source map). */
  listing?: string
  /** Labels dump — `name → address`. */
  labels?: Map<string, number>
  /** Toolchain-specific extras the UI / source-map layer wants. */
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
