// cc65 toolchain in the browser: runs cc65 / ca65 / ld65 as WASI command
// modules over @bjorn3/browser_wasi_shim, the same shim the MADS plugin uses.
//
// The three tools share one in-memory filesystem so output flows between them:
//   *.c --cc65--> *.s --ca65--> *.o   then   *.o + nes.lib --ld65--> *.nes
//
// The NES C runtime (nes.cfg, lib/nes.lib, the cc65 include + asminc trees) is
// shipped as a zip asset (`../nes-sysroot.zip`) and unpacked into the FS on
// every build. All built offline by `just build-cc65-wasm`.

import {
  WASI,
  File,
  Directory,
  OpenFile,
  PreopenDirectory,
  ConsoleStdout,
  type Inode,
} from "@bjorn3/browser_wasi_shim";
import { unzipSync } from "fflate";
import cc65WasmUrl from "./cc65.wasm?url";
import ca65WasmUrl from "./ca65.wasm?url";
import ld65WasmUrl from "./ld65.wasm?url";
import sysrootZipUrl from "../nes-sysroot.zip?url";

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
  stdout: string;
  stderr: string;
  exitCode: number;
}

// --- lazy asset loading (compiled once, reused across builds) ----------------

const moduleCache = new Map<string, Promise<WebAssembly.Module>>();
function loadModule(url: string): Promise<WebAssembly.Module> {
  let p = moduleCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
      return WebAssembly.compileStreaming(r);
    });
    moduleCache.set(url, p);
  }
  return p;
}

let sysrootPromise: Promise<Record<string, Uint8Array>> | null = null;
function loadSysroot(): Promise<Record<string, Uint8Array>> {
  if (!sysrootPromise) {
    sysrootPromise = fetch(sysrootZipUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`fetch nes-sysroot.zip: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => unzipSync(new Uint8Array(buf)));
  }
  return sysrootPromise;
}

// --- in-memory FS helpers (mirrors the MADS loader) --------------------------

const segs = (path: string) => path.split("/").filter((p) => p.length > 0);

function mkdirP(root: Directory, dirs: string[]): Directory {
  return dirs.reduce((dir, name) => {
    const existing = dir.contents.get(name);
    if (existing instanceof Directory) return existing;
    const next = new Directory(new Map<string, Inode>());
    dir.contents.set(name, next);
    return next;
  }, root);
}

function placeFile(root: Directory, path: string, data: Uint8Array) {
  const parts = segs(path);
  if (parts.length === 0) return;
  const dir = mkdirP(root, parts.slice(0, -1));
  dir.contents.set(parts[parts.length - 1]!, new File(data));
}

function readFile(root: Directory, path: string): Uint8Array | undefined {
  const parts = segs(path);
  let dir: Directory = root;
  for (const name of parts.slice(0, -1)) {
    const next = dir.contents.get(name);
    if (!(next instanceof Directory)) return undefined;
    dir = next;
  }
  const leaf = dir.contents.get(parts[parts.length - 1]!);
  return leaf instanceof File && leaf.data.length > 0 ? leaf.data : undefined;
}

// --- one WASI run of a tool over a shared FS ---------------------------------

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

const TARGET = "nes";
const stem = (path: string) => path.replace(/\.[^./]+$/, "");

/** Compile + assemble + link a cc65 project into an iNES ROM. `main` selects the
 *  entry source (its stem names the output); every `.c` is compiled with cc65,
 *  every `.c`/`.s`/`.asm` is assembled with ca65, then ld65 links the objects
 *  against `nes.lib` using `nes.cfg`. */
export async function buildCc65(main: string, files: Cc65File[]): Promise<Cc65BuildResult> {
  const [cc65Mod, ca65Mod, ld65Mod, sysroot] = await Promise.all([
    loadModule(cc65WasmUrl),
    loadModule(ca65WasmUrl),
    loadModule(ld65WasmUrl),
    loadSysroot(),
  ]);

  const root = new PreopenDirectory(".", new Map<string, Inode>());
  // Mount the NES sysroot (nes.cfg, lib/nes.lib, include/**, asminc/**).
  for (const [path, data] of Object.entries(sysroot)) placeFile(root.dir, path, data);
  // Mount the project sources.
  for (const f of files) {
    placeFile(root.dir, f.path, typeof f.content === "string" ? encoder.encode(f.content) : f.content);
  }

  let stdout = "";
  let stderr = "";
  const collect = (tool: string, r: RunResult) => {
    if (r.stdout.trim()) stdout += `[${tool}] ${r.stdout}`;
    if (r.stderr.trim()) stderr += `[${tool}] ${r.stderr}`;
    return r.exitCode;
  };

  const sources = files.map((f) => f.path).filter((p) => /\.(c|s|asm)$/i.test(p));
  const objects: string[] = [];

  // 1. cc65: every .c → .s
  for (const src of sources.filter((p) => /\.c$/i.test(p))) {
    const out = `${stem(src)}.s`;
    placeFile(root.dir, out, new Uint8Array());
    const code = collect("cc65", await runTool(cc65Mod, root,
      ["cc65", "-O", "-t", TARGET, "-I", "include", "-o", out, src]));
    if (code !== 0) return { ok: false, stdout, stderr, exitCode: code };
  }

  // 2. ca65: every .s (project + cc65-generated) → .o
  const asmSources = new Set<string>(sources.filter((p) => /\.(s|asm)$/i.test(p)));
  for (const src of sources.filter((p) => /\.c$/i.test(p))) asmSources.add(`${stem(src)}.s`);
  for (const src of asmSources) {
    const out = `${stem(src)}.o`;
    placeFile(root.dir, out, new Uint8Array());
    const code = collect("ca65", await runTool(ca65Mod, root,
      ["ca65", "-t", TARGET, "-I", "asminc", "-o", out, src]));
    if (code !== 0) return { ok: false, stdout, stderr, exitCode: code };
    objects.push(out);
  }

  // 3. ld65: link objects + nes.lib → .nes
  const outPath = `${stem(main)}.nes`;
  placeFile(root.dir, outPath, new Uint8Array());
  const linkCode = collect("ld65", await runTool(ld65Mod, root,
    ["ld65", "-C", "nes.cfg", "-o", outPath, ...objects, "lib/nes.lib"]));
  if (linkCode !== 0) return { ok: false, stdout, stderr, exitCode: linkCode };

  const binary = readFile(root.dir, outPath)?.slice();
  return { ok: !!binary, binary, stdout, stderr, exitCode: binary ? 0 : 1 };
}
