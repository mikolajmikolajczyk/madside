// ToolchainPlugin contract (v0.5.0). Wraps an assembler / compiler so the
// workbench BuildService stays machine-agnostic. MADS ships as the first
// plugin; ca65 (NES, v1.0.0) and KickAssembler (C64) follow the same shape.

import type { SourceMap } from './source-map'
import type { BuildDiagnostic } from './diagnostics'
import type { PluginBase } from './plugin-registry'
import type { VfsProvider } from '@core/vfs'

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
  /** Active machine id (`manifest.machine`). A multi-target toolchain (cc65)
   *  maps it to its compiler target + the matching sysroot. */
  machine?: string
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
  /** Parsed error/warning locations (#29). Present on success too (warnings).
   *  Toolchain plugin parses its own diagnostic format. */
  diagnostics?: BuildDiagnostic[]
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

/** A C library symbol a toolchain offers for autocomplete + hover in C sources
 *  (cc65's conio / stdlib). Declarative — no CodeMirror dependency. */
export interface ToolchainCSymbol {
  /** Identifier as typed, e.g. `cputs`. */
  readonly label: string
  /** One-line signature shown alongside the completion, e.g. `void cputs(const char*)`. */
  readonly detail?: string
  /** Longer hover/info text. */
  readonly info?: string
  /** Header that declares the symbol, e.g. `conio.h`. Surfaced in the
   *  completion/hover and auto-`#include`d when the completion is accepted (#48)
   *  so the user learns where the symbol comes from. */
  readonly header?: string
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
  /** C library symbols offered for autocomplete + hover in `.c`/`.h` sources
   *  (cc65 conio + stdlib). Drives the C editor completion (#48). */
  readonly cSymbols?: readonly ToolchainCSymbol[]
}

export interface ToolchainPlugin extends PluginBase {
  readonly kind: 'toolchain'
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
  /** Optional read-only sysroot the toolchain mounts at build time — its bundled
   *  runtime/headers (cc65 ships `include/`, `lib/<target>.lib`, the linker cfg).
   *  Exposed so the same provider drives both the build and the file tree's
   *  read-only "system" view (ADR-0008, #50). `machine` selects the target's
   *  sysroot for a multi-target toolchain. Absent ⇒ no bundled sysroot (MADS). */
  sysroot?(machine?: string): VfsProvider | undefined
}
