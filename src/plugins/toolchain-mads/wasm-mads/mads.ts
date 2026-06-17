import { WASI, File, OpenFile, ConsoleStdout } from "@bjorn3/browser_wasi_shim";
import { createVfs, MemoryProvider, vfsToPreopen, readFromPreopen } from "@core/vfs";
// Plugin-owned wasm asset — Vite content-hashes the URL (cache-busting) and
// tracks it at build time, same as the Altirra core. Mirrors @adapters/emu's
// `?url` import; this plugin just owns its binary instead of an adapter.
import madsWasmUrl from "./mads.wasm?url";

export interface AssembleResult {
  ok: boolean;
  xex?: Uint8Array;
  lst?: string;
  lab?: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export interface SourceFile {
  /** POSIX path within the project root, no leading slash. */
  path: string;
  content: string | Uint8Array;
}

let madsModulePromise: Promise<WebAssembly.Module> | null = null;

function loadMadsModule(): Promise<WebAssembly.Module> {
  if (!madsModulePromise) {
    madsModulePromise = fetch(madsWasmUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`fetch mads.wasm: ${r.status}`);
        return WebAssembly.compileStreaming(r);
      });
  }
  return madsModulePromise;
}

export async function assemble(
  mainPath: string,
  files: SourceFile[],
  extraArgs: string[] = []
): Promise<AssembleResult> {
  const module = await loadMadsModule();

  const base = mainPath.replace(/\.(a65|asm)$/i, "");
  const outPath = `${base}.xex`;
  const lstPath = `${base}.lst`;
  const labPath = `${base}.lab`;

  // Project sources as a single writable mount, materialised into the WASI
  // preopen by the shared VFS bridge (ADR-0008) with the output files
  // pre-created so MADS can open them.
  const project = new MemoryProvider(
    files.map((f) => [f.path, typeof f.content === "string" ? encoder.encode(f.content) : f.content] as const),
  );
  const vfs = createVfs([{ prefix: "", provider: project, ro: false }]);
  const root = await vfsToPreopen(vfs, { outputs: [outPath, lstPath, labPath] });

  let stdout = "";
  let stderr = "";

  const args = ["mads", mainPath, `-o:${outPath}`, `-l:${lstPath}`, `-t:${labPath}`, ...extraArgs];

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
    // WASI shim throws on proc_exit; extract code if numeric.
    if (typeof e === "object" && e !== null && "code" in e) {
      exitCode = (e as { code: number }).code;
    } else {
      stderr += `\n[runtime] ${String(e)}`;
      exitCode = 1;
    }
  }

  const xex = readFromPreopen(root, outPath);
  const lstBytes = readFromPreopen(root, lstPath);
  const labBytes = readFromPreopen(root, labPath);
  const lst = lstBytes ? decoder.decode(lstBytes) : undefined;
  const lab = labBytes ? decoder.decode(labBytes) : undefined;

  return {
    ok: exitCode === 0 && !!xex,
    xex,
    lst,
    lab,
    stdout,
    stderr,
    exitCode,
  };
}
