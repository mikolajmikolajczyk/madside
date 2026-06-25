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
 *  The single worker hosts ONE dialect, but a project can mix dialects (a Genesis
 *  project pairs M68k `.asm` with a z80 `.s80` driver). So the dialect follows the
 *  ACTIVE file, and only same-dialect sources are synced — syncing a `.s80` to an
 *  M68k worker (or vice versa) would flag the other CPU's registers as undefined
 *  symbols. Files of the other dialect keep the diagnostics they got while active.
 *
 *  No-ops when the active file has no asm dialect or the project has no matching
 *  asm sources, so a non-asm project never spawns the worker. Selects the dialect
 *  before the sync (switching dialect respawns the worker, so the open set must
 *  be re-seeded on the new connection). */
export function useProjectAsmDocuments(files: ProjectFile[] | null, toolchainId?: string, activePath?: string): void {
  useEffect(() => {
    // The dialect of the focused file (a `.s80` is always z80 — #147). Fall back
    // to the toolchain dialect when the active file isn't asm (e.g. project.json).
    const dialect = asmDialectFor(toolchainId, activePath) ?? asmDialectFor(toolchainId);
    if (!dialect) return;
    const asmFiles = (files ?? []).filter(
      (f) => ASM_RE.test(f.path) && asmDialectFor(toolchainId, f.path) === dialect,
    );
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
  }, [files, toolchainId, activePath]);
}
