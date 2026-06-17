import { useEffect, useRef } from "react";
import { Compartment, EditorState, StateEffect, StateField, RangeSet, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, Decoration, gutter, GutterMarker, type DecorationSet } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, syntaxHighlighting, HighlightStyle, indentUnit } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { lintGutter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { buildAssemblyLanguage, projectLabelsField, setProjectLabels } from "@ui/codemirror";
import type { CpuLanguage, LabelInfo } from "@core";
import type { BuildDiagnostic, ToolchainLanguage } from "@ports";
import "./Editor.css";

const theme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "var(--bg-primary)",
      color: "var(--text-primary)",
    },
    ".cm-content": { fontFamily: "var(--font-mono)", caretColor: "var(--accent-mint)" },
    ".cm-cursor": { borderLeftColor: "var(--accent-mint)" },
    ".cm-activeLine": { backgroundColor: "var(--bg-secondary)" },
    ".cm-activeLineGutter": { backgroundColor: "var(--bg-secondary)" },
    ".cm-gutters": {
      backgroundColor: "var(--bg-primary)",
      color: "var(--text-quaternary)",
      border: "none",
      borderRight: "1px solid var(--border-default)",
    },
    ".cm-selectionBackground, .cm-content ::selection, ::selection": { backgroundColor: "rgba(74, 222, 128, 0.25) !important" },
    "&.cm-focused .cm-selectionBackground": { backgroundColor: "rgba(74, 222, 128, 0.35) !important" },
    ".cm-pcLine": { backgroundColor: "rgba(0, 200, 150, 0.18)" },
    ".cm-bpGutter": {
      width: "16px",
      cursor: "pointer",
      backgroundColor: "var(--bg-primary)",
      borderRight: "1px solid var(--border-default)",
    },
    ".cm-bpGutter .cm-gutterElement": {
      textAlign: "center",
      color: "var(--accent-coral)",
      lineHeight: "1",
      paddingTop: "2px",
    },
    ".cm-bpGutter .cm-gutterElement:hover": {
      backgroundColor: "var(--bg-tertiary)",
    },
    ".cm-bpGutter .cm-gutterElement:hover:empty::before": {
      content: "'○'", opacity: 0.4, color: "var(--text-tertiary)",
    },
    ".cm-addrGutter": {
      backgroundColor: "var(--bg-primary)",
      borderRight: "1px solid var(--border-default)",
      color: "var(--text-quaternary)",
      fontFamily: "var(--font-mono)",
      fontSize: "11px",
    },
    ".cm-addrGutter .cm-gutterElement": {
      padding: "0 6px",
      textAlign: "right",
    },
    ".cm-tooltip.cm-tooltip-autocomplete": {
      background: "var(--bg-secondary)",
      border: "1px solid var(--border-default)",
      boxShadow: "0 6px 18px rgba(0,0,0,0.6)",
      fontFamily: "var(--font-mono)",
      fontSize: "12px",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul": {
      fontFamily: "var(--font-mono)",
      maxHeight: "260px",
    },
    ".cm-tooltip-autocomplete ul li": {
      color: "var(--text-secondary)",
      padding: "3px 8px",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      background: "var(--bg-tertiary)",
      color: "var(--accent-mint)",
    },
    ".cm-completionLabel": { color: "inherit" },
    ".cm-completionDetail": {
      color: "var(--text-quaternary)",
      fontStyle: "normal",
      marginLeft: "12px",
    },
    ".cm-completionIcon": {
      color: "var(--text-quaternary)",
      opacity: 0.8,
    },
    ".cm-mads-hover": {
      fontFamily: "var(--font-mono)",
      fontSize: "12px",
      color: "var(--text-primary)",
      padding: "4px 8px",
      maxWidth: "560px",
    },
    ".cm-mads-hover strong": { color: "var(--accent-mint)" },
    ".cm-tooltip.cm-tooltip-hover": {
      background: "var(--bg-secondary)",
      border: "1px solid var(--border-default)",
      boxShadow: "0 4px 12px rgba(0,0,0,0.6)",
    },
    // Build diagnostics (#29). Lint tooltip + gutter markers, themed to match.
    ".cm-tooltip.cm-tooltip-lint": {
      background: "var(--bg-secondary)",
      border: "1px solid var(--border-default)",
      boxShadow: "0 4px 12px rgba(0,0,0,0.6)",
    },
    ".cm-diagnostic": {
      fontFamily: "var(--font-mono)",
      fontSize: "12px",
      padding: "4px 8px",
      borderLeftWidth: "4px",
    },
    ".cm-diagnostic-error": { borderLeftColor: "var(--accent-coral)" },
    ".cm-diagnostic-warning": { borderLeftColor: "var(--accent-amber)" },
    ".cm-lintRange-error": { backgroundPosition: "left bottom" },
    ".cm-lint-marker-error": { color: "var(--accent-coral)" },
    ".cm-lint-marker-warning": { color: "var(--accent-amber)" },
    ".cm-mads-preview": {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      maxWidth: "560px",
    },
    ".cm-mads-preview-head": {
      fontSize: "10px",
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "var(--text-quaternary)",
    },
    ".cm-mads-preview-doc": {
      color: "var(--text-primary)",
      fontSize: "11px",
      lineHeight: "1.45",
      whiteSpace: "pre-wrap",
      borderLeft: "2px solid var(--accent-mint)",
      paddingLeft: "8px",
    },
    ".cm-mads-preview-body": {
      margin: 0,
      padding: "6px 8px",
      background: "var(--bg-primary)",
      border: "1px solid var(--border-default)",
      color: "var(--text-primary)",
      fontFamily: "var(--font-mono)",
      fontSize: "11px",
      lineHeight: "1.4",
      whiteSpace: "pre",
      overflow: "auto",
      maxHeight: "200px",
    },
  },
  { dark: true }
);

const highlight = HighlightStyle.define([
  { tag: t.comment, color: "var(--text-tertiary)", fontStyle: "italic" },
  { tag: t.keyword, color: "var(--accent-mint)" },
  { tag: t.atom, color: "var(--accent-mint)", fontStyle: "italic" },
  { tag: t.number, color: "var(--accent-amber)" },
  { tag: t.string, color: "var(--accent-coral)" },
  { tag: t.operatorKeyword, color: "var(--text-secondary)" },
  { tag: t.variableName, color: "var(--text-primary)" },
]);

const setBreakpoints = StateEffect.define<Set<number>>();

const setLineAddrs = StateEffect.define<Map<number, number>>();
const lineAddrsField = StateField.define<Map<number, number>>({
  create() { return new Map(); },
  update(map, tr) {
    for (const e of tr.effects) if (e.is(setLineAddrs)) return e.value;
    return map;
  },
});

const toHex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");

class AddrMarker extends GutterMarker {
  readonly text: string;
  constructor(text: string) { super(); this.text = text; }
  override eq(o: GutterMarker) { return o instanceof AddrMarker && o.text === this.text; }
  override toDOM() {
    const el = document.createElement("span");
    el.textContent = this.text;
    return el;
  }
}
const addrSpacer = new AddrMarker("FFFF");

// Language packs are loaded on demand. MADS (small + always needed) is the
// synchronous default; JS / JSON modules are dynamically imported when the
// user opens a matching file, keeping the initial bundle leaner.
async function loadLanguagePack(
  path: string,
  cpu: CpuLanguage | undefined,
  toolchain: ToolchainLanguage | undefined,
): Promise<Extension[]> {
  const lower = path.toLowerCase();
  if (/\.(js|mjs|cjs|ts|tsx)$/.test(lower)) {
    const [{ javascript }, { jsConverterExtras }] = await Promise.all([
      import("@codemirror/lang-javascript"),
      import("@ui/codemirror"),
    ]);
    const ts = /\.(ts|tsx)$/.test(lower);
    return [javascript({ typescript: ts }), jsConverterExtras];
  }
  if (/\.json$/.test(lower)) {
    const { json } = await import("@codemirror/lang-json");
    return [json()];
  }
  // Assembly: built from the active machine CPU + project toolchain language.
  return cpu && toolchain ? [buildAssemblyLanguage(cpu, toolchain)] : [];
}
const languageCompartment = new Compartment();

class BpMarker extends GutterMarker {
  override toDOM() {
    const el = document.createElement("span");
    el.textContent = "●";
    return el;
  }
}
const bpMarker = new BpMarker();

const bpField = StateField.define<Set<number>>({
  create() { return new Set(); },
  update(set, tr) {
    for (const e of tr.effects) if (e.is(setBreakpoints)) return e.value;
    return set;
  },
});

const setPcLine = StateEffect.define<number | null>();
const pcLineDeco = Decoration.line({ class: "cm-pcLine" });
const pcLineField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setPcLine)) {
        const line = e.value;
        if (line == null || line < 1 || line > tr.state.doc.lines) {
          deco = Decoration.none;
        } else {
          const lineObj = tr.state.doc.line(line);
          deco = Decoration.set([pcLineDeco.range(lineObj.from)]);
        }
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

interface Props {
  value: string;
  onChange: (value: string) => void;
  filename: string;
  pcLine?: number | null;
  breakpointLines?: Set<number>;
  lineAddrs?: Map<number, number>;
  /** Inline build errors/warnings for this file — red squiggle + gutter +
   *  hover message (#29). Cleared when the next build passes (empty array). */
  diagnostics?: BuildDiagnostic[];
  projectLabels?: Map<string, LabelInfo>;
  /** Active machine CPU vocabulary + project toolchain language — drive the
   *  assembly highlight / hover / autocomplete. */
  cpuLanguage?: CpuLanguage;
  toolchainLanguage?: ToolchainLanguage;
  // Bundle line + tick so jumping to the same line twice still retriggers the effect.
  gotoTarget?: { line: number; tick: number } | null;
  onToggleBreakpoint?: (line: number) => void;
  onSave?: () => void;
  onViewReady?: (view: EditorView | null) => void;
  onJumpToLabel?: (name: string) => void;
  onCursorLine?: (line: number) => void;
}

export function Editor({ value, onChange, filename, pcLine, breakpointLines, lineAddrs, diagnostics, projectLabels, cpuLanguage, toolchainLanguage, gotoTarget, onToggleBreakpoint, onSave, onViewReady, onJumpToLabel, onCursorLine }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onToggleRef = useRef(onToggleBreakpoint);
  onToggleRef.current = onToggleBreakpoint;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onJumpRef = useRef(onJumpToLabel);
  onJumpRef.current = onJumpToLabel;
  const onCursorLineRef = useRef(onCursorLine);
  onCursorLineRef.current = onCursorLine;

  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        gutter({
          class: "cm-addrGutter",
          renderEmptyElements: true,
          markers: (view) => {
            const map = view.state.field(lineAddrsField);
            if (map.size === 0) return RangeSet.empty;
            const ranges = [];
            const doc = view.state.doc;
            for (const [line, addr] of map) {
              if (line < 1 || line > doc.lines) continue;
              ranges.push(new AddrMarker(toHex4(addr)).range(doc.line(line).from));
            }
            ranges.sort((a, b) => a.from - b.from);
            return RangeSet.of(ranges, true);
          },
          initialSpacer: () => addrSpacer,
        }),
        gutter({
          class: "cm-bpGutter",
          renderEmptyElements: true,
          markers: (view) => {
            const set = view.state.field(bpField);
            if (set.size === 0) return RangeSet.empty;
            const ranges = [];
            const doc = view.state.doc;
            for (const line of set) {
              if (line < 1 || line > doc.lines) continue;
              ranges.push(bpMarker.range(doc.line(line).from));
            }
            return RangeSet.of(ranges, true);
          },
          initialSpacer: () => bpMarker,
          domEventHandlers: {
            mousedown(view, line) {
              const lineNo = view.state.doc.lineAt(line.from).number;
              onToggleRef.current?.(lineNo);
              return true;
            },
          },
        }),
        history(),
        bracketMatching(),
        highlightActiveLine(),
        // Initial language from the mount-time props; the reconfigure effect
        // below swaps it on file / machine / toolchain change.
        languageCompartment.of(
          cpuLanguage && toolchainLanguage
            ? buildAssemblyLanguage(cpuLanguage, toolchainLanguage)
            : [],
        ),
        indentUnit.of("        "),
        EditorState.tabSize.of(8),
        syntaxHighlighting(highlight),
        bpField,
        lineAddrsField,
        pcLineField,
        projectLabelsField,
        lintGutter(),
        autocompletion(),
        EditorView.domEventHandlers({
          mousedown(e, view) {
            if (!(e.ctrlKey || e.metaKey)) return false;
            const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
            if (pos == null) return false;
            const word = view.state.wordAt(pos);
            if (!word) return false;
            const text = view.state.doc.sliceString(word.from, word.to);
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) return false;
            e.preventDefault();
            onJumpRef.current?.(text);
            return true;
          },
        }),
        keymap.of([
          { key: "Mod-s", preventDefault: true, run: () => { onSaveRef.current?.(); return true; } },
          // Consume the Run / Restart accelerators so the browser doesn't insert
          // a newline into the contenteditable (CM only preventDefaults keys it
          // binds). The window-level shortcut handler still fires the command —
          // CM doesn't stopPropagation — so this is no-op-but-swallow.
          { key: "Mod-Enter", preventDefault: true, run: () => true },
          { key: "Shift-Mod-Enter", preventDefault: true, run: () => true },
          indentWithTab,
          ...completionKeymap,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        theme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          if (u.selectionSet || u.docChanged) {
            const line = u.state.doc.lineAt(u.state.selection.main.head).number;
            onCursorLineRef.current?.(line);
          }
        }),
      ],
    });
    viewRef.current = new EditorView({ state, parent: hostRef.current });
    onViewReady?.(viewRef.current);
    return () => {
      onViewReady?.(null);
      viewRef.current?.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync an externally-changed value into the doc — a project switch, opening a
  // course lesson, or a snapshot restore all replace the file content while the
  // path (and so this component) stays mounted. Keyed on `value`, not `filename`,
  // so same-path content swaps refresh the editor. Guarded by `current !== value`
  // so the user's own edits (echoed back through onChange → value) don't loop.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    // Reset file-scoped state synchronously so stale markers don't linger; the
    // breakpoint / lineAddrs / label effects below re-populate from props.
    view.dispatch({
      effects: [
        setLineAddrs.of(new Map()),
        setBreakpoints.of(new Set()),
        setPcLine.of(null),
      ],
    });
    // Load and swap the language pack asynchronously (lazy chunk). Re-runs when
    // the file OR the active CPU / toolchain language changes (machine switch).
    let cancelled = false;
    void loadLanguagePack(filename, cpuLanguage, toolchainLanguage).then((exts) => {
      if (cancelled || viewRef.current !== view) return;
      view.dispatch({ effects: languageCompartment.reconfigure(exts) });
    });
    return () => { cancelled = true; };
  }, [filename, cpuLanguage, toolchainLanguage]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setPcLine.of(pcLine ?? null) });
  }, [pcLine]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setBreakpoints.of(breakpointLines ?? new Set()) });
  }, [breakpointLines]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setLineAddrs.of(lineAddrs ?? new Map()) });
  }, [lineAddrs]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setProjectLabels.of(projectLabels ?? new Map()) });
  }, [projectLabels]);

  // Inline build diagnostics (#29). Map each toolchain diagnostic (1-based line,
  // optional column) onto a document range and hand them to @codemirror/lint —
  // squiggle on the text, marker in the lint gutter, message on hover. An empty
  // array (passed after a clean build, or on file switch) clears the markers.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc;
    const cm: Diagnostic[] = [];
    for (const d of diagnostics ?? []) {
      if (d.line < 1 || d.line > doc.lines) continue;
      const lineObj = doc.line(d.line);
      let from: number;
      if (d.column && d.column >= 1) {
        from = Math.min(lineObj.from + (d.column - 1), lineObj.to);
      } else {
        // No column: underline from the first non-whitespace char to EOL.
        const lead = lineObj.text.length - lineObj.text.trimStart().length;
        from = lineObj.from + Math.min(lead, lineObj.text.length);
      }
      const to = lineObj.to > from ? lineObj.to : from;
      cm.push({ from, to, severity: d.severity, message: d.message });
    }
    view.dispatch(setDiagnostics(view.state, cm));
  }, [diagnostics]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !gotoTarget) return;
    const line = gotoTarget.line;
    if (line < 1 || line > view.state.doc.lines) return;
    const lineObj = view.state.doc.line(line);
    view.dispatch({
      selection: { anchor: lineObj.from },
      scrollIntoView: true,
    });
    view.focus();
  }, [gotoTarget]);

  return <div className="editor" ref={hostRef} />;
}
