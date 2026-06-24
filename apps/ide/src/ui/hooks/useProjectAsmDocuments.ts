import { useEffect } from "react";
import { asmDialectFor } from "@app/asmLsp";

interface ProjectFile {
  path: string;
  content: Uint8Array;
}

const dec = new TextDecoder();
const ASM_RE = /\.(asm|a65|s|s80|z80|inc|mac)$/i;

/** Keep the assembly language server worker's open-document set in sync with the
 *  project's asm sources (#140) — the editor only holds the focused buffer, but
 *  cross-file label/equate resolution (go-to-definition, references, rename)
 *  needs every source open. The app owns all files, so it drives the sync.
 *
 *  No-ops when the toolchain has no asm dialect (e.g. clownassembler / M68k) or
 *  the project has no asm sources, so a non-asm project never spawns the worker.
 *  Selects the dialect before the sync (switching dialect respawns the worker,
 *  so the open set must be re-seeded on the new connection). */
export function useProjectAsmDocuments(files: ProjectFile[] | null, toolchainId?: string): void {
  useEffect(() => {
    const dialect = asmDialectFor(toolchainId);
    if (!dialect) return;
    const asmFiles = (files ?? []).filter((f) => ASM_RE.test(f.path));
    if (asmFiles.length === 0) return;
    let cancelled = false;
    void (async () => {
      const { setAsmDialect, syncAsmDocs } = await import("../codemirror/lsp/asm-client");
      if (cancelled) return;
      setAsmDialect(dialect);
      await syncAsmDocs(asmFiles.map((f) => ({ path: f.path, text: dec.decode(f.content) })));
    })();
    return () => {
      cancelled = true;
    };
  }, [files, toolchainId]);
}
