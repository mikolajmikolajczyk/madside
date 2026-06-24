import { useEffect, useState } from "react";
import { isCFile } from "@ui/codemirror";
import type { OutlineItem } from "../../codemirror/lsp/client";
import "./OutlinePanel.css";

// LSP SymbolKind → a short tag (the C language server emits Function/Struct/Enum/Class
// (typedef)/Variable/Constant/Field). Anything else falls back to a dot.
const KIND_TAG: Record<number, string> = {
  5: "type", // Class — typedef
  10: "enum",
  12: "fn", // Function
  13: "var", // Variable
  14: "const", // Constant
  22: "fld", // Field
  23: "struct", // Struct (also union)
};

interface Props {
  path: string;
  /** Decoded active-file text — re-fetches the outline when it changes. */
  content: string;
  /** Jump the editor to a 1-based line in the active file. */
  onJump: (line: number) => void;
}

/** Sidebar outline of the active C file's top-level declarations (#76), backed
 *  by the LSP's textDocument/documentSymbol. Click to jump. Renders nothing for
 *  non-C files. Lazy-imports the worker client so a non-C session never loads
 *  it. */
export function OutlinePanel({ path, content, onJump }: Props) {
  const [items, setItems] = useState<OutlineItem[]>([]);

  useEffect(() => {
    if (!isCFile(path)) return;
    let cancelled = false;
    // Debounced so typing doesn't spam the worker; the list lags edits slightly.
    const timer = window.setTimeout(() => {
      void import("../../codemirror/lsp/client").then(({ cDocumentSymbols }) =>
        cDocumentSymbols(path, content).then((syms) => {
          if (!cancelled) setItems(syms);
        }),
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [path, content]);

  if (!isCFile(path)) return null;

  return (
    <div className="outline">
      <div className="outline__head">Outline</div>
      {items.length === 0 ? (
        <div className="outline__empty">No symbols</div>
      ) : (
        <ul className="outline__list">
          {items.map((it) => (
            <li
              key={`${it.name}:${it.line}`}
              className="outline__item"
              onClick={() => onJump(it.line)}
              title={`${it.name} — line ${it.line}`}
            >
              <span className="outline__kind">{KIND_TAG[it.kind] ?? "·"}</span>
              <span className="outline__name">{it.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
