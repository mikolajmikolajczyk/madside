import { useEffect } from "react";
import { classifyAsmDialects } from "@app/asmLsp";

interface ProjectFile {
  path: string;
  content: Uint8Array;
}

const dec = new TextDecoder();
const ASM_RE = /\.(asm|a65|s|s80|z80|inc|mac)$/i;

/** Keep the assembly language servers' open-document sets in sync with the
 *  project's asm sources (#140) — the editor only holds the focused buffer, but
 *  cross-file label/equate resolution (go-to-definition, references, rename)
 *  needs every source open. The app owns all files, so it drives the sync.
 *
 *  Mixed-dialect aware (#148): a project can pair M68k `.asm` with a z80 `.s80`
 *  driver. Each file is classified to its dialect(s) — anchors by extension,
 *  includes inherit from their includers — and synced to that dialect's worker.
 *  A worker per dialect means no respawn/thrash on tab switch and no wrong-dialect
 *  analysis; a shared include lands in each dialect that uses it, with its owner
 *  dialect publishing the diagnostics. No-ops for a non-asm project (no worker
 *  ever spawns). */
export function useProjectAsmDocuments(files: ProjectFile[] | null, toolchainId?: string): void {
  useEffect(() => {
    const asmFiles = (files ?? []).filter((f) => ASM_RE.test(f.path));
    if (asmFiles.length === 0) return;
    const decoded = asmFiles.map((f) => ({ path: f.path, text: dec.decode(f.content) }));
    const byPath = classifyAsmDialects(decoded, toolchainId);
    if (byPath.size === 0) return;
    // Invert path→dialects into per-dialect {files, owned} for syncAsmDocs.
    const textOf = new Map(decoded.map((d) => [d.path, d.text]));
    const perDialect = new Map<string, { files: { path: string; text: string }[]; owned: string[] }>();
    for (const [path, { dialects, owner }] of byPath) {
      for (const d of dialects) {
        let e = perDialect.get(d);
        if (!e) { e = { files: [], owned: [] }; perDialect.set(d, e); }
        e.files.push({ path, text: textOf.get(path)! });
        if (d === owner) e.owned.push(path);
      }
    }
    let cancelled = false;
    void (async () => {
      const { syncAsmDocs } = await import("../codemirror/lsp/asm-client");
      if (cancelled) return;
      await syncAsmDocs([...perDialect].map(([dialect, e]) => ({ dialect, ...e })));
    })();
    return () => { cancelled = true; };
  }, [files, toolchainId]);
}
