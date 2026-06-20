import { useEffect } from "react";

interface ProjectFile {
  path: string;
  content: Uint8Array;
}

const dec = new TextDecoder();
const C_RE = /\.(c|h)$/i;

/** Keep the cc65-intel LSP worker's open-document set in sync with the
 *  project's `.c`/`.h` files (#70). The editor only ever holds the focused
 *  buffer, but cross-file resolution needs every translation unit open — so the
 *  app, which owns all files, drives the sync. Lazy-imports the LSP client so a
 *  C-free project never spawns the worker; re-runs when `files` change (the
 *  store rebuilds the array on every edit, so the active buffer stays live).
 *
 *  Resolves + feeds the sysroot headers BEFORE the first sync: this path can
 *  win the race to spawn (and `initialize`) the worker over the editor's own
 *  language-pack load, so it must seed the same stdlib/register headers — else
 *  the server inits with an empty sysroot and stdlib completion goes dark. */
export function useProjectCDocuments(files: ProjectFile[] | null, machine?: string): void {
  useEffect(() => {
    const cFiles = (files ?? []).filter((f) => C_RE.test(f.path));
    if (cFiles.length === 0) return;
    let cancelled = false;
    void (async () => {
      const [{ setSysrootHeaders, setDefines, syncProjectDocs }, { cc65SysrootHeaders, cc65TargetDefines }] = await Promise.all([
        import("../codemirror/lsp/client"),
        import("@app/cSysroot"),
      ]);
      if (cancelled) return;
      setDefines(cc65TargetDefines(machine));
      setSysrootHeaders(await cc65SysrootHeaders(machine));
      if (cancelled) return;
      await syncProjectDocs(cFiles.map((f) => ({ path: f.path, text: dec.decode(f.content) })));
    })();
    return () => {
      cancelled = true;
    };
  }, [files, machine]);
}
