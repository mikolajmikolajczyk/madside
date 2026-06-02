import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { MenuBar } from "./components/layout/MenuBar";
import { DebugBar } from "./components/layout/DebugBar";
import { StatusBar } from "./components/layout/StatusBar";
import { Explorer } from "./components/project/Explorer";
import { Splitter } from "./components/layout/Splitter";
const Editor = lazy(() => import("./components/editor/Editor").then((m) => ({ default: m.Editor })));
const AssetPanel = lazy(() => import("./components/asset/AssetPanel").then((m) => ({ default: m.AssetPanel })));
const HistoryDialog = lazy(() => import("./components/history/HistoryDialog").then((m) => ({ default: m.HistoryDialog })));
const PluginEditor = lazy(() => import("./components/editor/PluginEditor").then((m) => ({ default: m.PluginEditor })));
import { Emulator } from "./components/debug/Emulator";
import { Debug } from "./components/debug/Debug";
import { Output } from "./components/debug/Output";
import { TooltipProvider } from "./components/ui/Tooltip";
import { TextPromptDialog, ConfirmDialog } from "./components/ui/Dialog";
import { useProject } from "./lib/store";
import { assemble, type AssembleResult, type SourceFile } from "./lib/mads";
import { runRecipes } from "./lib/converters/recipeEngine";
import type { CpuRegs } from "./lib/emu";
import { parseSourceMap } from "./lib/sourceMap";
import { parseLabFile } from "./lib/labParser";
import { MADS_DIRECTIVES, MADS_OPCODES, type LabelInfo } from "./lib/madsLang";
import { buildEditorRegistry, resolveEditorId } from "./lib/editors/registry";
import type { EditorModule } from "./lib/editors/types";
import "./App.css";

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

const ASSET_EXTENSIONS = new Set([
  "png","jpg","jpeg","gif","bmp",
  "csv","bin","raw","tmx","wav",
]);

function isAssetPath(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return false;
  return ASSET_EXTENSIONS.has(path.slice(dot + 1).toLowerCase());
}

function extOf(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "";
  return path.slice(dot + 1).toLowerCase();
}

// Pull a short body preview starting at the label's declaration line.
// Stops at the next top-level label or after MAX lines, whichever first.
function extractPreview(content: string, startLine: number, max = 10): string {
  const lines = content.split(/\r?\n/);
  if (startLine < 1 || startLine > lines.length) return "";
  const out: string[] = [];
  for (let i = startLine - 1; i < lines.length && out.length < max; i++) {
    const ln = lines[i];
    if (out.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*/.test(ln)) break;
    out.push(ln);
  }
  return out.join("\n").trimEnd();
}

// Read `;` comment lines immediately above the declaration as a doc block.
// Stops at the first blank or non-comment line.
function extractDoc(content: string, startLine: number): string {
  const lines = content.split(/\r?\n/);
  if (startLine < 2) return "";
  const out: string[] = [];
  for (let i = startLine - 2; i >= 0; i--) {
    const stripped = lines[i].replace(/^\s+/, "");
    if (stripped.startsWith(";")) {
      out.unshift(stripped.replace(/^;+\s?/, ""));
      continue;
    }
    break;
  }
  return out.join("\n");
}

// Scan a single source buffer for label declarations (column-0 identifiers
// that aren't opcodes/directives). Mutates `out` in place. First definition
// wins on collisions.
function scanFileLabels(content: string, base: string, out: Map<string, LabelInfo>) {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\b/.exec(lines[i]);
    if (!m) continue;
    const name = m[1];
    const upper = name.toUpperCase();
    if (MADS_OPCODES.has(upper) || MADS_DIRECTIVES.has(upper)) continue;
    if (out.has(name)) continue;
    const lineNo = i + 1;
    const info: LabelInfo = {
      file: base,
      line: lineNo,
      preview: extractPreview(content, lineNo),
    };
    const doc = extractDoc(content, lineNo);
    if (doc) info.doc = doc;
    out.set(name, info);
  }
}

export default function App() {
  const project = useProject();

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AssembleResult | null>(null);
  const [loadedXex, setLoadedXex] = useState<Uint8Array | null>(null);
  const [running, setRunning] = useState(false);
  const [stepTick, setStepTick] = useState(0);
  const [frameTick, setFrameTick] = useState(0);
  const [cpu, setCpu] = useState<CpuRegs | null>(null);
  const [mem, setMem] = useState<Uint8Array | null>(null);
  const [memBase, setMemBase] = useState(0x2000);
  const [memBaseTouched, setMemBaseTouched] = useState(false);
  const [brokeOn, setBrokeOn] = useState<number | null>(null);
  const [cursorLine, setCursorLine] = useState<number | null>(null);

  const editorViewRef = useRef<EditorView | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const xex = result?.xex;
    if (!xex || xex.length < 6 || memBaseTouched) return;
    if (xex[0] === 0xff && xex[1] === 0xff) setMemBase(xex[2] | (xex[3] << 8));
  }, [result, memBaseTouched]);


  const onMemBaseChange = useCallback((addr: number) => {
    setMemBaseTouched(true);
    setMemBase(addr);
  }, []);

  const projectId = project.loaded ? project.projectId : null;
  useEffect(() => {
    setRunning(false);
    setResult(null);
    setLoadedXex(null);
    setCpu(null);
    setMem(null);
    setMemBaseTouched(false);
    setStepTick(0);
    setFrameTick(0);
    setBrokeOn(null);
  }, [projectId]);

  const bpLinesByFile = project.loaded ? project.breakpoints : new Map<string, Set<number>>();

  const sourceMap = useMemo(
    () => (result?.lst ? parseSourceMap(result.lst) : null),
    [result?.lst],
  );

  // Build label info from two sources:
  //  1. Scan source files for column-0 label declarations → file, line,
  //     doc-comments above, preview body. Works even without `.lab` (e.g.,
  //     before first successful assemble, or for locals that MADS omits).
  //  2. `.lab` dump from the last assemble → addresses. Augments scanned
  //     entries and contributes addr-only equates (e.g., from atari.a65).
  const projectLabels = useMemo<Map<string, LabelInfo>>(() => {
    const out = new Map<string, LabelInfo>();
    if (project.loaded) {
      const dec = new TextDecoder();
      for (const f of project.files) {
        if (!/\.(a65|asm|inc|s|mac)$/i.test(f.path)) continue;
        const base = basename(f.path);
        scanFileLabels(dec.decode(f.content), base, out);
      }
    }
    if (result?.lab) {
      const raw = parseLabFile(result.lab);
      for (const [name, addr] of raw) {
        const existing = out.get(name);
        if (existing) { existing.addr = addr; continue; }
        const info: LabelInfo = { addr };
        const loc = sourceMap?.addrToLoc.get(addr);
        if (loc) { info.file = loc.file; info.line = loc.line; }
        out.set(name, info);
      }
    }
    return out;
  }, [project, result?.lab, sourceMap]);

  // Editor plugin registry — rebuilt when files under `editors/` change.
  // Depend on stable file/path slices, not the whole `project` object (which
  // re-refs on every cpu/mem update and would trigger an infinite reload loop).
  const editorProjectFiles = project.loaded ? project.files : null;
  const projectActivePath = project.loaded ? project.active.path : null;
  const manifestEditors = project.loaded ? project.manifest.editors : undefined;

  const editorSources = useMemo(() => {
    if (!editorProjectFiles) return [] as { path: string; content: string }[];
    const dec = new TextDecoder();
    return editorProjectFiles
      .filter((f) => /^editors\/[^/]+\.js$/.test(f.path))
      .map((f) => ({ path: f.path, content: dec.decode(f.content) }));
  }, [editorProjectFiles]);

  // Stable key over editorSources so the effect only re-runs on actual change.
  const editorSourcesKey = useMemo(
    () => editorSources.map((s) => `${s.path}:${s.content.length}`).join("|"),
    [editorSources],
  );

  const [editorRegistry, setEditorRegistry] = useState<Map<string, EditorModule>>(new Map());
  useEffect(() => {
    let cancelled = false;
    void buildEditorRegistry(editorSources).then((reg) => {
      if (!cancelled) setEditorRegistry(reg);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorSourcesKey]);

  const activeEditorModule = useMemo<EditorModule | null>(() => {
    if (!projectActivePath || editorRegistry.size === 0) return null;
    const ext = extOf(projectActivePath);
    if (!ext) return null;
    const id = resolveEditorId(editorRegistry, manifestEditors, ext);
    return id ? editorRegistry.get(id) ?? null : null;
  }, [editorRegistry, projectActivePath, manifestEditors]);

  // Snapshot of other project files passed to plugin editors (read-only at mount).
  const pluginAssets = useMemo(() => {
    if (!editorProjectFiles || !projectActivePath) return [] as { path: string; bytes: Uint8Array }[];
    return editorProjectFiles
      .filter((f) => f.path !== projectActivePath)
      .map((f) => ({ path: f.path, bytes: f.content }));
  }, [editorProjectFiles, projectActivePath]);

  // Pending cursor target after a Ctrl-click jump. We bundle line + tick into one
  // object so the Editor's effect retriggers even when re-jumping to the same line.
  const [gotoTarget, setGotoTarget] = useState<{ line: number; tick: number } | null>(null);

  const onJumpToLabel = useCallback((name: string) => {
    if (!project.loaded) return;
    const info = projectLabels.get(name);
    if (!info) return;
    // Prefer scanned file/line; fall back to sourceMap-resolved addr.
    let targetFile = info.file;
    let targetLine = info.line;
    if ((targetFile == null || targetLine == null) && sourceMap && info.addr != null) {
      const loc = sourceMap.addrToLoc.get(info.addr);
      if (loc) { targetFile = loc.file; targetLine = loc.line; }
    }
    if (!targetFile || targetLine == null) return;
    const target = project.files.find((f) => f.path.endsWith("/" + targetFile) || f.path === targetFile);
    if (target && target.path !== project.activePath) {
      project.setActivePath(target.path);
    }
    setGotoTarget((prev) => ({ line: targetLine, tick: (prev?.tick ?? 0) + 1 }));
  }, [sourceMap, projectLabels, project]);

  const breakpoints = useMemo(() => {
    const addrs = new Set<number>();
    if (!sourceMap) return addrs;
    for (const [file, lines] of bpLinesByFile) {
      const fileMap = sourceMap.locToAddr.get(basename(file));
      if (!fileMap) continue;
      let sorted: number[] | null = null;
      for (const line of lines) {
        let addr = fileMap.get(line);
        if (addr == null) {
          if (!sorted) sorted = [...fileMap.keys()].sort((a, b) => a - b);
          const next = sorted.find((l) => l > line);
          if (next != null) addr = fileMap.get(next);
        }
        if (addr != null) addrs.add(addr);
      }
    }
    console.log("[App] breakpoints addrs =", [...addrs].map(a => "$" + a.toString(16).padStart(4, "0")),
      "from lines:", Object.fromEntries([...bpLinesByFile].map(([f, ls]) => [f, [...ls]])),
      "sourceMap files:", sourceMap ? [...sourceMap.locToAddr.keys()] : null);
    return addrs;
  }, [sourceMap, bpLinesByFile]);

  const activePath = project.loaded ? project.activePath : "";
  const activeBase = basename(activePath);

  // Bytes emitted by the cursor's current source line. MADS .lst only
  // lists the first few bytes per source line for `dta` etc., so neither
  // addrToLoc (per-byte map) nor locToAddr (line-start map) alone covers
  // the full range — combine both.
  const cursorHighlight = useMemo<{ start: number; len: number } | null>(() => {
    if (!sourceMap || cursorLine == null) return null;
    const fileMap = sourceMap.locToAddr.get(activeBase);
    if (!fileMap) return null;
    const entries = [...fileMap.entries()].sort((a, b) => a[0] - b[0]);
    const idx = entries.findIndex(([line]) => line >= cursorLine);
    if (idx < 0) return null;
    if (entries[idx][0] !== cursorLine && idx === 0) return null;
    const cur = entries[idx];
    const next = entries[idx + 1];
    const start = cur[1];
    // (1) span derived from per-byte map (works when addrToLoc has them).
    let countFromMap = 0;
    for (const [addr, loc] of sourceMap.addrToLoc) {
      if (loc.file === activeBase && loc.line === cur[0] &&
          addr >= start && addr - start < 256) countFromMap++;
    }
    // (2) span up to next emitting line (works for multi-byte data
    //     even when MADS truncated the .lst byte list).
    const countFromNext = next ? next[1] - start : 0;
    const len = Math.max(1, countFromMap, countFromNext);
    return { start, len };
  }, [sourceMap, cursorLine, activeBase]);

  // Auto-follow editor cursor → memory base. Disabled once the user
  // manually edits the base (memBaseTouched).
  useEffect(() => {
    if (memBaseTouched || cursorHighlight == null) return;
    setMemBase(cursorHighlight.start & 0xff80);   // align to 128-byte page
  }, [cursorHighlight, memBaseTouched]);

  const pcLine = useMemo(() => {
    // During run the PC moves too fast to track in the editor — hide
    // the marker. It reappears on pause / step / BP hit.
    if (running) return null;
    if (!sourceMap || !cpu) return null;
    const loc = sourceMap.addrToLoc.get(cpu.pc & 0xffff);
    if (!loc) return null;
    return loc.file === activeBase ? loc.line : null;
  }, [sourceMap, cpu, activeBase, running]);

  // Follow PC into included files: when the emulator is paused/stepping and
  // the next op lives in a different source file, switch the active editor
  // tab to that file so the highlighted line is visible.
  const projectFilesRef = project.loaded ? project.files : null;
  const setActivePathFn = project.loaded ? project.setActivePath : null;
  useEffect(() => {
    if (running || !cpu || !sourceMap || !projectFilesRef || !setActivePathFn) return;
    const loc = sourceMap.addrToLoc.get(cpu.pc & 0xffff);
    if (!loc) return;
    if (loc.file === activeBase) return;
    const target = projectFilesRef.find((f) => f.path.endsWith("/" + loc.file) || f.path === loc.file);
    if (target && target.path !== activePath) setActivePathFn(target.path);
  }, [running, cpu, sourceMap, activeBase, activePath, projectFilesRef, setActivePathFn]);

  const breakpointLines = useMemo(() => {
    return bpLinesByFile.get(activePath) ?? new Set<number>();
  }, [bpLinesByFile, activePath]);

  const lineAddrs = useMemo(() => {
    return sourceMap?.locToAddr.get(activeBase) ?? new Map<number, number>();
  }, [sourceMap, activeBase]);

  const toggleBpRef = useRef<((path: string, line: number) => void) | null>(null);
  toggleBpRef.current = project.loaded ? project.toggleBreakpoint : null;
  const onToggleBreakpoint = useCallback((line: number) => {
    toggleBpRef.current?.(activePath, line);
  }, [activePath]);

  const assembleSeqRef = useRef(0);
  const projectFiles = project.loaded ? project.files : null;
  const projectMain = project.loaded ? project.manifest.main : null;
  const projectRecipes = project.loaded ? project.manifest.recipes : null;
  const projectIdForBuild = project.loaded ? project.projectId : null;

  const runAssemble = useCallback(async (): Promise<AssembleResult | null> => {
    if (!projectFiles || !projectMain || !projectIdForBuild) return null;
    const seq = ++assembleSeqRef.current;
    setBusy(true);
    try {
      let augmented: SourceFile[] = projectFiles.map((f) => ({ path: f.path, content: f.content }));
      let recipeStderr = "";
      if (projectRecipes && projectRecipes.length > 0) {
        const results = await runRecipes(projectIdForBuild, projectRecipes, projectFiles);
        // Overlay freshly-generated outputs so the assembler sees them this
        // build even before the file store reload settles.
        const generatedByPath = new Map<string, Uint8Array>();
        for (const r of results) {
          if (r.output) generatedByPath.set(r.output.path, r.output.bytes);
          if (!r.ok) recipeStderr += `[recipe] ${r.recipe.converter} (${r.recipe.input} → ${r.recipe.output}): ${r.error}\n`;
        }
        if (generatedByPath.size > 0) {
          const overlaid: SourceFile[] = [];
          const seen = new Set<string>();
          for (const f of augmented) {
            if (generatedByPath.has(f.path)) {
              overlaid.push({ path: f.path, content: generatedByPath.get(f.path)! });
              seen.add(f.path);
            } else {
              overlaid.push(f);
            }
          }
          for (const [path, bytes] of generatedByPath) {
            if (!seen.has(path)) overlaid.push({ path, content: bytes });
          }
          augmented = overlaid;
        }
      }
      console.log("[App] runAssemble: calling assemble main=", projectMain);
      const r = await assemble(projectMain, augmented, ["-i:."]);
      console.log("[App] runAssemble: assemble returned ok=", r.ok, "xex=", r.xex?.length, "stderr=", r.stderr?.slice(0, 200));
      if (seq === assembleSeqRef.current) {
        if (recipeStderr) r.stderr = recipeStderr + r.stderr;
        setResult(r);
        console.log("[App] runAssemble: setResult committed");
      } else {
        console.log("[App] runAssemble: seq stale, drop");
      }
      return r;
    } catch (e) {
      console.error("[App] runAssemble: caught", e);
      const r: AssembleResult = {
        ok: false, stdout: "", stderr: `[runtime] ${String(e)}`, exitCode: 1,
      };
      if (seq === assembleSeqRef.current) setResult(r);
      return r;
    } finally {
      if (seq === assembleSeqRef.current) setBusy(false);
    }
  }, [projectFiles, projectMain, projectRecipes, projectIdForBuild]);

  useEffect(() => {
    const id = setTimeout(() => { runAssemble(); }, 400);
    return () => clearTimeout(id);
  }, [runAssemble]);

  const onRun = useCallback(async () => {
    console.log("[App] onRun start, result.ok =", result?.ok, "xex bytes =", result?.xex?.length);
    let r = result;
    if (!r) r = await runAssemble();
    if (!r?.ok || !r.xex) { console.log("[App] onRun bail: no ok/xex"); return; }
    console.log("[App] onRun setLoadedXex + running");
    setLoadedXex(r.xex);
    setBrokeOn(null);
    setRunning(true);
  }, [result, runAssemble]);

  const onPause = useCallback(() => setRunning(false), []);
  const onStep = useCallback(() => setStepTick((t) => t + 1), []);
  const onStepFrame = useCallback(() => setFrameTick((t) => t + 1), []);
  const onBreak = useCallback(() => {
    setRunning(false);
    setBrokeOn(null);
  }, []);

  const onStop = useCallback(() => {
    // Unload the emulator: drop xex from the running side so the next Run
    // boots fresh. result + addr gutter + sourceMap stay (those reflect
    // the build, not the emu).
    setRunning(false);
    setLoadedXex(null);
    setCpu(null);
    setMem(null);
    setBrokeOn(null);
    setStepTick(0);
    setFrameTick(0);
  }, []);

  const onReset = useCallback(async () => {
    const wasRunning = running;
    setRunning(false);
    setLoadedXex(null);
    setCpu(null);
    setMem(null);
    setMemBaseTouched(false);
    setStepTick(0);
    setFrameTick(0);
    setBrokeOn(null);
    const r = await runAssemble();
    // If emu was active, restart from the top so Reset acts like "restart".
    if (wasRunning && r?.ok && r.xex) {
      setLoadedXex(r.xex);
      setRunning(true);
    }
  }, [running, runAssemble]);

  // Modal-based dialogs (Radix Dialog) replace native prompt/confirm.
  type DialogKind = "none" | "newProject" | "renameProject" | "duplicateProject" | "deleteProject";
  const [dialog, setDialog] = useState<DialogKind>("none");
  const closeDialog = useCallback(() => setDialog("none"), []);

  const handleNewProject = useCallback(() => setDialog("newProject"), []);
  const handleRenameProject = useCallback(() => setDialog("renameProject"), []);
  const handleDuplicateProject = useCallback(() => setDialog("duplicateProject"), []);
  const handleDeleteProject = useCallback(() => setDialog("deleteProject"), []);

  const handleExportZip = useCallback(async () => {
    if (!project.loaded) return;
    const bytes = await project.exportProject();
    if (!bytes) return;
    const name = project.manifest.name;
    const blob = new Blob([bytes as BlobPart], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${name}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }, [project]);

  const handleImportZip = useCallback(() => {
    importFileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !project.loaded) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    const fallback = file.name.replace(/\.zip$/i, "") || "imported";
    try {
      await project.importProject(buf, fallback);
    } catch (err) {
      alert(`import failed: ${String(err)}`);
    }
  }, [project]);

  const handleSwitchProject = useCallback(async (id: string) => {
    if (!project.loaded) return;
    await project.switchProject(id);
  }, [project]);

  const [historyOpen, setHistoryOpen] = useState(false);

  // Resizable side panels. Persist widths to localStorage so they survive reloads.
  const [explorerW, setExplorerW] = useState(() => {
    const raw = Number(localStorage.getItem("splitter.explorer"));
    return raw > 0 ? raw : 220;
  });
  const [sideW, setSideW] = useState(() => {
    const raw = Number(localStorage.getItem("splitter.side"));
    return raw > 0 ? raw : 480;
  });
  useEffect(() => { localStorage.setItem("splitter.explorer", String(explorerW)); }, [explorerW]);
  useEffect(() => { localStorage.setItem("splitter.side", String(sideW)); }, [sideW]);
  const clampExplorer = (n: number) => Math.max(140, Math.min(560, n));
  const clampSide     = (n: number) => Math.max(320, Math.min(900, n));

  const handleSnapshotNow = useCallback(() => {
    if (!project.loaded) return;
    void project.createSnapshotNow("manual");
  }, [project]);

  // Edit menu — undo/redo dispatch into the editor view if available.
  // @codemirror/commands lazy-loaded to keep it out of the initial bundle.
  const onUndo = useCallback(async () => {
    const v = editorViewRef.current;
    if (!v) return;
    const { undo } = await import("@codemirror/commands");
    v.focus(); undo(v);
  }, []);
  const onRedo = useCallback(async () => {
    const v = editorViewRef.current;
    if (!v) return;
    const { redo } = await import("@codemirror/commands");
    v.focus(); redo(v);
  }, []);

  const canRun = !!result?.ok || !!loadedXex;
  console.log("[App] render canRun =", canRun, "running =", running, "result.ok =", result?.ok, "result.xex =", result?.xex?.length, "loadedXex =", loadedXex?.length);

  const toggleBpAtCursor = useCallback(() => {
    const v = editorViewRef.current;
    if (!v) return;
    const line = v.state.doc.lineAt(v.state.selection.main.head).number;
    onToggleBreakpoint(line);
  }, [onToggleBreakpoint]);

  // Global keyboard shortcuts (window-level so they work outside the editor).
  // Mix of Ctrl+letter (madside originals) and VSCode-style F-keys for debugging.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const k = e.key.toLowerCase();

      // Ctrl-letter set
      if (mod && shift && k === "r") { e.preventDefault(); void onReset(); return; }
      if (mod && shift && k === "b") { e.preventDefault(); void runAssemble(); return; }
      if (mod && !shift && k === "s") {
        e.preventDefault();
        void runAssemble();
        if (project.loaded) void project.createSnapshotNow("manual");
        return;
      }
      if (mod && !shift && k === "b") { e.preventDefault(); void runAssemble(); return; }
      if (mod && !shift && k === "r") { e.preventDefault(); if (canRun && !running) void onRun(); return; }
      if (mod && !shift && k === "p") { e.preventDefault(); if (running) onPause(); return; }

      // VSCode-style debugger keys
      if (mod && shift && e.key === "F5") { e.preventDefault(); void onReset(); return; }   // Ctrl+Shift+F5 = Restart
      if (!mod && e.key === "F5") {
        e.preventDefault();
        if (shift) { onStop(); return; }                       // Shift+F5 = Stop
        if (canRun && !running) void onRun();                  // F5 = Run/Continue
        return;
      }
      if (!mod && e.key === "F6") { e.preventDefault(); if (running) onPause(); return; }
      if (!mod && e.key === "F9") { e.preventDefault(); toggleBpAtCursor(); return; }
      if (!mod && e.key === "F10") { e.preventDefault(); if (!running) onStep(); return; }
      if (!mod && e.key === "F11") { e.preventDefault(); if (!running) onStepFrame(); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runAssemble, onRun, onPause, onStop, onStep, onStepFrame, onReset, canRun, running, toggleBpAtCursor]);

  if (!project.loaded) {
    return (
      <div className="app app--loading">
        <div className="app__loading">
          {project.error ? `storage error: ${project.error}` : "loading project…"}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={100}>
    <div className="app">
      <MenuBar
        projects={project.projects}
        activeProjectId={project.projectId}
        activeProjectName={project.manifest.name}
        onNewProject={handleNewProject}
        onSwitchProject={handleSwitchProject}
        onRenameProject={handleRenameProject}
        onDuplicateProject={handleDuplicateProject}
        onDeleteProject={handleDeleteProject}
        onExportZip={handleExportZip}
        onImportZip={handleImportZip}
        onAssemble={runAssemble}
        onRun={onRun}
        onPause={onPause}
        onStop={onStop}
        onStep={onStep}
        onFrame={onStepFrame}
        onReset={onReset}
        canRun={canRun}
        running={running}
        busy={busy}
        onUndo={onUndo}
        onRedo={onRedo}
        onToggleBp={toggleBpAtCursor}
        onClearBp={project.clearAllBreakpoints}
        onSnapshotNow={handleSnapshotNow}
        onOpenHistory={() => setHistoryOpen(true)}
      />
      <input
        ref={importFileInputRef}
        type="file"
        accept=".zip,application/zip"
        style={{ display: "none" }}
        onChange={handleImportFile}
      />
      <DebugBar
        canRun={canRun}
        running={running}
        busy={busy}
        hasEmu={!!loadedXex}
        onAssemble={runAssemble}
        onRun={onRun}
        onPause={onPause}
        onStop={onStop}
        onStep={onStep}
        onFrame={onStepFrame}
        onReset={onReset}
        onToggleBp={toggleBpAtCursor}
      />
      <div
        className="app__body"
        style={{ "--explorer-w": explorerW + "px", "--side-w": sideW + "px" } as React.CSSProperties}
      >
        <Explorer
          files={project.files}
          active={project.activePath}
          mainPath={project.manifest.main}
          onSelect={project.setActivePath}
          onCreateFile={project.createFile}
          onCreateFolder={project.createFolder}
          onRenameFile={project.renameFile}
          onRenameFolder={project.renameFolder}
          onDeleteFile={project.deleteFile}
          onDeleteFolder={project.deleteFolder}
          onDuplicateFile={project.duplicateFile}
          onSetMain={project.setMainFile}
        />
        <Splitter onResize={(dx) => setExplorerW((w) => clampExplorer(w + dx))} />
        <main className="app__main">
          {activeEditorModule ? (
            <Suspense fallback={<div className="app__loading">loading editor…</div>}>
              <PluginEditor
                module={activeEditorModule}
                path={project.active.path}
                value={project.active.content}
                onChange={project.updateActive}
                assets={pluginAssets}
              />
            </Suspense>
          ) : isAssetPath(project.active.path) ? (
            <Suspense fallback={<div className="app__loading">loading panel…</div>}>
              <AssetPanel
                filename={project.active.path}
                bytes={project.active.content}
                files={project.files}
                manifest={project.manifest}
                onUpdateManifest={project.updateManifest}
                onForceBuild={() => { void runAssemble(); }}
              />
            </Suspense>
          ) : (
            <Suspense fallback={<div className="app__loading">loading editor…</div>}>
              <Editor
                value={new TextDecoder().decode(project.active.content)}
                onChange={project.updateActive}
                filename={project.active.path}
                pcLine={pcLine}
                breakpointLines={breakpointLines}
                lineAddrs={lineAddrs}
                projectLabels={projectLabels}
                gotoTarget={gotoTarget}
                onToggleBreakpoint={onToggleBreakpoint}
                onSave={runAssemble}
                onViewReady={(v) => { editorViewRef.current = v; }}
                onJumpToLabel={onJumpToLabel}
                onCursorLine={setCursorLine}
              />
            </Suspense>
          )}
          <Output
            stdout={result?.stdout ?? ""}
            stderr={result?.stderr ?? ""}
            ok={result ? result.ok : null}
          />
        </main>
        <Splitter invert onResize={(dx) => setSideW((w) => clampSide(w + dx))} />
        <aside className="app__side">
          <Emulator
            xex={loadedXex}
            running={running}
            stepTick={stepTick}
            frameTick={frameTick}
            breakpoints={breakpoints}
            memBase={memBase}
            memLen={128}
            onState={setCpu}
            onMem={setMem}
            onBreak={onBreak}
          />
          <Debug
            state={cpu ?? undefined}
            memory={mem ?? undefined}
            memoryBase={memBase}
            onMemoryBaseChange={onMemBaseChange}
            highlightStart={cursorHighlight?.start}
            highlightLen={cursorHighlight?.len}
          />
        </aside>
      </div>
      <StatusBar
        projectName={project.manifest.name}
        activePath={project.activePath}
        busy={busy}
        result={result ? { ok: result.ok, exitCode: result.exitCode } : null}
        running={running}
        pc={cpu?.pc ?? null}
        brokeOn={brokeOn}
      />

      <TextPromptDialog
        open={dialog === "newProject"}
        title="New project"
        description="Pick a name. A blank src/main.asm gets seeded."
        initial="untitled"
        placeholder="my-project"
        confirmLabel="Create"
        onCancel={closeDialog}
        onConfirm={async (name) => {
          closeDialog();
          if (name.trim()) await project.newProject(name);
        }}
      />
      <TextPromptDialog
        open={dialog === "renameProject"}
        title="Rename project"
        initial={project.manifest.name}
        confirmLabel="Rename"
        onCancel={closeDialog}
        onConfirm={async (name) => {
          closeDialog();
          if (name.trim()) await project.renameProject(name);
        }}
      />
      <TextPromptDialog
        open={dialog === "duplicateProject"}
        title="Duplicate project"
        initial={`${project.manifest.name} (copy)`}
        confirmLabel="Duplicate"
        onCancel={closeDialog}
        onConfirm={async (name) => {
          closeDialog();
          await project.duplicateProject(name);
        }}
      />
      <Suspense fallback={null}>
        <HistoryDialog
          open={historyOpen}
          snapshots={project.snapshots}
          onClose={() => setHistoryOpen(false)}
          onRestore={async (id) => { await project.restoreSnapshot(id); setHistoryOpen(false); }}
          onDelete={async (id) => { await project.deleteSnapshot(id); }}
          onCreateNow={async (s) => { await project.createSnapshotNow(s); }}
        />
      </Suspense>

      <ConfirmDialog
        open={dialog === "deleteProject"}
        title={`Delete "${project.manifest.name}"?`}
        description="This cannot be undone. A blank sandbox is created if this is the last project."
        confirmLabel="Delete"
        danger
        onCancel={closeDialog}
        onConfirm={async () => {
          closeDialog();
          await project.deleteProject();
        }}
      />
    </div>
    </TooltipProvider>
  );
}
