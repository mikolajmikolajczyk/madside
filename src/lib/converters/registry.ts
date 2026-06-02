// Converter resolver: project `converters/*.js` shadow built-ins by meta.id.
// Project modules are loaded via Blob URL + dynamic import, cached by content hash.

import { createPluginLoader, type PluginSource } from "../util/pluginLoader";
import type { ConverterModule } from "./types";
import binToIncbin from "./builtins/binToIncbin";
import csvToData from "./builtins/csvToData";

const BUILTINS: ConverterModule[] = [binToIncbin, csvToData];

export type ProjectConverterSource = PluginSource;

const loader = createPluginLoader<ConverterModule>((mod) => {
  const m = mod as { meta?: unknown; default?: unknown };
  if (!m.meta || typeof m.default !== "function") {
    throw new Error(`module missing meta or default export`);
  }
  return {
    meta: m.meta as ConverterModule["meta"],
    convert: m.default as ConverterModule["convert"],
  };
});

export async function buildRegistry(projectSources: ProjectConverterSource[]): Promise<Map<string, ConverterModule>> {
  const out = new Map<string, ConverterModule>();
  for (const b of BUILTINS) out.set(b.meta.id, b);
  for (const src of projectSources) {
    try {
      const mod = await loader.load(src);
      out.set(mod.meta.id, mod);   // shadow built-in if id matches
    } catch (e) {
      console.warn(`converter load failed: ${src.path}`, e);
    }
  }
  return out;
}

export function isBuiltin(id: string): boolean {
  return BUILTINS.some((b) => b.meta.id === id);
}

export function listBuiltins(): ConverterModule[] {
  return BUILTINS.slice();
}
