import { useEffect, useState, useSyncExternalStore } from "react";
import {
  PLUGIN_FILE_RE,
  pluginFiles,
  pluginHash,
  isTrustedHash,
  hydrateTrustedPlugins,
  subscribeTrustedPlugins,
  trustedPluginsSnapshot,
  useWorkbench,
} from "@app";

interface ProjectFile { path: string; content: Uint8Array }

export type PluginKind = "editor" | "converter";

/** A project-local plugin for the inventory (#69): its file, what kind it is, and
 *  whether the user has consented to run it. */
export interface ProjectPlugin {
  path: string;
  kind: PluginKind;
  trusted: boolean;
}

/** Every project-local plugin (`editors`/`converters` `*.js`) with its kind +
 *  trust status — drives the discoverable plugin inventory (#69). Unlike
 *  useUntrustedPlugins (consent banner, untrusted only) this lists ALL of them, so
 *  a user can review even already-trusted plugins. Reactive to the trusted set. */
export function useProjectPlugins(files: ProjectFile[] | null): ProjectPlugin[] {
  const { storage } = useWorkbench();
  const trusted = useSyncExternalStore(subscribeTrustedPlugins, trustedPluginsSnapshot, trustedPluginsSnapshot);
  const [list, setList] = useState<ProjectPlugin[]>([]);

  const key = (files ?? [])
    .filter((f) => PLUGIN_FILE_RE.test(f.path))
    .map((f) => `${f.path}:${f.content.length}`)
    .join("|");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await hydrateTrustedPlugins(storage);
      const out = await Promise.all(
        pluginFiles(files ?? []).map(async (f) => ({
          path: f.path,
          kind: (f.path.startsWith("editors/") ? "editor" : "converter") as PluginKind,
          trusted: isTrustedHash(await pluginHash(f.content)),
        })),
      );
      if (!cancelled) setList(out);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, trusted, storage]);

  return list;
}
