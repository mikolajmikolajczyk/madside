// ToolchainPlugin contract (v0.5.0). Wraps an assembler / compiler so the
// workbench BuildService stays machine-agnostic. MADS ships as the first
// plugin; ca65 (NES, v1.0.0) and KickAssembler (C64) follow the same shape.

import type { SourceMap } from './source-map'

export interface ToolchainFile {
  /** POSIX path relative to project root. Same shape as ProjectFile but
   *  detached from storage — toolchain plugins don't care where bytes
   *  come from. */
  path: string
  content: Uint8Array
}

export interface ToolchainBuildInput {
  /** Project id — surfaced to the plugin for caching / diagnostics. */
  projectId: string
  /** Entry-point file the toolchain is asked to build. */
  main: string
  /** Every file the toolchain might need (sources, includes, generated
   *  asset overlays). Plugin filters by its inputExt itself. */
  files: ToolchainFile[]
  /** Free-form options forwarded from the project manifest. Schema lives in
   *  the toolchain plugin docs. */
  options?: Record<string, unknown>
}

export interface ToolchainBuildOutput {
  ok: boolean
  /** Compiled binary — xex / nes / prg / generic. Absent on failure. */
  binary?: Uint8Array
  stdout: string
  stderr: string
  /** Parsed source map — toolchains that emit a listing produce one here so
   *  BuildService can skip per-toolchain parsing. */
  sourceMap?: SourceMap
  /** Parsed label dump — `name → address`. Toolchain plugin owns the parse so
   *  the workbench never sees raw `.lab` / `.sym` text. */
  labels?: Map<string, number>
  /** Toolchain-specific extras passed through unchanged (raw listing text for
   *  editor download, etc.). */
  extras?: Record<string, unknown>
  /** Non-zero on failure. */
  exitCode: number
}

/** An editor snippet the toolchain offers in autocomplete. Template uses
 *  CodeMirror's `${n:placeholder}` syntax. */
export interface ToolchainSnippet {
  label: string
  detail: string
  template: string
}

/** Editor-language metadata for a toolchain (epic 78b12bf). Declarative + lib-
 *  agnostic so toolchain plugins don't depend on CodeMirror. The 6502 opcodes
 *  come from the machine's CPU (@core/cpu); this carries the assembler-specific
 *  vocabulary. The editor builds highlight/hover/autocomplete from the CPU
 *  opcodes + this. Optional — a toolchain without it falls back to plain text. */
export interface ToolchainLanguage {
  /** Assembler directives (uppercase, no leading prefix) — highlighted as
   *  directives + skipped by the label scanner. */
  readonly directives: readonly string[]
  /** Line-comment marker(s), e.g. ';' or [';', '//']. */
  readonly lineComment: string | readonly string[]
  /** Editor snippets offered in autocomplete. */
  readonly snippets?: readonly ToolchainSnippet[]
}

export interface ToolchainPlugin {
  readonly id: string
  readonly name: string
  /** Extensions (no dot, lowercase) the toolchain considers source files. */
  readonly inputExt: readonly string[]
  /** Optional editor-language metadata (directives, comments, snippets). The
   *  editor pairs this with the machine CPU's opcode set to drive highlight /
   *  hover / autocomplete. */
  readonly language?: ToolchainLanguage
  /** Output file extension the toolchain emits (no dot). Used by the asset
   *  pipeline + UI when guessing where the binary lands. */
  readonly outputExt: string
  /** Run the build. Plugin is responsible for cancellation handling if its
   *  internal pipeline is long-running. */
  build(input: ToolchainBuildInput): Promise<ToolchainBuildOutput>
}
