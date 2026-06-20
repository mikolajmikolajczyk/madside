// z88dk toolchain in the browser: runs z80asm as a WASI command module over
// @bjorn3/browser_wasi_shim (mirrors cc65-wasm.ts). Asm-first:
//   *.asm --z80asm -b--> *.bin   then   *.bin --(JS)--> *.sna  (48K snapshot)
//
// Why a JS-built .sna rather than `appmake`:
//   - The chips zx core (emulator-zx-chips) has no tape API and its quickload is
//     a .z80 loader; it boots a 48K **.sna** (custom loadSNA). The machine's
//     media.detect fingerprints a .sna by its 49179-byte length, so run-service
//     resolves the format automatically.
//   - `appmake --sna` needs z88dk crt0/section metadata that a bare `z80asm -b`
//     binary doesn't carry (it drops the code), plus a prototype mounted in the
//     VFS. Building the .sna directly from the org'd binary sidesteps both and is
//     fully controlled. (appmake → .tap for real-hardware download is a follow-up.)
//
// KNOWN DEBT (this is a shortcut, tracked in #87): a bare `z80asm -b` + JS-built
// .sna only handles a single-org, crt0-less asm program. The "proper" path —
// z80asm with a crt0 + section/relocation link, then `appmake +zx` producing the
// .sna/.tap — needs the +zx sysroot (crt0 + libs + the appmake prototype) bundled
// as a zip, the same way cc65 ships <target>-sysroot.zip. That work lands with the
// C path (#87), which *requires* a real link anyway; this fast-path then becomes
// the legacy asm-only route. Keep new asm projects to a single `org` until then.

import { WASI, File, OpenFile, ConsoleStdout } from '@bjorn3/browser_wasi_shim'
import { createVfs, MemoryProvider, vfsToPreopen, readFromPreopen, loadWasmModule } from '@core/vfs'
import type { PreopenDirectory } from '@bjorn3/browser_wasi_shim'
import z80asmWasmUrl from './z80asm.wasm?url'

const encoder = new TextEncoder()

export interface Z88dkFile {
  /** POSIX path within the project root, no leading slash. */
  path: string
  content: string | Uint8Array
}

/** Per-project z88dk options (from `manifest.build.options`). */
export interface Z88dkOptions {
  /** Origin the program is assembled + loaded at (default 0x8000). */
  org?: number
  /** Stack pointer placed in the .sna; the entry PC is pushed here (default 0xFF00). */
  snaSp?: number
  /** Extra flags appended to the z80asm invocation. */
  z80asmArgs?: string[]
}

export interface Z88dkBuildResult {
  ok: boolean
  /** Bootable 48K .sna snapshot (absent on failure). */
  binary?: Uint8Array
  stdout: string
  stderr: string
  exitCode: number
}

interface RunResult {
  stdout: string
  stderr: string
  exitCode: number
}

async function runTool(module: WebAssembly.Module, root: PreopenDirectory, args: string[]): Promise<RunResult> {
  let stdout = ''
  let stderr = ''
  const wasi = new WASI(args, [], [
    new OpenFile(new File([])),
    ConsoleStdout.lineBuffered((m) => { stdout += m + '\n' }),
    ConsoleStdout.lineBuffered((m) => { stderr += m + '\n' }),
    root,
  ])
  const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport })
  let exitCode = 0
  try {
    wasi.start(instance as unknown as { exports: { memory: WebAssembly.Memory; _start: () => unknown } })
  } catch (e) {
    if (typeof e === 'object' && e !== null && 'code' in e) exitCode = (e as { code: number }).code
    else { stderr += `\n[runtime] ${String(e)}`; exitCode = 1 }
  }
  return { stdout, stderr, exitCode }
}

const stem = (path: string) => path.replace(/\.[^./]+$/, '')

const SNA_RAM = 0xc000 // 0x4000..0xFFFF
const SNA_SIZE = 27 + SNA_RAM

/** Build a 48K .sna from an org'd raw binary. Header carries a zeroed register
 *  file with SP set; the entry PC (= org) is pushed at SP so loadSNA pops it.
 *  Mirrors the hand-built snapshot the emulator smoke test validates. */
export function buildSna48k(binary: Uint8Array, org: number, sp: number): Uint8Array {
  const ram = new Uint8Array(SNA_RAM)
  // Place the binary at org (RAM starts at 0x4000).
  for (let i = 0; i < binary.length; i++) ram[org - 0x4000 + i] = binary[i]
  // Push the entry PC onto the stack: RAM[sp] = lo, RAM[sp+1] = hi.
  ram[sp - 0x4000] = org & 0xff
  ram[sp - 0x4000 + 1] = (org >> 8) & 0xff
  const sna = new Uint8Array(SNA_SIZE)
  sna[0] = 0x3f          // I (typical post-boot value)
  sna[23] = sp & 0xff    // SP lo
  sna[24] = (sp >> 8) & 0xff // SP hi
  sna[25] = 1            // interrupt mode 1
  sna[26] = 0            // border (program usually sets it via OUT (0xFE))
  sna.set(ram, 27)
  return sna
}

const DEFAULT_ORG = 0x8000
const DEFAULT_SNA_SP = 0xff00

/** Assemble `main` (+ its includes) with z80asm to a binary, then wrap it into a
 *  48K .sna at `opts.org`. Project `.asm`/`.inc` files are mounted RW; includes
 *  resolve relative to the including file (z80asm) and from the project root. */
export async function buildZ88dk(main: string, files: Z88dkFile[], opts: Z88dkOptions = {}): Promise<Z88dkBuildResult> {
  const org = opts.org ?? DEFAULT_ORG
  const sp = opts.snaSp ?? DEFAULT_SNA_SP
  const z80asmMod = await loadWasmModule(z80asmWasmUrl)

  const binPath = `${stem(main)}.bin`
  const objPath = `${stem(main)}.o`

  const project = new MemoryProvider(
    files.map((f) => [f.path, typeof f.content === 'string' ? encoder.encode(f.content) : f.content] as const),
  )
  const vfs = createVfs([{ prefix: '', provider: project, ro: false }])
  const root = await vfsToPreopen(vfs, { outputs: [binPath, objPath] })

  let stdout = ''
  let stderr = ''
  const r = await runTool(z80asmMod, root, ['z80asm', '-b', '-mz80', ...(opts.z80asmArgs ?? []), main])
  if (r.stdout.trim()) stdout += `[z80asm] ${r.stdout}`
  if (r.stderr.trim()) stderr += `[z80asm] ${r.stderr}`
  if (r.exitCode !== 0) return { ok: false, stdout, stderr, exitCode: r.exitCode }

  const binary = readFromPreopen(root, binPath)
  if (!binary || binary.length === 0) {
    return { ok: false, stdout, stderr: stderr + '\n[z88dk] no binary produced', exitCode: 1 }
  }
  if (org < 0x4000 || org + binary.length > 0x10000) {
    return {
      ok: false,
      stdout,
      stderr: stderr + `\n[z88dk] org 0x${org.toString(16)} + ${binary.length} bytes does not fit in 0x4000-0xFFFF RAM`,
      exitCode: 1,
    }
  }
  return { ok: true, binary: buildSna48k(binary, org, sp), stdout, stderr, exitCode: 0 }
}
