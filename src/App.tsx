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
import type { CpuRegs } from "./lib/emu";
import { parseSourceMap } from "./lib/sourceMap";
import { basename, extOf } from "./lib/util/path";
import { useSplitterWidth } from "./hooks/useSplitterWidth";
import { useDebuggerShortcuts } from "./hooks/useDebuggerShortcuts";
import { useBreakpointAddrs } from "./hooks/useBreakpointAddrs";
import { useCursorMemory } from "./hooks/useCursorMemory";
import { usePluginEditor } from "./hooks/usePluginEditor";
import { useProjectLabels } from "./hooks/useProjectLabels";
import { useAutoAssemble } from "./hooks/useAutoAssemble";
import "./App.css";

const ASSET_EXTENSIONS = new Set([
  "png","jpg","jpeg","gif","bmp",
  "csv","bin","raw","tmx","wav",
]);

function isAssetPath(path: string): boolean {
  return ASSET_EXTENSIONS.has(extOf(path));
}

export default function App() {
  const project = useProject();

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

  const { result, setResult, busy, runAssemble } = useAutoAssemble({
    files: project.loaded ? project.files : null,
    main: project.loaded ? project.manifest.main : null,
    recipes: project.loaded ? project.manifest.recipes : null,
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

  const projectLabels = useProjectLabels(
    project.loaded ? project.files : null,
    result?.lab,
    sourceMap,
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
  const activeBase = basename(activePath);

  const cursorHighlight = useCursorMemory({
    sourceMap, activeBase, cursorLine, memBaseTouched, setMemBase,
  });

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


  const onRun = useCallback(async () => {
    let r = result;
    if (!r) r = await runAssemble();
    if (!r?.ok || !r.xex) return;
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

  const canRun = !!result?.ok || !!loadedXex;

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
    { canRun, running },
  );

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
