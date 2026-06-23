import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { buildEditorRegistry, partitionPlugins, resolveEditorId, subscribeTrustedPlugins, trustedPluginsSnapshot } from "@app";
import type { EditorModule } from "@ports";
import { extOf } from "@core/path";

interface ProjectFile {
  path: string;
  content: Uint8Array;
}

interface Args {
  /** All project files; we filter to `editors/*.js` ourselves. Null
   *  means project not yet loaded. */
  files: ProjectFile[] | null;
  /** Currently focused file's path — drives module resolution. */
  activePath: string | null;
  /** Manifest's optional ext → path mapping. */
  manifestEditors: Record<string, string> | undefined;
}

interface UsePluginEditorResult {
  /** Editor matching the active file's extension, or null when no
   *  plugin claims it (host falls back to AssetPanel / code editor). */
  activeModule: EditorModule | null;
  /** Snapshot of every project file *other than* the active one,
   *  passed read-only into the plugin's `mount(ctx)`. */
  assets: { path: string; bytes: Uint8Array }[];
}

/** Build a project-local plugin editor registry from `editors/*.js`
 *  sources and resolve the editor matching the active file's extension.
 *
 *  All inputs derive from stable slices of `project` (files, active
 *  path, manifest.editors) — the wider project object re-refs on every
 *  cpu/mem update and would trigger an infinite reload loop here. */
export function usePluginEditor({ files, activePath, manifestEditors }: Args): UsePluginEditorResult {
  const sources = useMemo(() => {
    if (!files) return [] as { path: string; content: string }[];
    const dec = new TextDecoder();
    return files
      .filter((f) => /^editors\/[^/]+\.js$/.test(f.path))
      .map((f) => ({ path: f.path, content: dec.decode(f.content) }));
  }, [files]);

  // Stable key over `sources` so the effect re-runs only on actual
  // content change, not on every `files`-array re-ref.
  const sourcesKey = useMemo(
    () => sources.map((s) => `${s.path}:${s.content.length}`).join("|"),
    [sources],
  );

  // Only load editors the user has consented to (ADR-0013). Re-run when the
  // trusted set changes so trusting a plugin activates it without a reload.
  const trustedSet = useSyncExternalStore(subscribeTrustedPlugins, trustedPluginsSnapshot, trustedPluginsSnapshot);

  const [registry, setRegistry] = useState<Map<string, EditorModule>>(new Map());
  useEffect(() => {
    let cancelled = false;
    void partitionPlugins(sources)
      .then(({ trusted }) => buildEditorRegistry(trusted))
      .then((reg) => { if (!cancelled) setRegistry(reg); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesKey, trustedSet]);

  const activeModule = useMemo<EditorModule | null>(() => {
    if (!activePath || registry.size === 0) return null;
    const ext = extOf(activePath);
    if (!ext) return null;
    const id = resolveEditorId(registry, manifestEditors, ext);
    return id ? registry.get(id) ?? null : null;
  }, [registry, activePath, manifestEditors]);

  const assets = useMemo(() => {
    if (!files || !activePath) return [] as { path: string; bytes: Uint8Array }[];
    return files
      .filter((f) => f.path !== activePath)
      .map((f) => ({ path: f.path, bytes: f.content }));
  }, [files, activePath]);

  return { activeModule, assets };
}
