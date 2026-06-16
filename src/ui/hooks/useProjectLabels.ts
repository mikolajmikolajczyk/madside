import { useMemo, useRef } from "react";
import { reservedWords, scanFile } from "@app/labels";
import type { CpuLanguage, LabelInfo } from "@core";
import type { SourceMap, ToolchainLanguage } from "@ports";
import { basename } from "@core/path";

interface ProjectFile {
  path: string;
  content: Uint8Array;
}

/** Build the label index used by the editor's hover / goto-def. Merges
 *  two sources:
 *
 *   1. Every assembly file in the project — scanned for column-0
 *      declarations + doc comments + body preview.
 *   2. Toolchain-emitted labels Map (e.g. MADS `.lab`) — adds addresses
 *      and contributes address-only equates from atari.a65 etc.
 *
 *  Both passes write into the same `Map<name, LabelInfo>` so a label
 *  can have both source location and address attached. */
export function useProjectLabels(
  files: ProjectFile[] | null,
  labels: Map<string, number> | undefined,
  sourceMap: SourceMap | null,
  cpu: CpuLanguage | undefined,
  toolchain: ToolchainLanguage | undefined,
): Map<string, LabelInfo> {
  // Reserved-word set is stable per cpu/toolchain — recomputing it every
  // keystroke would invalidate the per-file cache below.
  const reserved = useMemo(
    () => (cpu && toolchain ? reservedWords(cpu, toolchain) : new Set<string>()),
    [cpu, toolchain],
  );
  // Per-file label scan cached by file *content* identity. Typing only changes
  // the active file's Uint8Array reference (store.ts maps a fresh object for it
  // and keeps the rest), so every other file hits the cache — the scan no longer
  // re-runs the whole project on each keystroke (#20). Reset when reserved swaps.
  const cacheRef = useRef<WeakMap<Uint8Array, Map<string, LabelInfo>>>(new WeakMap());
  const reservedRef = useRef(reserved);
  if (reservedRef.current !== reserved) {
    reservedRef.current = reserved;
    cacheRef.current = new WeakMap();
  }

  return useMemo<Map<string, LabelInfo>>(() => {
    const out = new Map<string, LabelInfo>();
    if (files) {
      const dec = new TextDecoder();
      for (const f of files) {
        if (!/\.(a65|asm|inc|s|mac)$/i.test(f.path)) continue;
        let fileLabels = cacheRef.current.get(f.content);
        if (!fileLabels) {
          fileLabels = scanFile(dec.decode(f.content), basename(f.path), reserved);
          cacheRef.current.set(f.content, fileLabels);
        }
        for (const [name, info] of fileLabels) if (!out.has(name)) out.set(name, info);
      }
    }
    if (labels) {
      for (const [name, addr] of labels) {
        const existing = out.get(name);
        if (existing) { existing.addr = addr; continue; }
        const info: LabelInfo = { addr };
        const loc = sourceMap?.addrToLoc.get(addr);
        if (loc) { info.file = loc.file; info.line = loc.line; }
        out.set(name, info);
      }
    }
    return out;
  }, [files, labels, sourceMap, reserved]);
}
