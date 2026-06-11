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
// eslint-disable-next-line boundaries/element-types -- TODO(M3): service extraction lifts this import into a service call
import type { EditorHandle, EditorModule } from "@plugins/editors";
import { PluginEditorErrorBoundary } from "./PluginEditorErrorBoundary";
import "./PluginEditor.css";

interface Props {
  module: EditorModule;
  path: string;
  value: Uint8Array;
  onChange: (bytes: Uint8Array) => void;
  assets: { path: string; bytes: Uint8Array }[];
}

export function PluginEditor({ module, path, value, onChange, assets }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<EditorHandle | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [error, setError] = useState<string | null>(null);
  // Bump to force a remount after the user clicks "Reload editor".
  const [reloadKey, setReloadKey] = useState(0);

  const pluginId = module.meta.id;

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
          catch (e) { setError(`onChange threw: ${String(e)}`); }
        },
        assets,
      });
      handleRef.current = handle;
    } catch (e) {
      setError(`mount threw: ${String(e)}`);
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
    catch (e) { setError(`onValueChange threw: ${String(e)}`); }
  }, [value]);

  // Catch async errors from plugin event handlers + promises. Scoped to the
  // lifetime of this PluginEditor so only the broken panel falls back; rest
  // of the workbench keeps running.
  useEffect(() => {
    const onWinError = (event: ErrorEvent) => {
      const container = containerRef.current;
      // Only surface errors originating from within the plugin's container.
      if (container && event.error?.target instanceof Node && container.contains(event.error.target)) {
        setError(`async: ${event.error.message ?? String(event.error)}`);
      } else if (event.message?.includes(pluginId)) {
        setError(`async: ${event.message}`);
      }
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      setError(`unhandled promise: ${msg}`);
    };
    window.addEventListener("error", onWinError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onWinError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [pluginId, reloadKey]);

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
      <PluginEditorErrorBoundary pluginId={pluginId} onReload={onReload}>
        <div ref={containerRef} className="plugin-editor__host" key={reloadKey} />
      </PluginEditorErrorBoundary>
    </div>
  );
}
