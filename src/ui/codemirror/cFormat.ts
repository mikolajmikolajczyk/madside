import type { EditorView } from "@codemirror/view";
import { loadWasmModule } from "@core/vfs";
import clangFormatWasmUrl from "@wasm-fmt/clang-format/clang-format.wasm?url";

// C/C++ formatting via clang-format compiled to wasm (`@wasm-fmt/clang-format`)
// — the same LLVM formatter VS Code's C/C++ extension ships, so output matches.
// The 2.3 MB module loads lazily on first format and is IDB-cached through the
// shared asset cache (same path as the cc65 toolchain wasm), so it's a one-time
// cost. Only the active buffer is formatted; nothing here touches the toolchain.

type FormatFn = (source: string, filename: string, style: string) => string;

// init() runs exactly once; the promise is memoised so concurrent saves share it.
let ready: Promise<FormatFn> | null = null;

function load(): Promise<FormatFn> {
  if (!ready) {
    ready = (async () => {
      const { initSync, format } = await import("@wasm-fmt/clang-format/web");
      // Feed the IDB-cached, pre-compiled module via initSync — keeps the 2.3 MB
      // download to once-ever across sessions. (initAsync would `compile()` its
      // arg, rejecting a Module; initSync takes a WebAssembly.Module directly.)
      const mod = await loadWasmModule(clangFormatWasmUrl);
      initSync(mod);
      return format;
    })();
    // Don't cache a rejected init — let the next format retry instead of failing
    // forever on a transient load error.
    ready.catch(() => { ready = null; });
  }
  return ready;
}

/** Format a C/C++ source string with clang-format. `filename` selects the
 *  language (`.c` / `.h` / `.cc` …); `style` is a preset name (`LLVM`, …) or
 *  raw `.clang-format` YAML. Fail-soft: any error (load failure, invalid style)
 *  returns the source unchanged so a save / build is never blocked. */
export async function formatC(source: string, filename: string, style: string): Promise<string> {
  try {
    const format = await load();
    return format(source, filename, style);
  } catch (e) {
    console.warn("[clang-format] formatting failed, leaving source unchanged:", e);
    return source;
  }
}

/** Kick off the lazy wasm load without formatting — call when a C file opens so
 *  the first Ctrl+S doesn't pay the download/compile latency. Best-effort. */
export function warmFormatter(): void {
  void load().catch(() => {});
}

/** Resolve the clang-format style for a project. A project `.clang-format` file
 *  wins outright (full clang-format parity). Otherwise an inline style based on
 *  the chosen preset (default `LLVM`) with the indent tied to `editor.tabWidth`
 *  (#59) so formatting and the editor's own indentation agree. */
export function resolveCStyle(
  clangFormatFile: string | undefined,
  preset: string | undefined,
  tabWidth: number,
): string {
  if (clangFormatFile && clangFormatFile.trim()) return clangFormatFile;
  const base = preset?.trim() || "LLVM";
  // InsertBraces wraps single-statement control-flow bodies (`if (x) y;` →
  // `if (x) { y; }`) — closes the "missing braces" gap on format.
  return `{BasedOnStyle: ${base}, IndentWidth: ${tabWidth}, TabWidth: ${tabWidth}, UseTab: Never, InsertBraces: true}`;
}

const C_FILE_RE = /\.(c|h|cc|cpp|hpp|cxx|hh)$/i;
/** Whether a filename is a C/C++ source clang-format should handle. */
export function isCFile(filename: string): boolean {
  return C_FILE_RE.test(filename);
}

/** Format an editor view's C/C++ document in place with clang-format, clamping
 *  the cursor (a reformat rewrites the whole doc). Returns `true` if the file is
 *  C/C++ (handled — even when already formatted), `false` otherwise so the caller
 *  can fall back to a non-C formatter. Shared by the editor's Format Document
 *  command and the app-level Save command. */
export async function formatCView(view: EditorView, filename: string, style: string): Promise<boolean> {
  if (!isCFile(filename)) return false;
  const src = view.state.doc.toString();
  const out = await formatC(src, filename, style);
  if (out !== src) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: out },
      selection: { anchor: Math.min(view.state.selection.main.head, out.length) },
    });
  }
  return true;
}
