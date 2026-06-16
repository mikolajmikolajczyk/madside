// Converter resolver: project `converters/*.js` shadow built-ins by meta.id.
// Project modules are loaded via Blob URL + dynamic import, cached by content
// hash — by the loader @app injects (ADR-0002, #25), so this plugin layer
// depends only on @ports, never on @adapters.

import type { PluginLoader, PluginLoaderFactory, ProjectPluginSource } from "@ports";
import type { ConverterModule } from "./types";
import binToIncbin from "./builtins/binToIncbin";
import csvToData from "./builtins/csvToData";

const BUILTINS: ConverterModule[] = [binToIncbin, csvToData];

export type ProjectConverterSource = ProjectPluginSource;

function validateConverterModule(mod: unknown): ConverterModule {
  const m = mod as { meta?: unknown; default?: unknown };
  if (!m.meta || typeof m.default !== "function") {
    throw new Error(`module missing meta or default export`);
  }
  return {
    meta: m.meta as ConverterModule["meta"],
    convert: m.default as ConverterModule["convert"],
  };
}

// Null until @app wires the factory. Built-ins never need it; project
// converters are skipped (with a warning) if a build runs before wiring.
let loader: PluginLoader<ConverterModule> | null = null;
export function setConverterLoaderFactory(factory: PluginLoaderFactory): void {
  loader = factory(validateConverterModule);
}

export async function buildRegistry(projectSources: ProjectConverterSource[]): Promise<Map<string, ConverterModule>> {
  const out = new Map<string, ConverterModule>();
  for (const b of BUILTINS) out.set(b.meta.id, b);
  for (const src of projectSources) {
    if (!loader) {
      console.warn(`converter loader not wired; skipping ${src.path}`);
      continue;
    }
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
