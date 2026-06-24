import { useCallback, useEffect, useRef } from "react";
import { Compartment, EditorState, StateEffect, StateField, RangeSet, type Extension, type Range } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, Decoration, gutter, GutterMarker, type DecorationSet } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, syntaxHighlighting, indentUnit, indentRange } from "@codemirror/language";
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { lintGutter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { buildAssemblyLanguage, projectLabelsField, setProjectLabels, formatCView, isCFile, warmFormatter, resolveCStyle, editorTheme, editorHighlight } from "@ui/codemirror";
import { asmDialectFor } from "@app/asmLsp";
import type { CpuLanguage, LabelInfo } from "@core";
import type { BuildDiagnostic, ToolchainLanguage } from "@ports";
import type { DefinitionTarget, ReferenceLocation } from "../../codemirror/lsp/client";
import "./Editor.css";

const setBreakpoints = StateEffect.define<Set<number>>();

const setLineAddrs = StateEffect.define<Map<number, number>>();
const lineAddrsField = StateField.define<Map<number, number>>({
  create() { return new Map(); },
  update(map, tr) {
    for (const e of tr.effects) if (e.is(setLineAddrs)) return e.value;
    return map;
  },
});

// Per-line bank label for banked builds (ADR-0014) — keyed by 1-based line,
// value is the bank's space id (e.g. 'bank3'). Shown as a dim suffix on the
// addr gutter so a banked source line reads `4000 b3`. Empty for flat builds.
const setLineBanks = StateEffect.define<Map<number, string>>();
const lineBanksField = StateField.define<Map<number, string>>({
  create() { return new Map(); },
  update(map, tr) {
    for (const e of tr.effects) if (e.is(setLineBanks)) return e.value;
    return map;
  },
});

const toHex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");
const toHex2 = (n: number) => (n & 0xff).toString(16).toUpperCase().padStart(2, "0");

class AddrMarker extends GutterMarker {
  readonly text: string;
  readonly bank?: string;
  constructor(text: string, bank?: string) { super(); this.text = text; this.bank = bank; }
  override eq(o: GutterMarker) { return o instanceof AddrMarker && o.text === this.text && o.bank === this.bank; }
  override toDOM() {
    const el = document.createElement("span");
    el.textContent = this.text;
    // Banked line (ADR-0014): append the bank as a dim suffix, so $4000 lines in
    // different banks are distinguishable at a glance. Strips a leading 'bank'
    // for compactness (`bank3` → `b3`).
    if (this.bank) {
      const tag = document.createElement("span");
      tag.className = "cm-addrBank";
      tag.textContent = " " + this.bank.replace(/^bank/, "b");
      el.appendChild(tag);
    }
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
  toolchainId?: string,
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
  // C / C++ sources (cc65 projects). Completion + hover come from the in-repo
  // C language server running in a Web Worker (#63): member completion, cc65 stdlib + register
  // structs (from the sysroot headers we feed it), and auto-#include.
  if (/\.(c|h|cc|cpp|hpp)$/.test(lower)) {
    const [{ cpp }, { autocompletion }, lsp, { cSemanticTokens }, { cSignatureHelpTooltip }, { cSysrootHeaders, cTargetDefines, cLspTarget }] = await Promise.all([
      import("@codemirror/lang-cpp"),
      import("@codemirror/autocomplete"),
      import("../../codemirror/lsp/client"),
      import("../../codemirror/lsp/semanticTokens"),
      import("../../codemirror/lsp/signatureHelp"),
      import("@app/cSysroot"),
    ]);
    // Pick the C language server backing this machine (cc65 6502 vs z88dk Z80)
    // FIRST — switching targets respawns the worker, so the sysroot + defines
    // below must be pushed at the new connection's `initialize`. Feed the
    // target's sysroot headers (a resolution pool) + predefined macros so the
    // LSP resolves the preprocessor target gating and offers stdlib completion +
    // register structs + auto-#include, without cross-target noise (#30).
    lsp.setLspTarget(cLspTarget(machine));
    lsp.setDefines(cTargetDefines(machine));
    lsp.setSysrootHeaders(await cSysrootHeaders(machine));
    // Mark this file as the focused doc so completion/hover address its URI in
    // the multi-document worker (#70).
    lsp.setActiveDoc(path);
    // cpp() = lexical highlight; cSemanticTokens() paints the LSP's semantic
    // roles (macro / type / function / field) on top (#72); signature help (#71)
    // pops the call signature while typing arguments.
    return [
      cpp(),
      cSemanticTokens(),
      cSignatureHelpTooltip(),
      autocompletion({ override: [lsp.cLspComplete] }),
      lsp.cLspHover,
    ];
  }
  // Assembly: StreamLanguage highlight from the CPU + toolchain vocab. When the
  // toolchain has an asm LSP dialect (#140), layer the language server's opcode/
  // label hover + project-symbol completion on top (the StreamLanguage keeps the
  // base syntax coloring; the LSP adds intelligence the lexer can't).
  if (cpu && toolchain) {
    const base = buildAssemblyLanguage(cpu, toolchain);
    const dialect = asmDialectFor(toolchainId);
    if (!dialect) return [base];
    const [{ autocompletion }, asm, { asmSemanticTokens }] = await Promise.all([
      import("@codemirror/autocomplete"),
      import("../../codemirror/lsp/asm-client"),
      import("../../codemirror/lsp/asmSemanticTokens"),
    ]);
    asm.setAsmDialect(dialect);
    asm.setAsmActiveDoc(path);
    return [base, asmSemanticTokens(), autocompletion({ override: [asm.asmLspComplete] }), asm.asmLspHover];
  }
  return [];
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
  /** Per-line bank label for banked builds (ADR-0014), keyed by 1-based line.
   *  A banked source line shows its bank as a dim suffix on the addr gutter
   *  (`4000 b3`). Empty/absent for flat builds. */
  lineBanks?: Map<number, string>;
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
  /** Active project toolchain id (`manifest.toolchain`) — selects the assembly
   *  LSP dialect (mads / ca65 / z80asm) for opcode/label hover + completion. */
  toolchainId?: string;
  // Bundle line + tick so jumping to the same line twice still retriggers the effect.
  gotoTarget?: { line: number; tick: number } | null;
  onToggleBreakpoint?: (line: number) => void;
  onViewReady?: (view: EditorView | null) => void;
  onJumpToLabel?: (name: string) => void;
  /** Resolved C go-to-definition target (Ctrl/Cmd+click on a C identifier, #73).
   *  App navigates: project file → editor jump, sysroot header → system viewer. */
  onGoToDefinition?: (target: DefinitionTarget) => void;
  /** Find-references results for the C identifier at the cursor (Shift+F12, #74).
   *  App shows them in the sidebar. */
  onFindReferences?: (symbol: string, refs: ReferenceLocation[]) => void;
  /** Rename request for the C identifier at the cursor (F2, #75). App prompts
   *  for the new name + applies the LSP edits. `pos` is the cursor offset. */
  onRequestRename?: (pos: number, symbol: string) => void;
  onCursorLine?: (line: number) => void;
}

export function Editor({ value, onChange, filename, pcLine, breakpointLines, lineAddrs, lineBanks, equateValues, diagnostics, projectLabels, tabWidth, cFormatStyle, cpuLanguage, toolchainLanguage, machine, toolchainId, gotoTarget, onToggleBreakpoint, onViewReady, onJumpToLabel, onGoToDefinition, onFindReferences, onRequestRename, onCursorLine }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Latest-callback refs so the CodeMirror handlers (built once on mount) always
  // call the current props without rebuilding the editor. Updated in an effect,
  // not during render, to stay Rules-of-React clean (#28) — CM events only fire
  // after commit, so the refs are always current by the time they're read.
  const onChangeRef = useRef(onChange);
  const onToggleRef = useRef(onToggleBreakpoint);
  const onJumpRef = useRef(onJumpToLabel);
  const onGoToDefRef = useRef(onGoToDefinition);
  const onFindRefsRef = useRef(onFindReferences);
  const onRequestRenameRef = useRef(onRequestRename);
  const onCursorLineRef = useRef(onCursorLine);
  // Same latest-value refs for the data the format-on-save handler needs — the
  // keymap is built once on mount but must format the *current* file/style.
  const filenameRef = useRef(filename);
  const cFormatStyleRef = useRef(cFormatStyle);
  const tabWidthRef = useRef(tabWidth);
  // The active asm LSP dialect (or undefined), so the once-built nav handlers can
  // route asm files to the language server (#140).
  const asmDialectRef = useRef(asmDialectFor(toolchainId));
  useEffect(() => {
    onChangeRef.current = onChange;
    onToggleRef.current = onToggleBreakpoint;
    onJumpRef.current = onJumpToLabel;
    onGoToDefRef.current = onGoToDefinition;
    onFindRefsRef.current = onFindReferences;
    onRequestRenameRef.current = onRequestRename;
    onCursorLineRef.current = onCursorLine;
    filenameRef.current = filename;
    cFormatStyleRef.current = cFormatStyle;
    tabWidthRef.current = tabWidth;
    asmDialectRef.current = asmDialectFor(toolchainId);
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
            const banks = view.state.field(lineBanksField);
            const values = view.state.field(equateValuesField);
            if (addrs.size === 0 && values.size === 0) return RangeSet.empty;
            const ranges: Range<GutterMarker>[] = [];
            const doc = view.state.doc;
            for (const [line, addr] of addrs) {
              if (line < 1 || line > doc.lines) continue;
              ranges.push(new AddrMarker(toHex4(addr), banks.get(line)).range(doc.line(line).from));
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
        syntaxHighlighting(editorHighlight),
        bpField,
        lineAddrsField,
        lineBanksField,
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
            // C sources resolve via the LSP (position-based go-to-definition,
            // cross-file, #73); asm keeps the name-based label jump.
            if (isCFile(filenameRef.current)) {
              e.preventDefault();
              const doc = view.state.doc;
              void import("../../codemirror/lsp/client").then(({ cLspDefinition }) =>
                cLspDefinition(doc, pos).then((target) => {
                  if (target) onGoToDefRef.current?.(target);
                }),
              );
              return true;
            }
            // Asm sources resolve via the asm LSP (position-based, cross-file,
            // #140), falling back to the name-based label jump on a miss.
            if (asmDialectRef.current) {
              e.preventDefault();
              const doc = view.state.doc;
              void import("../../codemirror/lsp/asm-client").then(({ asmDefinition }) =>
                asmDefinition(doc, pos).then((target) => {
                  if (target) { onGoToDefRef.current?.(target); return; }
                  const w = view.state.wordAt(pos);
                  if (w) onJumpRef.current?.(view.state.doc.sliceString(w.from, w.to));
                }),
              );
              return true;
            }
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
          // Find all references for the C identifier at the cursor (#74, VS Code
          // parity). App surfaces the results in the sidebar.
          { key: "Shift-F12", preventDefault: true, run: (view) => {
            const isC = isCFile(filenameRef.current);
            if (!isC && !asmDialectRef.current) return false;
            const pos = view.state.selection.main.head;
            const word = view.state.wordAt(pos);
            if (!word) return true;
            const symbol = view.state.doc.sliceString(word.from, word.to);
            const doc = view.state.doc;
            if (isC) {
              void import("../../codemirror/lsp/client").then(({ cReferences }) =>
                cReferences(doc, pos).then((refs) => onFindRefsRef.current?.(symbol, refs)));
            } else {
              void import("../../codemirror/lsp/asm-client").then(({ asmReferences }) =>
                asmReferences(doc, pos).then((refs) => onFindRefsRef.current?.(symbol, refs)));
            }
            return true;
          } },
          // Rename symbol (#75, VS Code parity) — App prompts + applies the LSP
          // edits across files.
          { key: "F2", preventDefault: true, run: (view) => {
            if (!isCFile(filenameRef.current) && !asmDialectRef.current) return false;
            const pos = view.state.selection.main.head;
            const word = view.state.wordAt(pos);
            if (!word) return true;
            const symbol = view.state.doc.sliceString(word.from, word.to);
            if (!/^[A-Za-z_@?.][\w@?.]*$/.test(symbol)) return true;
            onRequestRenameRef.current?.(pos, symbol);
            return true;
          } },
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
        editorTheme,
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
        setLineBanks.of(new Map()),
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
    void loadLanguagePack(filename, cpuLanguage, toolchainLanguage, machine, toolchainId).then((exts) => {
      if (cancelled || viewRef.current !== view) return;
      view.dispatch({ effects: languageCompartment.reconfigure(exts) });
    });
    return () => { cancelled = true; };
  }, [filename, cpuLanguage, toolchainLanguage, machine, toolchainId]);

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
    view.dispatch({ effects: setLineBanks.of(lineBanks ?? new Map()) });
  }, [lineBanks]);

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
