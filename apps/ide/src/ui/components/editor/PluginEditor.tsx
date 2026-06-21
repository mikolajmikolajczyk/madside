// Host for project-defined editor plugins. Resolves the editor module by
// extension, mounts it into a fresh <div>, forwards onChange to the project,
// and tears it down on unmount or file switch.
//
// Error containment is layered:
//   1. try/catch around synchronous mount() throws (cheapest).
//   2. PluginEditorErrorBoundary — React error boundary on the mount host
//      catches errors during render/effect of any React descendants.
//   3. window-level listeners (error + unhandledrejection), live for the
//      lifetime of this PluginEditor, catch async errors from plugin event
//      handlers + Promises — those don't go through React.
// Any of the three trips a fallback that names the offending plugin and
// offers a "Reload editor" button.

import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorHandle, EditorModule } from "@ports";
import { PluginEditorErrorBoundary } from "./PluginEditorErrorBoundary";
import { useWorkbench } from "@app";
import "./PluginEditor.css";

interface Props {
  module: EditorModule;
  path: string;
  value: Uint8Array;
  onChange: (bytes: Uint8Array) => void;
  assets: { path: string; bytes: Uint8Array }[];
}

export function PluginEditor({ module, path, value, onChange, assets }: Props) {
  const workbench = useWorkbench();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<EditorHandle | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });
  const [error, setError] = useState<string | null>(null);
  // Bump to force a remount after the user clicks "Reload editor".
  const [reloadKey, setReloadKey] = useState(0);

  const pluginId = module.meta.id;

  const reportCrash = useCallback((cause: unknown) => {
    workbench.events.emit('plugin:crashed', { pluginId, kind: 'editor', cause });
  }, [workbench, pluginId]);

  const failWith = useCallback((msg: string, cause: unknown) => {
    setError(msg);
    reportCrash(cause);
  }, [reportCrash]);

  const onReload = useCallback(() => {
    setError(null);
    setReloadKey((k) => k + 1);
  }, []);

  // Mount on module / path / reload bump. `value` and `assets` are read at
  // mount time; subsequent value changes go through `handle.onValueChange`
  // when the plugin supports it, otherwise we remount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    try {
      const handle = module.mount(container, {
        value,
        path,
        onChange: (bytes) => {
          try { onChangeRef.current(bytes); }
          catch (e) { failWith(`onChange threw: ${String(e)}`, e); }
        },
        assets,
      });
      handleRef.current = handle;
    } catch (e) {
      // Error path of a genuine mount side-effect — surface the crash (#28).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      failWith(`mount threw: ${String(e)}`, e);
      handleRef.current = null;
    }
    return () => {
      try { handleRef.current?.destroy(); }
      catch (e) { console.warn(`editor[${pluginId}] destroy failed`, e); }
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, path, reloadKey]);

  // Forward external value changes (e.g. snapshot restore) to a live editor.
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle?.onValueChange) return;
    try { handle.onValueChange(value); }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- error path of a genuine onValueChange side-effect (#28)
    catch (e) { failWith(`onValueChange threw: ${String(e)}`, e); }
  }, [value, failWith]);

  // Catch async errors from plugin event handlers + promises. Scoped to the
  // lifetime of this PluginEditor so only the broken panel falls back; rest
  // of the workbench keeps running.
  useEffect(() => {
    const onWinError = (event: ErrorEvent) => {
      const container = containerRef.current;
      // Only surface errors originating from within the plugin's container.
      if (container && event.error?.target instanceof Node && container.contains(event.error.target)) {
        failWith(`async: ${event.error.message ?? String(event.error)}`, event.error);
      } else if (event.message?.includes(pluginId)) {
        failWith(`async: ${event.message}`, event.error ?? event.message);
      }
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      // Only claim rejections attributable to THIS plugin. A global rejection
      // (a failed fetch, a storage write elsewhere) must not crash an innocent
      // editor — previously every editor's handler fired for any rejection.
      if (!msg.includes(pluginId)) return;
      failWith(`unhandled promise: ${msg}`, reason);
    };
    window.addEventListener("error", onWinError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onWinError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [pluginId, reloadKey, failWith]);

  if (error) {
    return (
      <div className="plugin-editor">
        <div className="plugin-editor__header label">
          {module.meta.label} · {path}
        </div>
        <div className="plugin-editor__error">
          <div className="plugin-editor__error-title">
            plugin <code>{pluginId}</code> crashed
          </div>
          <pre className="plugin-editor__error-body">{error}</pre>
          <button type="button" onClick={onReload}>Reload editor</button>
        </div>
      </div>
    );
  }

  return (
    <div className="plugin-editor">
      <div className="plugin-editor__header label">
        {module.meta.label} · {path}
      </div>
      <PluginEditorErrorBoundary pluginId={pluginId} onReload={onReload} onCrash={reportCrash}>
        <div ref={containerRef} className="plugin-editor__host" key={reloadKey} />
      </PluginEditorErrorBoundary>
    </div>
  );
}
