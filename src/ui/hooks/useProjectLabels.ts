import { useMemo } from "react";
import { reservedWords, scanFileLabels } from "@app/labels";
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
  return useMemo<Map<string, LabelInfo>>(() => {
    const out = new Map<string, LabelInfo>();
    const reserved = cpu && toolchain ? reservedWords(cpu, toolchain) : new Set<string>();
    if (files) {
      const dec = new TextDecoder();
      for (const f of files) {
        if (!/\.(a65|asm|inc|s|mac)$/i.test(f.path)) continue;
        scanFileLabels(dec.decode(f.content), basename(f.path), out, reserved);
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
  }, [files, labels, sourceMap, cpu, toolchain]);
}
