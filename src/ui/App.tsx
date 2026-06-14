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
const ManifestEditor = lazy(() => import("./components/manifest/ManifestEditor").then((m) => ({ default: m.ManifestEditor })));
import { Emulator } from "./components/debug/Emulator";
import { Debug } from "./components/debug/Debug";
import { PanelSlot } from "./components/PanelSlot";
const Welcome = lazy(() => import("./components/Welcome").then((m) => ({ default: m.Welcome })));
const CoursePanel = lazy(() => import("./components/course/CoursePanel").then((m) => ({ default: m.CoursePanel })));
import { TooltipProvider } from "./components/ui/Tooltip";
import { TextPromptDialog, ConfirmDialog, Dialog, DialogContent } from "./components/ui/Dialog";
import { useProject } from "@app/state";
import type { CpuRegs } from "./components/debug/Emulator";
import type { PanelPlugin, ToolchainPlugin } from "@ports";
import { basename, extOf } from "@core/path";
import { getCpuLanguage } from "@core";
import { useSplitterWidth } from "./hooks/useSplitterWidth";
import { useDebuggerShortcuts } from "./hooks/useDebuggerShortcuts";
import { useBreakpointAddrs } from "./hooks/useBreakpointAddrs";
import { useCursorMemory } from "./hooks/useCursorMemory";
import { usePluginEditor } from "./hooks/usePluginEditor";
import { useProjectLabels } from "./hooks/useProjectLabels";
import { useAutoAssemble } from "./hooks/useAutoAssemble";
import { useRunStatus } from "./hooks/useRunStatus";
import { useActiveMachine } from "./hooks/useActiveMachine";
import { useWorkbench } from "@app";
import { getCourse, openLesson, refreshCourseFromGitHub, resetLessonToStarter, runChecks } from "@app";
import type { CheckReport, CheckRunDeps } from "@app";
import type { CourseCheck } from "@app";
import "./App.css";

const ASSET_EXTENSIONS = new Set([
  "png","jpg","jpeg","gif","bmp",
  "csv","bin","raw","tmx","wav",
]);

function isAssetPath(path: string): boolean {
  return ASSET_EXTENSIONS.has(extOf(path));
}

// The manifest gets the visual editor, not the plain text editor. Match by
// filename (project.json), not extension — other .json files stay plain.
function isManifestPath(path: string): boolean {
  return basename(path) === "project.json";
}

// Docs link (mirrors MenuBar). Overridable via VITE_DOCS_URL.
const DOCS_URL =
  (import.meta.env.VITE_DOCS_URL as string | undefined) ??
  (import.meta.env.DEV ? "http://localhost:4321/docs/" : "/docs/");

export default function App() {
  const workbench = useWorkbench();
  const project = useProject(workbench.events);

  // Run lifecycle is owned by RunService (ADR-0007). UI reads via the hook;
  // no parallel React state. `running` + `hasEmu` are derived primitives.
  const runStatus = useRunStatus();
  const machine = useActiveMachine();
  const running = runStatus === 'running';
  const hasEmu = runStatus !== 'idle' && runStatus !== 'crashed';

  // Manifest-driven machine selection (1972a36). When the active project's
  // declared machine changes (load / switch), swap the workbench's active
  // machine — reconfigures the RunService backend + DebugService adapter and
  // re-renders every useActiveMachine() consumer. No-op when unchanged.
  const manifestMachine = project.loaded ? project.manifest.machine : null;
  useEffect(() => {
    if (manifestMachine) workbench.setActiveMachine(manifestMachine);
  }, [manifestMachine, workbench]);
  const [cpu, setCpu] = useState<CpuRegs | null>(null);
  const [memBase, setMemBase] = useState(0x2000);
  const [memBaseTouched, setMemBaseTouched] = useState(false);
  const [brokeOn, setBrokeOn] = useState<number | null>(null);
  const [cursorLine, setCursorLine] = useState<number | null>(null);

  const { result, setResult, busy, runAssemble } = useAutoAssemble({
    buildService: workbench.build,
    files: project.loaded ? project.files : null,
    manifest: project.loaded ? project.manifest : null,
    projectId: project.loaded ? project.projectId : null,
  });

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

  // Full emulator-state wipe. Three call sites all want the same blast:
  // project change, Stop, Reset. Don't try to be clever about a subset.
  // FSM-side: workbench.run.unload() drops media + transitions to 'idle'
  // so the next Run boots from scratch (matches the pre-FSM Stop UX —
  // blank canvas, no last-frame residue).
  const resetEmuState = useCallback((opts?: { keepResult?: boolean; keepMemTouched?: boolean }) => {
    if (workbench.run.status !== 'idle') workbench.run.unload();
    if (!opts?.keepResult) setResult(null);
    setCpu(null);
    if (!opts?.keepMemTouched) setMemBaseTouched(false);
    setBrokeOn(null);
  }, [setResult, workbench]);

  const projectId = project.loaded ? project.projectId : null;
  useEffect(() => {
    resetEmuState();
  }, [projectId, resetEmuState]);

  const bpLinesByFile = project.loaded ? project.breakpoints : new Map<string, Set<number>>();

  const sourceMap = result?.sourceMap ?? null;

  // Editor language is driven by the machine CPU + the project's toolchain
  // (epic 78b12bf) — not hardcoded MADS. Resolve both for the editor +
  // label scanner.
  const cpuLanguage = useMemo(() => getCpuLanguage(machine.cpu), [machine]);
  const toolchainLanguage = useMemo(() => {
    if (!project.loaded) return undefined;
    const tp = workbench.plugins.get('toolchain', project.manifest.toolchain) as ToolchainPlugin | undefined;
    return tp?.language;
  }, [project, workbench]);

  const projectLabels = useProjectLabels(
    project.loaded ? project.files : null,
    result?.labels,
    sourceMap,
    cpuLanguage,
    toolchainLanguage,
  );

  const { activeModule: activeEditorModule, assets: pluginAssets } = usePluginEditor({
    files: project.loaded ? project.files : null,
    activePath: project.loaded ? project.active.path : null,
    manifestEditors: project.loaded ? project.manifest.editors : undefined,
  });

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

  const breakpoints = useBreakpointAddrs(sourceMap, bpLinesByFile);

  const activePath = project.loaded ? project.activePath : "";

  // File switch re-engages auto-follow: when the user opens a different
  // source, they want the memory view to land on that file's emit window.
  useEffect(() => {
    if (activePath) setMemBaseTouched(false);
  }, [activePath]);

  const cursorHighlight = useCursorMemory({
    sourceMap, activePath, cursorLine, memBaseTouched, setMemBase,
  });

  const onResumeFollow = useCallback(() => setMemBaseTouched(false), []);

  // PanelPlugin lookup — manifest.panels (if present) drives the Debug column
  // order; otherwise machine.defaultPanels; otherwise [registers, memory].
  // Output panel is a fixed slot above the editor.
  const allPanels = useMemo(
    () => workbench.plugins.list('panel') as unknown as PanelPlugin[],
    [workbench.plugins],
  );
  const panelById = useMemo(() => {
    const m = new Map<string, PanelPlugin>();
    for (const p of allPanels) m.set(p.id, p);
    return m;
  }, [allPanels]);
  const debugColumnPanelIds = useMemo(() => {
    const manifestPanels = project.loaded ? project.manifest.panels : undefined;
    const fromManifest = manifestPanels?.filter((id) => id !== 'output');
    if (fromManifest && fromManifest.length > 0) return fromManifest;
    const fromMachine = machine.defaultPanels.filter(
      (id) => id !== 'output' && panelById.has(id),
    );
    if (fromMachine.length > 0) return fromMachine;
    return ['registers', 'memory'];
  }, [project, machine, panelById]);
  const debugColumnPanels = useMemo(
    () => debugColumnPanelIds.map((id) => panelById.get(id)).filter((p): p is PanelPlugin => !!p),
    [debugColumnPanelIds, panelById],
  );
  const outputPanel = panelById.get('output');

  // Live cpu + memory bytes flow through ctx.events now (panels self-fetch
  // via DebugService on debug:step-done / debug:bp-hit / run:state). App
  // still owns UI-side state — base addr + highlight + initial output.
  const panelData = useMemo(() => ({
    memory: {
      base: memBase,
      onBaseChange: onMemBaseChange,
      highlightStart: cursorHighlight?.start,
      highlightLen: cursorHighlight?.len,
      following: !memBaseTouched,
      onResumeFollow,
    },
    output: {
      stdout: result?.stdout ?? '',
      stderr: result?.stderr ?? '',
      ok: result ? result.ok : null,
    },
  }), [memBase, onMemBaseChange, cursorHighlight, result, memBaseTouched, onResumeFollow]);

  const pcLine = useMemo(() => {
    // During run the PC moves too fast to track in the editor — hide
    // the marker. It reappears on pause / step / BP hit.
    if (running) return null;
    if (!sourceMap || !cpu) return null;
    const loc = sourceMap.addrToLoc.get(cpu.regs.pc & 0xffff);
    if (!loc) return null;
    return loc.file === activePath ? loc.line : null;
  }, [sourceMap, cpu, activePath, running]);

  // Follow PC into included files: when the emulator is paused/stepping and
  // the next op lives in a different source file, switch the active editor
  // tab to that file so the highlighted line is visible.
  const projectFilesRef = project.loaded ? project.files : null;
  const setActivePathFn = project.loaded ? project.setActivePath : null;
  useEffect(() => {
    if (running || !cpu || !sourceMap || !projectFilesRef || !setActivePathFn) return;
    const loc = sourceMap.addrToLoc.get(cpu.regs.pc & 0xffff);
    if (!loc) return;
    if (loc.file === activePath) return;
    // SourceMap keys are full project paths post-30be0cf — exact-match the
    // file in the project tree, no basename fallback needed.
    const target = projectFilesRef.find((f) => f.path === loc.file);
    if (target && target.path !== activePath) setActivePathFn(target.path);
  }, [running, cpu, sourceMap, activePath, projectFilesRef, setActivePathFn]);

  const breakpointLines = useMemo(() => {
    return bpLinesByFile.get(activePath) ?? new Set<number>();
  }, [bpLinesByFile, activePath]);

  const lineAddrs = useMemo(() => {
    return sourceMap?.locToAddr.get(activePath) ?? new Map<number, number>();
  }, [sourceMap, activePath]);

  const toggleBpRef = useRef<((path: string, line: number) => void) | null>(null);
  toggleBpRef.current = project.loaded ? project.toggleBreakpoint : null;
  const onToggleBreakpoint = useCallback((line: number) => {
    toggleBpRef.current?.(activePath, line);
  }, [activePath]);


  const onRun = useCallback(async () => {
    // Smart Play. After a BP hit / Pause the emu is at 'paused' with the
    // binary still resident — Play resumes from the same PC. Only Stop
    // (which unload()s to 'idle') or a fresh boot forces a re-load.
    const status = workbench.run.status;
    if (status === 'paused' || status === 'loaded') {
      setBrokeOn(null);
      workbench.run.run();
      return;
    }
    let r = result;
    if (!r) r = await runAssemble();
    if (!r?.ok || !r.xex) return;
    const loadResult = await workbench.run.load(r.xex);
    if (!loadResult.ok) return;
    setBrokeOn(null);
    workbench.run.run();
  }, [result, runAssemble, workbench]);

  const onPause = useCallback(() => {
    if (workbench.run.status === 'running') workbench.run.pause();
  }, [workbench]);
  // 1e38ae3: Step + Frame go through DebugService (canonical event path).
  // DebugService.step/stepFrame call the active DebugTarget + emit
  // debug:step-done; Emulator listens + blits the canvas (no more
  // stepTick/frameTick prop drilling).
  const onStep = useCallback(() => { void workbench.debug.step(); }, [workbench]);
  const onStepFrame = useCallback(() => { void workbench.debug.stepFrame(); }, [workbench]);

  // Subscribe to 'debug:bp-hit' from the workbench bus — Emulator.tsx emits
  // it on every BP trap inside the frame loop. Pause via the FSM
  // (ADR-0007); brokeOn is set from the event payload.
  useEffect(() => {
    return workbench.events.on('debug:bp-hit', ({ pc }) => {
      if (workbench.run.status === 'running') workbench.run.pause();
      setBrokeOn(pc);
    });
  }, [workbench]);

  const onStop = useCallback(() => {
    // Unload the emulator: drop xex from the running side so the next Run
    // boots fresh. result + addr gutter + sourceMap stay (those reflect
    // the build, not the emu).
    resetEmuState({ keepResult: true, keepMemTouched: true });
  }, [resetEmuState]);

  const onReset = useCallback(async () => {
    const wasRunning = workbench.run.status === 'running';
    resetEmuState();
    const r = await runAssemble();
    // If emu was active, restart from the top so Reset acts like "restart".
    if (wasRunning && r?.ok && r.xex) {
      const loadResult = await workbench.run.load(r.xex);
      if (loadResult.ok) workbench.run.run();
    }
  }, [runAssemble, resetEmuState, workbench]);

  // Register the user-action surface on the workbench CommandRegistry.
  // Toolbar / menu / shortcut dispatch keeps its existing callbacks for now;
  // future palette UI walks workbench.commands.list() and runs commands by id.
  useEffect(() => {
    const disposers = [
      workbench.commands.register({ id: 'build.assemble', title: 'Build', shortcut: 'Ctrl+B', run: () => { void runAssemble(); } }),
      workbench.commands.register({ id: 'run.start', title: 'Run', shortcut: 'Ctrl+Enter', run: () => { void onRun(); } }),
      workbench.commands.register({ id: 'run.pause', title: 'Pause', shortcut: 'Ctrl+.', run: () => onPause() }),
      workbench.commands.register({ id: 'run.stop', title: 'Stop', shortcut: 'Ctrl+Shift+.', run: () => onStop() }),
      workbench.commands.register({ id: 'debug.step', title: 'Step', shortcut: 'F10', run: () => onStep() }),
      workbench.commands.register({ id: 'debug.frame', title: 'Frame', shortcut: 'F11', run: () => onStepFrame() }),
      workbench.commands.register({ id: 'run.restart', title: 'Restart', shortcut: 'Ctrl+Shift+Enter', run: () => { void onReset(); } }),
    ];
    return () => { for (const d of disposers) d(); };
  }, [workbench, runAssemble, onRun, onPause, onStop, onStep, onStepFrame, onReset]);

  // Modal-based dialogs (Radix Dialog) replace native prompt/confirm.
  type DialogKind = "none" | "renameProject" | "duplicateProject" | "deleteProject";
  const [dialog, setDialog] = useState<DialogKind>("none");
  const closeDialog = useCallback(() => setDialog("none"), []);

  // "New project" returns to the welcome screen (existing projects + empty /
  // templates / courses) instead of a bare name prompt.
  const [showWelcome, setShowWelcome] = useState(false);
  const handleNewProject = useCallback(() => setShowWelcome(true), []);
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
    // project:switched is emitted by useProject's mount effect after the
    // reload settles (ADR-0007 — the store owns its emits).
  }, [project]);

  const handleOpenLesson = useCallback(async (courseId: string, lessonId: string) => {
    if (!project.loaded) return;
    const id = await openLesson(courseId, lessonId);
    await project.switchProject(id);
  }, [project]);

  // Run a lesson's declarative checks: assemble (reusing the auto-assemble
  // pipeline for the binary + label table), then — only if a register/memory
  // check needs it — load + advance frames and snapshot CPU/memory. Disturbs
  // the live emulator (loads the freshly-built binary); the learner re-runs.
  const handleCheck = useCallback(async (checks: CourseCheck[]): Promise<CheckReport> => {
    const deps: CheckRunDeps = {
      assemble: async () => {
        const r = await runAssemble();
        if (!r || !r.ok || !r.xex) {
          return { ok: false, error: (r?.stderr || "assembly failed").split("\n")[0], labels: r?.labels ?? new Map() };
        }
        return { ok: true, labels: r.labels ?? new Map(), binary: r.xex };
      },
      run: async (binary, frames) => {
        if (workbench.run.status !== "idle") workbench.run.unload();
        const loaded = await workbench.run.load(binary);
        if (!loaded.ok) throw new Error(loaded.error.message);
        for (let i = 0; i < frames; i++) await workbench.debug.stepFrame();
        const regs = await workbench.debug.registers();
        return { regs, readMem: (a, l, s) => workbench.debug.readMemory(a, l, s) };
      },
    };
    return runChecks(checks, deps);
  }, [runAssemble, workbench]);

  // Re-fetch a remote course from its repo (preserves learner edits — only the
  // course definition updates; the active lesson project is left as-is).
  const handleRefreshCourse = useCallback(async (courseId: string) => {
    const c = getCourse(courseId);
    if (c?.source.kind !== "github") return;
    await refreshCourseFromGitHub({ owner: c.source.owner, repo: c.source.repo, ref: c.source.ref });
  }, []);

  // Discard a lesson's edits, restoring the (refreshed) starter files, then
  // reload the project so the editor shows them.
  const handleResetLesson = useCallback(async (courseId: string, lessonId: string) => {
    if (!project.loaded) return;
    const id = await resetLessonToStarter(courseId, lessonId);
    if (id) await project.switchProject(id);
  }, [project]);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const [explorerW, setExplorerW] = useSplitterWidth("splitter.explorer", 220);
  const [sideW, setSideW] = useSplitterWidth("splitter.side", 480);
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

  const canRun = !!result?.ok || hasEmu;

  const toggleBpAtCursor = useCallback(() => {
    const v = editorViewRef.current;
    if (!v) return;
    const line = v.state.doc.lineAt(v.state.selection.main.head).number;
    onToggleBreakpoint(line);
  }, [onToggleBreakpoint]);

  useDebuggerShortcuts(
    {
      runAssemble, onRun, onPause, onStop, onStep, onStepFrame, onReset,
      toggleBpAtCursor,
      onSnapshot: () => { if (project.loaded) void project.createSnapshotNow("manual"); },
    },
    { canRun, running, hasEmu },
  );

  if (showWelcome || !project.loaded) {
    if (!project.loaded && project.error) {
      return (
        <div className="app app--loading">
          <div className="app__loading">storage error: {project.error}</div>
        </div>
      );
    }
    if (!project.loaded && !project.booted) {
      return (
        <div className="app app--loading">
          <div className="app__loading">loading project…</div>
        </div>
      );
    }
    // First run / last project deleted, or "New project" from the menu → the
    // welcome hub: existing projects + empty / templates / courses.
    return (
      <Suspense fallback={<div className="app app--loading"><div className="app__loading">loading…</div></div>}>
        <Welcome
          projects={project.projects.map((p) => ({ id: p.id, name: p.name }))}
          onOpen={(id) => { void project.switchProject(id); setShowWelcome(false); }}
        />
      </Suspense>
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
        hasEmu={hasEmu}
        busy={busy}
        onUndo={onUndo}
        onRedo={onRedo}
        onToggleBp={toggleBpAtCursor}
        onClearBp={project.clearAllBreakpoints}
        onSnapshotNow={handleSnapshotNow}
        onOpenHistory={() => setHistoryOpen(true)}
        onAbout={() => setAboutOpen(true)}
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
        hasEmu={hasEmu}
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
        {(() => {
          const explorerEl = (
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
          );
          const course = project.manifest.course;
          if (!course) return explorerEl;
          // Course mode: vertical split — compact Files on top, lesson panel below.
          return (
            <div className="app__explorer-col">
              {explorerEl}
              <Suspense fallback={<div className="app__loading">loading lesson…</div>}>
                <CoursePanel
                  courseId={course.id}
                  lessonId={course.lesson}
                  onOpenLesson={(c, l) => { void handleOpenLesson(c, l); }}
                  onCheck={handleCheck}
                  onRefresh={handleRefreshCourse}
                  onReset={handleResetLesson}
                />
              </Suspense>
            </div>
          );
        })()}
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
          ) : isManifestPath(project.active.path) ? (
            <Suspense fallback={<div className="app__loading">loading editor…</div>}>
              <ManifestEditor
                value={project.active.content}
                onChange={project.updateActive}
                files={project.files}
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
                cpuLanguage={cpuLanguage}
                toolchainLanguage={toolchainLanguage}
                gotoTarget={gotoTarget}
                onToggleBreakpoint={onToggleBreakpoint}
                onSave={runAssemble}
                onViewReady={(v) => { editorViewRef.current = v; }}
                onJumpToLabel={onJumpToLabel}
                onCursorLine={setCursorLine}
              />
            </Suspense>
          )}
          {project.loaded && outputPanel && (
            <PanelSlot
              panel={outputPanel}
              projectId={project.projectId}
              manifest={project.manifest}
              data={panelData}
            />
          )}
        </main>
        <Splitter invert onResize={(dx) => setSideW((w) => clampSide(w + dx))} />
        <aside className="app__side">
          <Emulator
            breakpoints={breakpoints}
            onState={setCpu}
          />
          {project.loaded && (
            <Debug
              panels={debugColumnPanels}
              projectId={project.projectId}
              manifest={project.manifest}
              panelData={panelData}
            />
          )}
        </aside>
      </div>
      <StatusBar
        projectName={project.manifest.name}
        activePath={project.activePath}
        busy={busy}
        result={result ? { ok: result.ok, exitCode: result.exitCode } : null}
        running={running}
        pc={cpu?.regs.pc ?? null}
        brokeOn={brokeOn}
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

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent title={`madside v${__APP_VERSION__}`}>
          <div className="about">
            <p className="about__alpha">
              <strong>Alpha</strong> — under active, extensive testing. Expect rough
              edges; your projects live in this browser (export anything you want to keep).
            </p>
            <p className="about__desc">
              An in-browser IDE for retro hardware — Atari 8-bit and NES, plugin-based.
            </p>
            <p className="about__links">
              <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">Documentation</a>
              {" · "}
              <span className="about__muted">AGPL-3.0</span>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
