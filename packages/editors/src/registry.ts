// Editor resolver. Project `editors/*.js` shadow built-ins by meta.id; lookup
// happens by file extension via `manifest.editors` map.

import type { PluginLoader, PluginLoaderFactory, ProjectPluginSource } from "@ports";
import type { EditorModule } from "./types";
import bitmap from "./builtins/bitmap";

const BUILTINS: EditorModule[] = [bitmap];

export type ProjectEditorSource = ProjectPluginSource;

function validateEditorModule(mod: unknown): EditorModule {
  const m = mod as { meta?: unknown; default?: unknown };
  // Default export is the EditorModule (`{ mount }`) or a function returning one.
  const def = m.default as { mount?: unknown } | undefined;
  if (!m.meta || !def || typeof def.mount !== "function") {
    throw new Error(`editor module missing meta or default.mount`);
  }
  return {
    meta: m.meta as EditorModule["meta"],
    mount: def.mount as EditorModule["mount"],
  };
}

// Null until @app wires the factory (ADR-0002, #25) — the Blob-URL loader is an
// adapter; this plugin layer depends only on @ports.
let loader: PluginLoader<EditorModule> | null = null;
export function setEditorLoaderFactory(factory: PluginLoaderFactory): void {
  loader = factory(validateEditorModule);
}

export async function buildEditorRegistry(
  projectSources: ProjectEditorSource[],
): Promise<Map<string, EditorModule>> {
  const out = new Map<string, EditorModule>();
  for (const b of BUILTINS) out.set(b.meta.id, b);
  for (const src of projectSources) {
    if (!loader) {
      console.warn(`editor loader not wired; skipping ${src.path}`);
      continue;
    }
    try {
      const mod = await loader.load(src);
      out.set(mod.meta.id, mod);
    } catch (e) {
      console.warn(`editor load failed: ${src.path}`, e);
    }
  }
  return out;
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
    // Manifest holds a path like "editors/tilemap.js". Registry keys
    // are meta.id, so first try the raw value (a user may stick the id
    // there directly) then strip path + ".js" extension.
    if (registry.has(explicit)) return explicit;
    const base = explicit.replace(/^.*\//, "").replace(/\.js$/, "");
    if (registry.has(base)) return base;
  }
  for (const mod of registry.values()) {
    if (mod.meta.fileExt.includes(lc)) return mod.meta.id;
  }
  return null;
}
