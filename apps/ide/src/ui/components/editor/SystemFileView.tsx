import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { syntaxHighlighting } from "@codemirror/language";
import { editorTheme, editorHighlight, isCFile } from "@ui/codemirror";
import type { DefinitionTarget } from "../../codemirror/lsp/client";
import "./SystemFileView.css";

interface Props {
  path: string;
  text: string;
  onClose: () => void;
  /** Go-to-definition from inside the header (#78). App navigates: another
   *  sysroot header re-opens this viewer, a project symbol switches to the
   *  editor. Absent for non-C sysroot files (no LSP). */
  onGoToDefinition?: (target: DefinitionTarget) => void;
}

// Read-only viewer for a toolchain sysroot file (#50). C headers render in a
// read-only CodeMirror (cpp highlighting + LSP hover + Ctrl/Cmd+click
// go-to-definition, #78) so navigation chains header→header / header→project;
// non-C sysroot files (the linker cfg, …) get the same plain read-only editor
// without the C language services. Edits never persist — these aren't project
// files and never enter storage.
export function SystemFileView({ path, text, onClose, onGoToDefinition }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Latest-callback ref so the once-built mousedown handler always calls the
  // current prop without rebuilding the editor.
  const onGoToDefRef = useRef(onGoToDefinition);
  useEffect(() => {
    onGoToDefRef.current = onGoToDefinition;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let view: EditorView | null = null;
    let cancelled = false;

    void (async () => {
      const exts = [
        lineNumbers(),
        EditorView.editable.of(false),
        EditorState.readOnly.of(true),
        syntaxHighlighting(editorHighlight),
        editorTheme,
      ];
      if (isCFile(path)) {
        // Lazy-load the C language + LSP client (keeps lang-cpp out of the main
        // bundle — SystemFileView is statically imported by App).
        const [{ cpp }, lsp] = await Promise.all([
          import("@codemirror/lang-cpp"),
          import("../../codemirror/lsp/client"),
        ]);
        if (cancelled) return;
        // Address LSP requests at this header. openOrChange (inside the client)
        // didOpens it under its URI on the first request, so the server can
        // resolve definition/hover against it — the header is already in the
        // index via sysrootHeaders, this just makes it a request target (#78).
        lsp.setActiveDoc(path);
        exts.push(
          cpp(),
          lsp.cc65LspHover,
          EditorView.domEventHandlers({
            mousedown(e, v) {
              if (!(e.ctrlKey || e.metaKey)) return false;
              const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
              if (pos == null) return false;
              e.preventDefault();
              const doc = v.state.doc;
              void import("../../codemirror/lsp/client").then(({ cc65LspDefinition }) =>
                cc65LspDefinition(doc, pos).then((target) => {
                  if (target) onGoToDefRef.current?.(target);
                }),
              );
              return true;
            },
          }),
        );
      }
      if (cancelled) return;
      view = new EditorView({
        state: EditorState.create({ doc: text, extensions: exts }),
        parent: host,
      });
    })();

    return () => {
      cancelled = true;
      view?.destroy();
    };
  }, [path, text]);

  return (
    <div className="sysview">
      <div className="sysview__header">
        <span className="sysview__path">{path}</span>
        <span className="sysview__badge">read-only · system</span>
        <button className="sysview__close" onClick={onClose} aria-label="Close system file">×</button>
      </div>
      <div className="sysview__cm" ref={hostRef} />
    </div>
  );
}
