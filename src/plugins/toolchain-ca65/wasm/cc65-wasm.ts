// cc65 toolchain in the browser: runs cc65 / ca65 / ld65 as WASI command
// modules over @bjorn3/browser_wasi_shim. The three tools share one in-memory
// filesystem so output flows between them:
//   *.c --cc65--> *.s --ca65--> *.o   then   *.o + nes.lib --ld65--> *.nes
//
// The filesystem is assembled by the VFS layer (ADR-0008): project sources as a
// MemoryProvider mount + the NES C runtime (nes.cfg, lib/nes.lib, cc65 headers)
// as a read-only ZipAssetProvider mount, materialised into the WASI preopen by
// the shared bridge. All built offline by `just build-cc65-wasm`.

import { WASI, File, OpenFile, ConsoleStdout } from "@bjorn3/browser_wasi_shim";
import { createVfs, MemoryProvider, ZipAssetProvider, vfsToPreopen, readFromPreopen, loadWasmModule } from "@core/vfs";
import type { PreopenDirectory } from "@bjorn3/browser_wasi_shim";
import cc65WasmUrl from "./cc65.wasm?url";
import ca65WasmUrl from "./ca65.wasm?url";
import ld65WasmUrl from "./ld65.wasm?url";
import nesSysrootZipUrl from "../nes-sysroot.zip?url";
import atariSysrootZipUrl from "../atari-sysroot.zip?url";

const encoder = new TextEncoder();

export interface Cc65File {
  /** POSIX path within the project root, no leading slash. */
  path: string;
  content: string | Uint8Array;
}

export interface Cc65BuildResult {
  ok: boolean;
  /** Linked iNES ROM (absent on failure). */
  binary?: Uint8Array;
  /** cc65 debug-info file (`ld65 --dbgfile`) for source-level debugging (#49).
   *  Parsed by the toolchain plugin into a SourceMap + labels. Absent on failure. */
  dbg?: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Per-target sysroot zips (cc65's bundled runtime + headers). Each provider is
// lazy + cached; only the target being built/browsed is fetched + unzipped.
// Shared between the build (mounted RO) and the file tree's system view (#50).
const SYSROOT_URL: Record<string, string> = {
  nes: nesSysrootZipUrl,
  atari: atariSysrootZipUrl,
};
const sysrootProviders = new Map<string, ZipAssetProvider>();

/** The read-only sysroot provider for a cc65 target, or undefined if unbundled. */
export function sysrootFor(target: string): ZipAssetProvider | undefined {
  const url = SYSROOT_URL[target];
  if (!url) return undefined;
  let p = sysrootProviders.get(target);
  if (!p) { p = new ZipAssetProvider(url); sysrootProviders.set(target, p); }
  return p;
}

// --- one WASI run of a tool over a shared preopen ----------------------------

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runTool(
  module: WebAssembly.Module,
  root: PreopenDirectory,
  args: string[],
): Promise<RunResult> {
  let stdout = "";
  let stderr = "";
  const wasi = new WASI(args, [], [
    new OpenFile(new File([])), // stdin
    ConsoleStdout.lineBuffered((m) => { stdout += m + "\n"; }),
    ConsoleStdout.lineBuffered((m) => { stderr += m + "\n"; }),
    root,
  ]);
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });
  let exitCode = 0;
  try {
    wasi.start(instance as unknown as { exports: { memory: WebAssembly.Memory; _start: () => unknown } });
  } catch (e) {
    if (typeof e === "object" && e !== null && "code" in e) {
      exitCode = (e as { code: number }).code;
    } else {
      stderr += `\n[runtime] ${String(e)}`;
      exitCode = 1;
    }
  }
  return { stdout, stderr, exitCode };
}

const stem = (path: string) => path.replace(/\.[^./]+$/, "");
const OUT_EXT: Record<string, string> = { nes: "nes", atari: "xex" };

/** Compile + assemble + link a cc65 project for `target` (cc65 platform id).
 *  `main`'s stem names the output; every `.c` is compiled with cc65, every
 *  `.c`/`.s`/`.asm` is assembled with ca65, then ld65 links the objects against
 *  `<target>.lib` using `<target>.cfg` from the bundled sysroot. */
export async function buildCc65(main: string, files: Cc65File[], target = "nes"): Promise<Cc65BuildResult> {
  const sysroot = sysrootFor(target);
  if (!sysroot) {
    return { ok: false, stdout: "", stderr: `cc65: no bundled sysroot for target '${target}'`, exitCode: 1 };
  }
  const [cc65Mod, ca65Mod, ld65Mod] = await Promise.all([
    loadWasmModule(cc65WasmUrl),
    loadWasmModule(ca65WasmUrl),
    loadWasmModule(ld65WasmUrl),
  ]);

  const sources = files.map((f) => f.path).filter((p) => /\.(c|s|asm)$/i.test(p));
  const cFiles = sources.filter((p) => /\.c$/i.test(p));
  const asmSources = new Set<string>(sources.filter((p) => /\.(s|asm)$/i.test(p)));
  for (const c of cFiles) asmSources.add(`${stem(c)}.s`);
  const objects = [...asmSources].map((s) => `${stem(s)}.o`);
  const outPath = `${stem(main)}.${OUT_EXT[target] ?? "bin"}`;
  const dbgPath = `${stem(main)}.dbg`;

  // Mount project sources (RW) over the read-only target sysroot, materialise
  // into the WASI preopen with the tool outputs pre-created so tools can open them.
  const project = new MemoryProvider(
    files.map((f) => [f.path, typeof f.content === "string" ? encoder.encode(f.content) : f.content] as const),
  );
  const vfs = createVfs([
    { prefix: "", provider: project, ro: false },
    { prefix: "", provider: sysroot, ro: true },
  ]);
  const root = await vfsToPreopen(vfs, {
    outputs: [...cFiles.map((c) => `${stem(c)}.s`), ...objects, outPath, dbgPath],
  });

  let stdout = "";
  let stderr = "";
  // ld65 wraps its messages in raw ANSI colour codes — strip so the OUTPUT panel
  // stays readable and the diagnostic parser sees clean text.
  // eslint-disable-next-line no-control-regex -- ESC is the literal we must match
  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
  const collect = (tool: string, r: RunResult) => {
    if (r.stdout.trim()) stdout += `[${tool}] ${stripAnsi(r.stdout)}`;
    if (r.stderr.trim()) stderr += `[${tool}] ${stripAnsi(r.stderr)}`;
    return r.exitCode;
  };

  // `-g` on cc65 + ca65 + `--dbgfile` on ld65 emit the debug info that drives
  // source-level debugging (#49): the .dbg carries C and asm line→address info.

  // 1. cc65: every .c → .s
  for (const src of cFiles) {
    const code = collect("cc65", await runTool(cc65Mod, root,
      ["cc65", "-g", "-O", "-t", target, "-I", "include", "-o", `${stem(src)}.s`, src]));
    if (code !== 0) return { ok: false, stdout, stderr, exitCode: code };
  }

  // 2. ca65: every .s (project + cc65-generated) → .o
  for (const src of asmSources) {
    const code = collect("ca65", await runTool(ca65Mod, root,
      ["ca65", "-g", "-t", target, "-I", "asminc", "-o", `${stem(src)}.o`, src]));
    if (code !== 0) return { ok: false, stdout, stderr, exitCode: code };
  }

  // 3. ld65: link objects + <target>.lib → output (+ debug-info file)
  const linkCode = collect("ld65", await runTool(ld65Mod, root,
    ["ld65", "-C", `${target}.cfg`, "--dbgfile", dbgPath, "-o", outPath, ...objects, `lib/${target}.lib`]));
  if (linkCode !== 0) return { ok: false, stdout, stderr, exitCode: linkCode };

  const binary = readFromPreopen(root, outPath);
  const dbgBytes = readFromPreopen(root, dbgPath);
  const dbg = dbgBytes ? new TextDecoder().decode(dbgBytes) : undefined;
  return { ok: !!binary, binary, dbg, stdout, stderr, exitCode: binary ? 0 : 1 };
}
