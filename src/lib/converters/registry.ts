// Converter resolver: project `converters/*.js` shadow built-ins by meta.id.
// Project modules are loaded via Blob URL + dynamic import, cached by content hash.

import type { ConverterModule } from "./types";
import binToIncbin from "./builtins/binToIncbin";
import csvToData from "./builtins/csvToData";

const BUILTINS: ConverterModule[] = [binToIncbin, csvToData];

interface CachedProjectModule {
  hash: string;
  module: ConverterModule;
  url: string;
}
const projectCache = new Map<string, CachedProjectModule>();   // key: path

export interface ProjectConverterSource {
  path: string;             // e.g. "converters/png-to-sprite.js"
  content: string;
}

export async function buildRegistry(projectSources: ProjectConverterSource[]): Promise<Map<string, ConverterModule>> {
  const out = new Map<string, ConverterModule>();
  for (const b of BUILTINS) out.set(b.meta.id, b);

  for (const src of projectSources) {
    try {
      const mod = await loadProjectModule(src);
      if (mod) out.set(mod.meta.id, mod);   // shadow built-in if id matches
    } catch (e) {
      console.warn(`converter load failed: ${src.path}`, e);
    }
  }
  return out;
}

async function loadProjectModule(src: ProjectConverterSource): Promise<ConverterModule | null> {
  const hash = await contentHashHex(src.content);
  const cached = projectCache.get(src.path);
  if (cached && cached.hash === hash) return cached.module;
  if (cached) URL.revokeObjectURL(cached.url);

  const blob = new Blob([src.content], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  let mod: unknown;
  try {
    mod = await import(/* @vite-ignore */ url);
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  const m = mod as { meta?: unknown; default?: unknown };
  if (!m.meta || typeof m.default !== "function") {
    URL.revokeObjectURL(url);
    throw new Error(`module missing meta or default export`);
  }
  const finalModule = { meta: m.meta as ConverterModule["meta"], convert: m.default as ConverterModule["convert"] };
  projectCache.set(src.path, { hash, module: finalModule, url });
  return finalModule;
}

async function contentHashHex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const copy = new Uint8Array(bytes).buffer;
  const buf = await crypto.subtle.digest("SHA-256", copy);
  const arr = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, "0");
  return hex;
}

export function isBuiltin(id: string): boolean {
  return BUILTINS.some((b) => b.meta.id === id);
}

export function listBuiltins(): ConverterModule[] {
  return BUILTINS.slice();
}
