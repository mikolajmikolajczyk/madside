import { useMemo } from "react";
import { reservedWords, scanFile } from "@app/labels";
import type { CpuLanguage, LabelInfo } from "@core";
import type { SourceMap, ToolchainLanguage } from "@ports";
import { basename } from "@core/path";

interface ProjectFile {
  path: string;
  content: Uint8Array;
}

// Per-file scan cache, keyed first by the reserved-word set (stable per
// cpu/toolchain) then by file-content identity. Lives at module scope — not in a
// ref — so it persists across renders without a render-time ref access
// (Rules of React / React Compiler, #28). Both layers are WeakMaps, so an entry
// GCs once its Set or byte array is dropped; swapping cpu/toolchain naturally
// lands on a fresh inner map.
const scanCache = new WeakMap<ReadonlySet<string>, WeakMap<Uint8Array, Map<string, LabelInfo>>>();

function scanCached(content: Uint8Array, base: string, reserved: ReadonlySet<string>): Map<string, LabelInfo> {
  let inner = scanCache.get(reserved);
  if (!inner) { inner = new WeakMap(); scanCache.set(reserved, inner); }
  let labels = inner.get(content);
  if (!labels) {
    labels = scanFile(new TextDecoder().decode(content), base, reserved);
    inner.set(content, labels);
  }
  return labels;
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
  // Per-file label scan cached by file *content* identity (module-level
  // `scanCached`). Typing only changes the active file's Uint8Array reference
  // (store.ts maps a fresh object for it and keeps the rest), so every other file
  // hits the cache — the scan no longer re-runs the whole project on each
  // keystroke (#20).
  return useMemo<Map<string, LabelInfo>>(() => {
    const out = new Map<string, LabelInfo>();
    if (files) {
      for (const f of files) {
        if (!/\.(a65|asm|inc|s|mac)$/i.test(f.path)) continue;
        const fileLabels = scanCached(f.content, basename(f.path), reserved);
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
