import { WASI, File, OpenFile, ConsoleStdout } from "@bjorn3/browser_wasi_shim";
import { createVfs, MemoryProvider, vfsToPreopen, readFromPreopen, loadWasmModule } from "@core/vfs";
// wasm blob lives in its own zero-dep workspace package (#92); the package's
// index re-exports the Vite-emitted, content-hashed URL.
import { clownassemblerWasmUrl } from "@madside/wasm-clownassembler";

export interface AssembleResult {
  ok: boolean;
  /** Flat M68k binary the assembler emits (`-o`). Absent on failure. */
  binary?: Uint8Array;
  /** Listing text (`-l`) — addresses + bytes + source; drives the label parse. */
  listing?: string;
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

/** Run clownassembler (custom frontend) over a virtual project FS and return the
 *  flat binary + listing. Mirrors the MADS runner (ADR-0008 VFS bridge). */
export async function assemble(
  mainPath: string,
  files: SourceFile[],
  extraArgs: string[] = [],
): Promise<AssembleResult> {
  const module = await loadWasmModule(clownassemblerWasmUrl);

  const base = mainPath.replace(/\.(asm|s|68k|i|x68)$/i, "");
  const outPath = `${base}.bin`;
  const lstPath = `${base}.lst`;

  const project = new MemoryProvider(
    files.map((f) => [f.path, typeof f.content === "string" ? encoder.encode(f.content) : f.content] as const),
  );
  const vfs = createVfs([{ prefix: "", provider: project, ro: false }]);
  const root = await vfsToPreopen(vfs, { outputs: [outPath, lstPath] });

  let stdout = "";
  let stderr = "";

  // Custom frontend: -i input, -o output (flat binary), -l listing.
  const args = ["clownassembler", "-i", mainPath, "-o", outPath, "-l", lstPath, ...extraArgs];

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

  const binary = readFromPreopen(root, outPath);
  const lstBytes = readFromPreopen(root, lstPath);
  const listing = lstBytes ? decoder.decode(lstBytes) : undefined;

  return {
    ok: exitCode === 0 && !!binary && binary.byteLength > 0,
    binary: binary && binary.byteLength > 0 ? binary : undefined,
    listing,
    stdout,
    stderr,
    exitCode,
  };
}
