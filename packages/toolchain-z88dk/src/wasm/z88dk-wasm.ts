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
import { createVfs, MemoryProvider, ZipAssetProvider, vfsToPreopen, readFromPreopen, loadWasmModule, mkdirP, placeFile, readFile } from '@core/vfs'
import type { PreopenDirectory } from '@bjorn3/browser_wasi_shim'
import {
  z80asmWasmUrl,
  zccWasmUrl,
  zcppWasmUrl,
  zpragmaWasmUrl,
  sccz80WasmUrl,
  coptWasmUrl,
  appmakeWasmUrl,
} from '@madside/wasm-z88dk'
import zxSysrootZipUrl from '../zx-sysroot.zip?url'

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

// ---------------------------------------------------------------------------
// C path (#87): zcc drives ucpp → zpragma → sccz80 → copt → z80asm → appmake.
// zcc stays the driver; its system() is shimmed to an imported host `env.run`
// that runs each sub-tool wasm over ONE shared preopen tree (no fork, no crt0
// reverse-engineering). The dispatcher below is the production port of
// build-support/z88dk/c-path/dispatcher.reference.mjs. See #87.
// ---------------------------------------------------------------------------

// zcc emits absolute paths (/z88dk, /tmp); the sysroot is mounted at /z88dk and
// a single '/' preopen serves both absolute and (cwd=/) relative opens.
const C_DEFAULT_ORG = 0x8000 // z88dk +zx classic ORG; spec_crt0 entry sits here

const C_TOOLS: Record<string, string> = {
  'z88dk-ucpp': zcppWasmUrl,
  'z88dk-zpragma': zpragmaWasmUrl,
  'z88dk-sccz80': sccz80WasmUrl,
  'z88dk-copt': coptWasmUrl,
  'z88dk-z80asm': z80asmWasmUrl,
  'z88dk-appmake': appmakeWasmUrl,
}

// Collapse '.', '..', '//' in the path portion of a token — WASI rejects '..'
// and ucpp builds include paths like `-isystem .../config/../..//include`.
function normPathPart(tok: string): string {
  const i = tok.indexOf('/')
  if (i < 0) return tok
  const pre = tok.slice(0, i)
  const path = tok.slice(i)
  const abs = path.startsWith('/')
  const out: string[] = []
  for (const s of path.split('/')) {
    if (s === '' || s === '.') continue
    if (s === '..') out.pop()
    else out.push(s)
  }
  return pre + (abs ? '/' : '') + out.join('/')
}

interface ParsedCmd {
  args: string[]
  inF: string | null
  outF: string | null
  append: boolean
}

// Tokenise a shell-ish command: strip quotes within tokens, drop literal
// `(null)`, peel off `< > >>` redirections.
function parseCmd(cmd: string): ParsedCmd {
  const toks: string[] = []
  let cur = ''
  let q = false
  let has = false
  for (const ch of cmd) {
    if (ch === '"') { q = !q; has = true }
    else if (!q && /\s/.test(ch)) { if (has) { toks.push(cur); cur = ''; has = false } }
    else { cur += ch; has = true }
  }
  if (has) toks.push(cur)
  const t = toks.filter((x) => x !== '(null)')
  const args: string[] = []
  let inF: string | null = null
  let outF: string | null = null
  let append = false
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '<') inF = t[++i] ?? null
    else if (t[i] === '>') outF = t[++i] ?? null
    else if (t[i] === '>>') { outF = t[++i] ?? null; append = true }
    else args.push(t[i]!)
  }
  return { args: args.map(normPathPart), inF: inF && normPathPart(inF), outF: outF && normPathPart(outF), append }
}

/** Run one sub-tool synchronously over the shared root, wiring file-backed
 *  stdin/stdout for `< >`-redirected commands (zpragma, sccz80, copt). The tool's
 *  stderr (sccz80/z80asm diagnostics) is captured into `log` so the toolchain can
 *  parse + surface it; a non-redirected stdout is captured too. */
function runSubTool(
  module: WebAssembly.Module,
  root: PreopenDirectory,
  args: string[],
  inF: string | null,
  outF: string | null,
  log: string[],
): number {
  const stdin = new OpenFile(new File(inF ? (readFile(root.dir, inF) ?? new Uint8Array()) : new Uint8Array()))
  const outFile = outF ? new File(new Uint8Array()) : null
  let captured = ''
  const stdout = outFile ? new OpenFile(outFile) : ConsoleStdout.lineBuffered((m) => { captured += m + '\n' })
  const stderr = ConsoleStdout.lineBuffered((m) => { captured += m + '\n' })
  const wasi = new WASI(args, [], [stdin, stdout, stderr, root])
  let code: number
  try {
    code = wasi.start(new WebAssembly.Instance(module, { wasi_snapshot_preview1: wasi.wasiImport }) as unknown as {
      exports: { memory: WebAssembly.Memory; _start: () => unknown }
    }) as unknown as number
  } catch (e) {
    code = typeof e === 'object' && e !== null && 'code' in e ? (e as { code: number }).code : 1
  }
  if (outFile) placeFile(root.dir, outF!, outFile.data)
  if (captured.trim()) log.push(captured.trimEnd())
  return code ?? 0
}

/** Compile + link a C program for the ZX Spectrum with the z88dk C toolchain,
 *  then wrap the linked binary into a bootable 48K .sna. Project sources mount
 *  RW at the root; the bundled +zx sysroot mounts read-only at /z88dk. */
export async function buildZ88dkC(main: string, files: Z88dkFile[], opts: Z88dkOptions = {}): Promise<Z88dkBuildResult> {
  // The C link origin is fixed by spec_crt0 (+zx classic = 0x8000) — zcc owns it,
  // not the project. `opts.org` is an asm-path knob; honouring it here would wrap
  // the .sna at an address the linker didn't use. Wrap at the crt0 origin and
  // warn if a stale `org` is set so it isn't silently ignored.
  const org = C_DEFAULT_ORG
  const sp = opts.snaSp ?? DEFAULT_SNA_SP
  const log: string[] = []
  if (opts.org !== undefined && opts.org !== C_DEFAULT_ORG) {
    log.push(`[zcc] build.options.org (0x${opts.org.toString(16)}) ignored — the C runtime links at 0x${C_DEFAULT_ORG.toString(16)}`)
  }

  // Preload every module up front so env.run can run sub-tools synchronously
  // (zcc blocks inside system()).
  const [zccMod, ...toolMods] = await Promise.all([
    loadWasmModule(zccWasmUrl),
    ...Object.values(C_TOOLS).map((u) => loadWasmModule(u)),
  ])
  const toolModule: Record<string, WebAssembly.Module> = {}
  Object.keys(C_TOOLS).forEach((name, i) => { toolModule[name] = toolMods[i]! })

  const project = new MemoryProvider(
    files.map((f) => [f.path, typeof f.content === 'string' ? encoder.encode(f.content) : f.content] as const),
  )
  const sysroot = new ZipAssetProvider(zxSysrootZipUrl)
  const vfs = createVfs([
    { prefix: '', provider: project, ro: false },
    { prefix: 'z88dk', provider: sysroot, ro: true },
  ])
  // '/'-named preopen: zcc's absolute paths and cwd-relative opens both resolve.
  const root = await vfsToPreopen(vfs, { name: '/' })
  mkdirP(root.dir, ['tmp'])

  const outBase = stem(main).split('/').pop()!

  const zccRef: { inst?: { exports: { memory: WebAssembly.Memory } } } = {}
  const dispatch = (ptr: number): number => {
    const mem = new Uint8Array(zccRef.inst!.exports.memory.buffer)
    let end = ptr
    while (mem[end]) end++
    const cmd = new TextDecoder().decode(mem.slice(ptr, end))
    const { args, inF, outF, append } = parseCmd(cmd)
    const tool = args[0]
    if (tool === 'cat') {
      const src = readFile(root.dir, args[1]!) ?? new Uint8Array()
      const prev = (append && readFile(root.dir, outF!)) || new Uint8Array()
      const merged = new Uint8Array(prev.length + src.length)
      merged.set(prev); merged.set(src, prev.length)
      placeFile(root.dir, outF!, merged)
      return 0
    }
    if (tool === 'z88dk-copt') {
      // Peephole optimiser run as passthrough (unoptimised). The real copt.wasm
      // regresses on non-trivial sccz80 output: its regex peephole drops `i_N:`
      // label definitions while keeping the references, so z80asm fails the link
      // with `undefined symbol: i_2/i_4`. Passthrough is the known-good chain
      // that links + boots; re-enabling real copt is tracked separately (#87).
      if (inF && outF) placeFile(root.dir, outF, readFile(root.dir, inF) ?? new Uint8Array())
      return 0
    }
    const mod = tool ? toolModule[tool] : undefined
    if (!mod) {
      log.push(`[zcc] internal: no wasm for sub-tool '${tool ?? '(empty)'}' — ${cmd}`)
      return 127
    }
    return runSubTool(mod, root, args, inF, outF, log)
  }

  // zx.cfg's `default` clib links only -lzx_clib; the release zx_clib references
  // but doesn't bundle the z80 base + the ndos console driver (writebyte), so
  // stdio (printf) needs them added explicitly. The linker pulls only the
  // modules a program references, so no-stdio builds are unaffected.
  const wasi = new WASI(
    ['zcc', '+zx', '-create-app', '-lz80_clib', '-lndos', '-o', outBase, main],
    ['ZCCCFG=/z88dk/lib/config', 'TMPDIR=/tmp', 'HOME=/', 'PATH=/'],
    [
      new OpenFile(new File([])),
      ConsoleStdout.lineBuffered((m) => log.push(m)),
      ConsoleStdout.lineBuffered((m) => log.push(m)),
      root,
    ],
  )
  const zccInst = new WebAssembly.Instance(zccMod, {
    wasi_snapshot_preview1: wasi.wasiImport,
    env: { run: dispatch },
  }) as unknown as { exports: { memory: WebAssembly.Memory } }
  zccRef.inst = zccInst

  let exitCode: number
  try {
    exitCode = wasi.start(zccInst as unknown as { exports: { memory: WebAssembly.Memory; _start: () => unknown } }) as unknown as number
  } catch (e) {
    exitCode = typeof e === 'object' && e !== null && 'code' in e ? (e as { code: number }).code : 1
  }
  exitCode = exitCode ?? 0

  const diagLog = log.join('\n')
  const binary = readFromPreopen(root, outBase)
  if (exitCode !== 0 || !binary || binary.length === 0) {
    const why = log.length ? diagLog : `[zcc] C build failed (exit ${exitCode}) with no diagnostics`
    return { ok: false, stdout: '', stderr: why, exitCode: exitCode || 1 }
  }
  if (org + binary.length > 0x10000) {
    return {
      ok: false,
      stdout: '',
      stderr: `${diagLog}\n[zcc] linked binary (${binary.length} B @ 0x${org.toString(16)}) overflows 0x4000-0xFFFF`.trim(),
      exitCode: 1,
    }
  }
  // A successful build can still carry warnings — pass them through for diagnostics.
  return { ok: true, binary: buildSna48k(binary, org, sp), stdout: '', stderr: diagLog, exitCode: 0 }
}
