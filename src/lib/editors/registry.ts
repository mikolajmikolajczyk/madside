// Editor resolver. Project `editors/*.js` shadow built-ins by meta.id; lookup
// happens by file extension via `manifest.editors` map.

import type { EditorModule } from "./types";
import bitmap from "./builtins/bitmap";

const BUILTINS: EditorModule[] = [bitmap];

interface CachedProjectModule {
  hash: string;
  module: EditorModule;
  url: string;
}
const projectCache = new Map<string, CachedProjectModule>();   // key: path

export interface ProjectEditorSource {
  path: string;             // e.g. "editors/tilemap.js"
  content: string;
}

export async function buildEditorRegistry(
  projectSources: ProjectEditorSource[],
): Promise<Map<string, EditorModule>> {
  const out = new Map<string, EditorModule>();
  for (const b of BUILTINS) out.set(b.meta.id, b);
  for (const src of projectSources) {
    try {
      const mod = await loadProjectModule(src);
      if (mod) out.set(mod.meta.id, mod);
    } catch (e) {
      console.warn(`editor load failed: ${src.path}`, e);
    }
  }
  return out;
}

async function loadProjectModule(src: ProjectEditorSource): Promise<EditorModule | null> {
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
  // Default export is the EditorModule (`{ mount }`) or a function returning one.
  const def = m.default as { mount?: unknown } | undefined;
  if (!m.meta || !def || typeof def.mount !== "function") {
    URL.revokeObjectURL(url);
    throw new Error(`editor module missing meta or default.mount`);
  }
  const finalModule: EditorModule = {
    meta: m.meta as EditorModule["meta"],
    mount: def.mount as EditorModule["mount"],
  };
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

export function listBuiltinEditors(): EditorModule[] {
  return BUILTINS.slice();
}

/** Pick an editor for `ext` using the manifest mapping first, then falling
 *  back to any built-in whose `fileExt` lists the extension. Returns the
 *  module id to look up in the registry, or null when no match. */
export function resolveEditorId(
  registry: Map<string, EditorModule>,
  manifestEditors: Record<string, string> | undefined,
  ext: string,
): string | null {
  const lc = ext.toLowerCase();
  const explicit = manifestEditors?.[lc];
  if (explicit) {
    // Manifest holds a path like "editors/tilemap.js"; find the module whose
    // source path matches (loader keys by meta.id, so we search by path key
    // via a side-channel: store source path on meta? simpler — registry was
    // built from source list, but we already returned the module by id. Here
    // we accept either an id or a path; if it's a path we look up by id
    // stripped from the basename).
    if (registry.has(explicit)) return explicit;
    const base = explicit.replace(/^.*\//, "").replace(/\.js$/, "");
    if (registry.has(base)) return base;
  }
  for (const mod of registry.values()) {
    if (mod.meta.fileExt.includes(lc)) return mod.meta.id;
  }
  return null;
}
