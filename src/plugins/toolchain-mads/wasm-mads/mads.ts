import {
  WASI,
  File,
  Directory,
  OpenFile,
  PreopenDirectory,
  ConsoleStdout,
  type Inode,
} from "@bjorn3/browser_wasi_shim";

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

export interface SourceFile {
  /** POSIX path within the project root, no leading slash. */
  path: string;
  content: string | Uint8Array;
}

let madsModulePromise: Promise<WebAssembly.Module> | null = null;

function loadMadsModule(): Promise<WebAssembly.Module> {
  if (!madsModulePromise) {
    madsModulePromise = fetch("/wasm/mads.wasm")
      .then((r) => {
        if (!r.ok) throw new Error(`fetch mads.wasm: ${r.status}`);
        return WebAssembly.compileStreaming(r);
      });
  }
  return madsModulePromise;
}

const encoder = new TextEncoder();

// Split a POSIX path into non-empty segments. Empty path → []; trailing /
// stripped. Shared by placeFile + readFile.
function splitPath(path: string): string[] {
  return path.split("/").filter((p) => p.length > 0);
}

// Walk dirs, creating Directory inodes on the way. Returns the deepest dir.
function mkdirP(root: Directory, dirs: string[]): Directory {
  return dirs.reduce((dir, name) => {
    const existing = dir.contents.get(name);
    if (existing instanceof Directory) return existing;
    const next = new Directory(new Map<string, Inode>());
    dir.contents.set(name, next);
    return next;
  }, root);
}

// Walk dirs without creating. Returns undefined when any segment is missing
// or shadowed by a non-Directory inode.
function resolveDir(root: Directory, dirs: string[]): Directory | undefined {
  let dir = root;
  for (const name of dirs) {
    const next = dir.contents.get(name);
    if (!(next instanceof Directory)) return undefined;
    dir = next;
  }
  return dir;
}

// Insert a file at a POSIX-style path into a Directory tree, creating subdirs as needed.
function placeFile(root: Directory, path: string, data: Uint8Array) {
  const parts = splitPath(path);
  if (parts.length === 0) return;
  const dir = mkdirP(root, parts.slice(0, -1));
  dir.contents.set(parts[parts.length - 1]!, new File(data));
}

// Read a file by POSIX path from the Directory tree. Returns undefined if missing.
function readFile(root: Directory, path: string): Uint8Array | undefined {
  const parts = splitPath(path);
  if (parts.length === 0) return undefined;
  const dir = resolveDir(root, parts.slice(0, -1));
  const leaf = dir?.contents.get(parts[parts.length - 1]!);
  if (!(leaf instanceof File) || leaf.data.length === 0) return undefined;
  return leaf.data;
}

export async function assemble(
  mainPath: string,
  files: SourceFile[],
  extraArgs: string[] = []
): Promise<AssembleResult> {
  const module = await loadMadsModule();

  const root = new PreopenDirectory(".", new Map<string, Inode>());
  for (const f of files) {
    const data = typeof f.content === "string" ? encoder.encode(f.content) : f.content;
    placeFile(root.dir, f.path, data);
  }
  // Output placeholders next to main.
  const base = mainPath.replace(/\.(a65|asm)$/i, "");
  const outPath = `${base}.xex`;
  const lstPath = `${base}.lst`;
  const labPath = `${base}.lab`;
  placeFile(root.dir, outPath, new Uint8Array());
  placeFile(root.dir, lstPath, new Uint8Array());
  placeFile(root.dir, labPath, new Uint8Array());

  let stdout = "";
  let stderr = "";

  const args = ["mads", mainPath, `-o:${outPath}`, `-l:${lstPath}`, `-t:${labPath}`, ...extraArgs];
  const env: string[] = [];

  const wasi = new WASI(args, env, [
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

  const xexBytes = readFile(root.dir, outPath);
  const xex = xexBytes ? xexBytes.slice() : undefined;
  const lstBytes = readFile(root.dir, lstPath);
  const labBytes = readFile(root.dir, labPath);
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
