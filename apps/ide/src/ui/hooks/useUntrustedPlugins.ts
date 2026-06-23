import { useEffect, useState, useSyncExternalStore } from "react";
import { subscribeTrustedPlugins, trustedPluginsSnapshot, untrustedPlugins, useWorkbench, PLUGIN_FILE_RE, type PluginRef } from "@app";

interface ProjectFile { path: string; content: Uint8Array }

/** The project-local plugins (`editors`/`converters` `*.js`) in the active project
 *  the user hasn't consented to yet (ADR-0013) — drives the trust banner.
 *  Re-derives when the plugin files change or the trusted set grows. */
export function useUntrustedPlugins(files: ProjectFile[] | null): PluginRef[] {
  const { storage } = useWorkbench();
  const trusted = useSyncExternalStore(subscribeTrustedPlugins, trustedPluginsSnapshot, trustedPluginsSnapshot);
  const [list, setList] = useState<PluginRef[]>([]);

  // Stable key over the plugin files only — ignore non-plugin edits + array re-refs.
  const key = (files ?? [])
    .filter((f) => PLUGIN_FILE_RE.test(f.path))
    .map((f) => `${f.path}:${f.content.length}`)
    .join("|");

  useEffect(() => {
    let cancelled = false;
    const pending = files ? untrustedPlugins(storage, files) : Promise.resolve<PluginRef[]>([]);
    void pending.then((u) => { if (!cancelled) setList(u); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, trusted, storage]);

  return list;
}
