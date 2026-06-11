// Host for project-defined editor plugins. Resolves the editor module by
// extension, mounts it into a fresh <div>, forwards onChange to the project,
// and tears it down on unmount or file switch. Errors bubble to a fallback
// error message so a busted plugin doesn't crash the IDE.

import { useEffect, useRef, useState } from "react";
import type { EditorHandle, EditorModule } from "@plugins/editors";
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

  // Mount on module / path switch. `value` and `assets` are read at mount
  // time; subsequent value changes go through `handle.onValueChange` when the
  // plugin supports it, otherwise we remount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setError(null);
    try {
      const handle = module.mount(container, {
        value,
        path,
        onChange: (bytes) => onChangeRef.current(bytes),
        assets,
      });
      handleRef.current = handle;
    } catch (e) {
      setError(String(e));
      handleRef.current = null;
    }
    return () => {
      try { handleRef.current?.destroy(); } catch (e) { console.warn("editor destroy failed", e); }
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, path]);

  // Forward external value changes (e.g. snapshot restore) to a live editor.
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle?.onValueChange) return;
    try { handle.onValueChange(value); } catch (e) { console.warn("editor onValueChange failed", e); }
  }, [value]);

  return (
    <div className="plugin-editor">
      <div className="plugin-editor__header label">
        {module.meta.label} · {path}
      </div>
      {error ? (
        <div className="plugin-editor__error">editor crashed: {error}</div>
      ) : (
        <div ref={containerRef} className="plugin-editor__host" />
      )}
    </div>
  );
}
