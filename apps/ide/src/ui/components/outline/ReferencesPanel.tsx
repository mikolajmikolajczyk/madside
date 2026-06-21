import { useMemo } from "react";
import { basename } from "@core/path";
import type { ReferenceLocation } from "../../codemirror/lsp/client";
import "./OutlinePanel.css";

interface Props {
  symbol: string;
  refs: ReferenceLocation[];
  /** Navigate to a reference. `sysroot` marks a header location (read-only). */
  onJump: (path: string, line: number, sysroot: boolean) => void;
  onClose: () => void;
}

/** Sidebar list of find-references results (#74), grouped by file, click to
 *  jump (cross-file). Shown after Shift+F12 on a C identifier; cleared with the
 *  × or by running it again on another symbol. */
export function ReferencesPanel({ symbol, refs, onJump, onClose }: Props) {
  const groups = useMemo(() => {
    const byPath = new Map<string, ReferenceLocation[]>();
    for (const r of refs) {
      const list = byPath.get(r.path) ?? [];
      list.push(r);
      byPath.set(r.path, list);
    }
    return [...byPath.entries()].map(([path, items]) => ({
      path,
      items: items.sort((a, b) => a.line - b.line),
    }));
  }, [refs]);

  return (
    <div className="outline">
      <div className="outline__head outline__head--refs">
        <span>References · {symbol} ({refs.length})</span>
        <button className="outline__close" onClick={onClose} aria-label="Close references">×</button>
      </div>
      {refs.length === 0 ? (
        <div className="outline__empty">No references</div>
      ) : (
        <ul className="outline__list">
          {groups.map((g) => (
            <li key={g.path} className="outline__group">
              <div className="outline__group-head" title={g.path}>{basename(g.path)}</div>
              <ul className="outline__list">
                {g.items.map((r) => (
                  <li
                    key={`${r.path}:${r.line}`}
                    className="outline__item"
                    onClick={() => onJump(r.path, r.line, r.sysroot)}
                    title={`${r.path}:${r.line}`}
                  >
                    <span className="outline__kind">{r.line}</span>
                    <span className="outline__name">{basename(g.path)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
