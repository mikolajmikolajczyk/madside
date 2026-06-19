import { useCallback, useEffect, useRef } from "react";
import { Compartment, EditorState, StateEffect, StateField, RangeSet, type Extension, type Range } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, Decoration, gutter, GutterMarker, type DecorationSet } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, syntaxHighlighting, HighlightStyle, indentUnit, indentRange } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { lintGutter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { buildAssemblyLanguage, projectLabelsField, setProjectLabels, formatCView, isCFile, warmFormatter, resolveCStyle } from "@ui/codemirror";
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
    ".cm-addrGutter .cm-equateValue": {
      color: "var(--accent-amber)",
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
const toHex2 = (n: number) => (n & 0xff).toString(16).toUpperCase().padStart(2, "0");

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

// Live byte value for an address equate (#34) — shown in the same gutter column
// as the emitted code address, but on equate lines (which have no emitted addr),
// dimmed in an accent colour to read as "current value, not address".
class EquateValueMarker extends GutterMarker {
  readonly value: number;
  constructor(value: number) { super(); this.value = value; }
  override eq(o: GutterMarker) { return o instanceof EquateValueMarker && o.value === this.value; }
  override toDOM() {
    const el = document.createElement("span");
    el.className = "cm-equateValue";
    el.textContent = "$" + toHex2(this.value);
    return el;
  }
}

const setEquateValues = StateEffect.define<Map<number, number>>();
const equateValuesField = StateField.define<Map<number, number>>({
  create() { return new Map(); },
  update(map, tr) {
    for (const e of tr.effects) if (e.is(setEquateValues)) return e.value;
    return map;
  },
});

// Language packs are loaded on demand. MADS (small + always needed) is the
// synchronous default; JS / JSON modules are dynamically imported when the
// user opens a matching file, keeping the initial bundle leaner.
async function loadLanguagePack(
  path: string,
  cpu: CpuLanguage | undefined,
  toolchain: ToolchainLanguage | undefined,
  machine?: string,
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
  // C / C++ sources (cc65 projects). Completion + hover come from the cc65-intel
  // LSP running in a Web Worker (#63): member completion, cc65 stdlib + register
  // structs (from the sysroot headers we feed it), and auto-#include.
  if (/\.(c|h|cc|cpp|hpp)$/.test(lower)) {
    const [{ cpp }, { autocompletion }, lsp, { cc65SysrootHeaders }] = await Promise.all([
      import("@codemirror/lang-cpp"),
      import("@codemirror/autocomplete"),
      import("../../codemirror/lsp/client"),
      import("@app/cSysroot"),
    ]);
    // Feed the cc65 sysroot headers so the LSP offers stdlib completion +
    // register structs + auto-#include. Set before the first request.
    lsp.setSysrootHeaders(await cc65SysrootHeaders(machine));
    return [cpp(), autocompletion({ override: [lsp.cc65LspComplete] }), lsp.cc65LspHover];
  }
  // Assembly: built from the active machine CPU + project toolchain language.
  return cpu && toolchain ? [buildAssemblyLanguage(cpu, toolchain)] : [];
}
const languageCompartment = new Compartment();

// Indent width is project-configurable (project.json `editor.tabWidth`, #59) so
// it lives in its own compartment and is reconfigured live when the prop
// changes. Drives both the inserted indent and the literal-tab render width.
const indentCompartment = new Compartment();
const indentExtsFor = (w: number): Extension[] => [
  indentUnit.of(" ".repeat(w)),
  EditorState.tabSize.of(w),
];

/** Re-indent the whole document via the active language's indent service, then
 *  no-op if nothing changed. CodeMirror's lang-cpp supplies an indent service
 *  (C is reformatted); the asm StreamLanguage has none, so this is a safe no-op
 *  there — column-0 asm labels are never disturbed. Format-on-save (#59). */
function reindentDoc(view: EditorView): void {
  const changes = indentRange(view.state, 0, view.state.doc.length);
  if (changes.empty) return;
  view.dispatch({ changes });
}

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
  /** Live byte values for address equates (`COLOR4 = $02C8`), keyed by 1-based
   *  line — shown in the addr gutter while debugging (#34). Empty when idle. */
  equateValues?: Map<number, number>;
  /** Inline build errors/warnings for this file — red squiggle + gutter +
   *  hover message (#29). Cleared when the next build passes (empty array). */
  diagnostics?: BuildDiagnostic[];
  projectLabels?: Map<string, LabelInfo>;
  /** Spaces per indent level + literal-tab render width (project.json
   *  `editor.tabWidth`, #59). Defaults to 4. */
  tabWidth?: number;
  /** Resolved clang-format style for C sources — preset name or `.clang-format`
   *  YAML (App resolves project `.clang-format` / `editor.format` / default). */
  cFormatStyle?: string;
  /** Active machine CPU vocabulary + project toolchain language — drive the
   *  assembly highlight / hover / autocomplete. */
  cpuLanguage?: CpuLanguage;
  toolchainLanguage?: ToolchainLanguage;
  /** Active machine id (`manifest.machine`) — resolves the cc65 sysroot for the
   *  C LSP (stdlib completion + register structs). */
  machine?: string;
  // Bundle line + tick so jumping to the same line twice still retriggers the effect.
  gotoTarget?: { line: number; tick: number } | null;
  onToggleBreakpoint?: (line: number) => void;
  onViewReady?: (view: EditorView | null) => void;
  onJumpToLabel?: (name: string) => void;
  onCursorLine?: (line: number) => void;
}

export function Editor({ value, onChange, filename, pcLine, breakpointLines, lineAddrs, equateValues, diagnostics, projectLabels, tabWidth, cFormatStyle, cpuLanguage, toolchainLanguage, machine, gotoTarget, onToggleBreakpoint, onViewReady, onJumpToLabel, onCursorLine }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Latest-callback refs so the CodeMirror handlers (built once on mount) always
  // call the current props without rebuilding the editor. Updated in an effect,
  // not during render, to stay Rules-of-React clean (#28) — CM events only fire
  // after commit, so the refs are always current by the time they're read.
  const onChangeRef = useRef(onChange);
  const onToggleRef = useRef(onToggleBreakpoint);
  const onJumpRef = useRef(onJumpToLabel);
  const onCursorLineRef = useRef(onCursorLine);
  // Same latest-value refs for the data the format-on-save handler needs — the
  // keymap is built once on mount but must format the *current* file/style.
  const filenameRef = useRef(filename);
  const cFormatStyleRef = useRef(cFormatStyle);
  const tabWidthRef = useRef(tabWidth);
  useEffect(() => {
    onChangeRef.current = onChange;
    onToggleRef.current = onToggleBreakpoint;
    onJumpRef.current = onJumpToLabel;
    onCursorLineRef.current = onCursorLine;
    filenameRef.current = filename;
    cFormatStyleRef.current = cFormatStyle;
    tabWidthRef.current = tabWidth;
  });

  // Format the active document: C/C++ → clang-format (wasm, VS Code parity);
  // anything else → the cheap CM indent service (asm = no-op). Fail-soft inside
  // formatC. Selection is clamped since a reformat rewrites the whole doc.
  const formatActiveDoc = useCallback(async (view: EditorView) => {
    const style = cFormatStyleRef.current ?? resolveCStyle(undefined, undefined, tabWidthRef.current ?? 4);
    const handled = await formatCView(view, filenameRef.current, style);
    if (!handled) reindentDoc(view);
  }, []);

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
            const addrs = view.state.field(lineAddrsField);
            const values = view.state.field(equateValuesField);
            if (addrs.size === 0 && values.size === 0) return RangeSet.empty;
            const ranges: Range<GutterMarker>[] = [];
            const doc = view.state.doc;
            for (const [line, addr] of addrs) {
              if (line < 1 || line > doc.lines) continue;
              ranges.push(new AddrMarker(toHex4(addr)).range(doc.line(line).from));
            }
            // Equate lines carry no emitted code address, so they never collide
            // with the addr markers above — show the live byte value there (#34).
            for (const [line, value] of values) {
              if (line < 1 || line > doc.lines || addrs.has(line)) continue;
              ranges.push(new EquateValueMarker(value).range(doc.line(line).from));
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
        indentCompartment.of(indentExtsFor(tabWidth ?? 4)),
        syntaxHighlighting(highlight),
        bpField,
        lineAddrsField,
        equateValuesField,
        pcLineField,
        projectLabelsField,
        lintGutter(),
        autocompletion(),
        // Auto-close brackets/quotes while typing — type `{`/`(`/`"` and the
        // matching close is inserted; typing over it or backspacing the pair is
        // handled by closeBracketsKeymap. Language-aware (skips inside strings).
        closeBrackets(),
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
          // Ctrl+S (Save = format + build + snapshot) is owned by the app-level
          // `file.save` command — it intercepts in capture phase before CM, so a
          // Mod-s binding here would be dead. Format-on-save lives there.
          // Format Document — VS Code parity. Formats without saving/building.
          { key: "Shift-Alt-f", preventDefault: true, run: (view) => { void formatActiveDoc(view); return true; } },
          // Consume the Run / Restart accelerators so the browser doesn't insert
          // a newline into the contenteditable (CM only preventDefaults keys it
          // binds). The window-level shortcut handler still fires the command —
          // CM doesn't stopPropagation — so this is no-op-but-swallow.
          { key: "Mod-Enter", preventDefault: true, run: () => true },
          { key: "Shift-Mod-Enter", preventDefault: true, run: () => true },
          indentWithTab,
          ...closeBracketsKeymap,
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
        setEquateValues.of(new Map()),
        setBreakpoints.of(new Set()),
        setPcLine.of(null),
      ],
    });
    // Prefetch the clang-format wasm when a C file opens so the first Ctrl+S
    // doesn't pay the 2.3 MB download/compile latency. Best-effort, IDB-cached.
    if (isCFile(filename)) warmFormatter();
    // Load and swap the language pack asynchronously (lazy chunk). Re-runs when
    // the file OR the active CPU / toolchain language changes (machine switch).
    let cancelled = false;
    void loadLanguagePack(filename, cpuLanguage, toolchainLanguage, machine).then((exts) => {
      if (cancelled || viewRef.current !== view) return;
      view.dispatch({ effects: languageCompartment.reconfigure(exts) });
    });
    return () => { cancelled = true; };
  }, [filename, cpuLanguage, toolchainLanguage, machine]);

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
    view.dispatch({ effects: setEquateValues.of(equateValues ?? new Map()) });
  }, [equateValues]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setProjectLabels.of(projectLabels ?? new Map()) });
  }, [projectLabels]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: indentCompartment.reconfigure(indentExtsFor(tabWidth ?? 4)) });
  }, [tabWidth]);

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
