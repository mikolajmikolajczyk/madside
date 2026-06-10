// BuildService — wraps the toolchain pipeline. Today: MADS via
// @adapters/wasm-mads. M5: dispatches to whichever ToolchainPlugin the
// project manifest selects.

import type { BuildError, Result } from '../errors'

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
}

export interface BuildService {
  /** Assemble once. Returns Result; cancellation surfaces as Err(BuildError). */
  build(projectId: string, options?: BuildOptions): Promise<Result<BuildResult, BuildError>>

  /** Debounced rebuild — race-guard ensures only the latest assemble commits.
   *  Returns synchronously; subscribe to `build:done` events for results. */
  buildDebounced(projectId: string, delayMs?: number): void

  /** Cancel any in-flight or pending debounced build. */
  cancel(): void

  /** Idle (false) vs assembling (true). */
  readonly busy: boolean
}
