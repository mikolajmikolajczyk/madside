import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { EditorView } from "@codemirror/view";
import { resolveCStyle, formatCView, isCFile } from "@ui/codemirror";
import { OutlinePanel } from "./components/outline/OutlinePanel";
import { ReferencesPanel } from "./components/outline/ReferencesPanel";
import type { ReferenceLocation, RenameTextEdit } from "./codemirror/lsp/client";
import { MenuBar } from "./components/layout/MenuBar";
import { DebugBar } from "./components/layout/DebugBar";
import { StatusBar } from "./components/layout/StatusBar";
import { Explorer } from "./components/project/Explorer";
import type { ReadOnlyMount } from "./components/project/FileTree";
import { DockLayout, builtinLayoutNames, type DockPanelMeta, type DockControls } from "./dock/DockLayout";
import { SystemFileView } from "./components/editor/SystemFileView";
const Editor = lazy(() => import("./components/editor/Editor").then((m) => ({ default: m.Editor })));
const AssetPanel = lazy(() => import("./components/asset/AssetPanel").then((m) => ({ default: m.AssetPanel })));
const HistoryDialog = lazy(() => import("./components/history/HistoryDialog").then((m) => ({ default: m.HistoryDialog })));
const PluginEditor = lazy(() => import("./components/editor/PluginEditor").then((m) => ({ default: m.PluginEditor })));
const ManifestEditor = lazy(() => import("./components/manifest/ManifestEditor").then((m) => ({ default: m.ManifestEditor })));
import { Emulator } from "./components/debug/Emulator";
import { PanelSlot } from "./components/PanelSlot";
const Welcome = lazy(() => import("./components/Welcome").then((m) => ({ default: m.Welcome })));
const CoursePanel = lazy(() => import("./components/course/CoursePanel").then((m) => ({ default: m.CoursePanel })));
const CourseAuthor = lazy(() => import("./components/course/CourseAuthor").then((m) => ({ default: m.CourseAuthor })));
const CourseAuthorPreview = lazy(() => import("./components/course/CourseAuthorPreview").then((m) => ({ default: m.CourseAuthorPreview })));
import { TooltipProvider } from "./components/ui/Tooltip";
import { TextPromptDialog, ConfirmDialog, Dialog, DialogContent } from "./components/ui/Dialog";
import { useProject } from "@app/state";
import { CommandPalette } from "./components/command/CommandPalette";
import { useToast } from "./components/ui/Toast";
import { buildAppCommands, type AppCommandEnv } from "./commands/appCommands";
import type { CpuRegs } from "./components/debug/Emulator";
import type { CommandContext, PanelPlugin, ThemePlugin, ToolchainPlugin } from "@ports";
import { resolveLineSpace, resolvePcLoc } from "@ports";
import { basename, extOf } from "@core/path";
import { getCpuLanguage } from "@core";
import { primeAudio } from "@core/audio";
import { useCommandShortcuts } from "./hooks/useCommandShortcuts";
import { useBreakpointAddrs } from "./hooks/useBreakpointAddrs";
import { useCursorMemory } from "./hooks/useCursorMemory";
import { useEquateValues } from "./hooks/useEquateValues";
import { usePluginEditor } from "./hooks/usePluginEditor";
import { useProjectLabels } from "./hooks/useProjectLabels";
import { useProjectCDocuments } from "./hooks/useProjectCDocuments";
import { useProjectAsmDocuments } from "./hooks/useProjectAsmDocuments";
import { useLspDiagnostics } from "./hooks/useLspDiagnostics";
import { useManifestMachineSync } from "./hooks/useManifestMachineSync";
import { useEmuStateReset } from "./hooks/useEmuStateReset";
import { useRunControls } from "./hooks/useRunControls";
import { useDebugEventMonitor } from "./hooks/useDebugEventMonitor";
import type { DefinitionTarget, RenameChanges } from "./codemirror/lsp/client";
import { useProjectsWithCourse } from "./hooks/useProjectsWithCourse";
import { useAutoAssemble } from "./hooks/useAutoAssemble";
import { useRunStatus } from "./hooks/useRunStatus";
import { useActiveMachine } from "./hooks/useActiveMachine";
import { useWorkbench } from "@app";
import { applyTheme, loadThemeId, saveThemeId, hydrateTrustedPlugins } from "@app";
import { PluginTrustBanner } from "./components/PluginTrustBanner";
import { addLessonInFiles, getCourse, getDraftCourse, openLesson, readCourseMeta, refreshCourseFromGitHub, resetLessonToStarter, runChecks, saveDraftCourse, scanEquates, setLessonStarterInFiles, starterFilesForMachine } from "@app";
import { useCourses } from "./hooks/useCourses";
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

// Apply an LSP rename's TextEdits to a file's text (#75). Edits are resolved to
// offsets and applied back-to-front so earlier ones don't shift later ones.
function offsetAt(text: string, line: number, character: number): number {
  let off = 0;
  let ln = 0;
  for (let i = 0; i < text.length && ln < line; i++) {
    if (text.charCodeAt(i) === 10) { ln++; off = i + 1; }
  }
  return off + character;
}
function applyTextEdits(text: string, edits: RenameTextEdit[]): string {
  const resolved = edits
    .map((e) => ({
      from: offsetAt(text, e.range.start.line, e.range.start.character),
      to: offsetAt(text, e.range.end.line, e.range.end.character),
      newText: e.newText,
    }))
    .sort((a, b) => b.from - a.from);
  let out = text;
  for (const e of resolved) out = out.slice(0, e.from) + e.newText + out.slice(e.to);
  return out;
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
  const toast = useToast();
  const project = useProject(workbench.storage, workbench.events);

  // Hydrate the project-local plugin trust set (ADR-0013) so editor/converter
  // gates reflect persisted consent from the first render.
  useEffect(() => { void hydrateTrustedPlugins(workbench.storage); }, [workbench.storage]);

  // iOS audio unlock: a browser only lets an AudioContext run if it was resumed
  // inside a user gesture, but the emulator's startAudio() fires after an async
  // build/load chain. Prime the shared context on the first interaction so audio
  // works on iPad/iPhone Safari (all machines were silent there). Once is enough.
  useEffect(() => {
    const unlock = () => {
      primeAudio();
      for (const e of ["pointerdown", "touchend", "keydown"]) window.removeEventListener(e, unlock);
    };
    for (const e of ["pointerdown", "touchend", "keydown"]) window.addEventListener(e, unlock);
    return () => { for (const e of ["pointerdown", "touchend", "keydown"]) window.removeEventListener(e, unlock); };
  }, []);

  // Run lifecycle is owned by RunService (ADR-0007). UI reads via the hook;
  // no parallel React state. `running` + `hasEmu` are derived primitives.
  const runStatus = useRunStatus();
  const machine = useActiveMachine();
  const running = runStatus === 'running';
  const hasEmu = runStatus !== 'idle' && runStatus !== 'crashed';

  // Manifest-driven machine selection (1972a36): manifest `machine` change →
  // workbench.setActiveMachine. Extracted to a hook (#65).
  useManifestMachineSync(workbench, project.loaded ? project.manifest.machine : null);
  const [cpu, setCpu] = useState<CpuRegs | null>(null);
  const [memBase, setMemBase] = useState(0x2000);
  const [memBaseTouched, setMemBaseTouched] = useState(false);
  const [brokeOn, setBrokeOn] = useState<number | null>(null);
  // Set when a Run can't proceed (build failed / binary load failed) — shown as
  // an overlay in the emulator window. Cleared on the next successful Run.
  const [runBlockedMsg, setRunBlockedMsg] = useState<string | null>(null);
  const [cursorLine, setCursorLine] = useState<number | null>(null);

  const { result, setResult, busy, runAssemble } = useAutoAssemble({
    buildService: workbench.build,
    files: project.loaded ? project.files : null,
    manifest: project.loaded ? project.manifest : null,
    projectId: project.loaded ? project.projectId : null,
    storage: workbench.storage,
  });

  // Course authoring (#139): the active project is a lesson (stamped
  // manifest.course) whose course is a local draft. Authoring then = editing that
  // draft bundle + the open lesson is an ordinary project (builds/runs natively).
  useCourses(); // subscribe so getCourse() reflects draft saves
  const course = project.loaded ? project.manifest.course : undefined;
  const courseInfo = course ? getCourse(course.id) : undefined;
  const authoring = courseInfo?.source.kind === "local";

  // The draft bundle's files (course.json + every lesson) loaded for editing;
  // the active lesson's starter is the LIVE project, swapped in on read so the
  // course view always reflects the open lesson's latest code.
  const [draftFiles, setDraftFiles] = useState<{ path: string; content: string }[] | null>(null);
  const draftCourseId = authoring ? course!.id : null;
  useEffect(() => {
    let cancelled = false;
    const load = draftCourseId ? getDraftCourse(workbench.storage, draftCourseId) : Promise.resolve(null);
    void load.then((f) => { if (!cancelled) setDraftFiles(f); });
    return () => { cancelled = true; };
  }, [draftCourseId, workbench.storage]);

  const editorViewRef = useRef<EditorView | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  // Default the memory-view base to the assembled binary's load address, unless
  // the user has manually set it. Adjust-during-render on a result change (#28).
  const [prevResult, setPrevResult] = useState(result);
  if (result !== prevResult) {
    setPrevResult(result);
    const xex = result?.xex;
    if (xex && xex.length >= 6 && !memBaseTouched && xex[0] === 0xff && xex[1] === 0xff) {
      setMemBase(xex[2] | (xex[3] << 8));
    }
  }


  const onMemBaseChange = useCallback((addr: number) => {
    setMemBaseTouched(true);
    setMemBase(addr);
  }, []);

  // Emulator-state lifecycle (#65): the reset blast (project change / Stop /
  // Reset) + the two load-bearing project-load effects (reset-then-restore
  // order) live in the hook. resetEmuState comes back for the Run controls.
  const { resetEmuState } = useEmuStateReset({
    workbench,
    projectId: project.loaded ? project.projectId : null,
    setResult,
    setCpu,
    setMemBaseTouched,
    setBrokeOn,
    setRunBlockedMsg,
  });

  const bpLinesByFile = useMemo(
    () => (project.loaded ? project.breakpoints : new Map<string, Set<number>>()),
    [project],
  );

  // The focused CPU's source map drives current-line + line breakpoints. On a
  // multi-CPU machine (Genesis 68000 + Z80) focusing the Z80 swaps to its map so
  // the .s80 lights up; the primary CPU uses the default map (#147 Phase 2d).
  const focusedCpu = workbench.debug.focusedCpu();
  const sourceMap = (focusedCpu ? result?.sourceMaps?.[focusedCpu] : null) ?? result?.sourceMap ?? null;

  // Editor language is driven by the machine CPU + the project's toolchain
  // (epic 78b12bf) — not hardcoded MADS. Resolve both for the editor +
  // label scanner.
  const cpuLanguage = useMemo(() => getCpuLanguage(machine.cpu), [machine]);
  const toolchainLanguage = useMemo(() => {
    if (!project.loaded) return undefined;
    const tp = workbench.plugins.get('toolchain', project.manifest.toolchain) as ToolchainPlugin | undefined;
    return tp?.language;
  }, [project, workbench]);

  // Active toolchain's read-only sysroot (bundled runtime + headers), surfaced
  // in the file tree so users can browse what they may #include (#50, ADR-0008).
  const sysrootProvider = useMemo(() => {
    if (!project.loaded) return undefined;
    const tp = workbench.plugins.get('toolchain', project.manifest.toolchain) as ToolchainPlugin | undefined;
    return tp?.sysroot?.(project.manifest.machine);
  }, [project, workbench]);
  const [systemFilesState, setSystemFiles] = useState<string[]>([]);
  useEffect(() => {
    // No sync clear here (set-state-in-effect, #28); the derived value below
    // returns [] when there's no provider.
    if (!sysrootProvider) return;
    let cancelled = false;
    void sysrootProvider.list().then((f) => { if (!cancelled) setSystemFiles(f); }).catch(() => {});
    return () => { cancelled = true; };
  }, [sysrootProvider]);

  // A sysroot file opened read-only — kept apart from the project's active file
  // so it never enters storage or the breakpoint / source-map model.
  const [viewSystemFile, setViewSystemFile] = useState<{ path: string; text: string } | null>(null);
  const openSystemFile = useCallback((path: string) => {
    if (!sysrootProvider) return;
    void sysrootProvider.read(path).then((bytes) => {
      setViewSystemFile({ path, text: bytes ? new TextDecoder().decode(bytes) : "" });
    });
  }, [sysrootProvider]);

  // Read-only VFS mounts surfaced in the file tree as collapsed top-level
  // folders (#55, ADR-0008). One per source — today just the active toolchain
  // sysroot; future emulator-exposed / course / remote dirs append here.
  const readOnlyMounts = useMemo<ReadOnlyMount[]>(() => {
    const files = sysrootProvider ? systemFilesState : [];
    if (files.length === 0) return [];
    return [{
      id: "toolchain",
      label: "toolchain (system)",
      files,
      activePath: viewSystemFile?.path,
      onSelect: openSystemFile,
    }];
  }, [sysrootProvider, systemFilesState, viewSystemFile?.path, openSystemFile]);

  // Dockview layout — open-panel ids drive the MenuBar View menu checkmarks;
  // the imperative handle drives toggle/reset.
  const [dockOpenIds, setDockOpenIds] = useState<string[]>([]);
  const [dockUserPresets, setDockUserPresets] = useState<string[]>([]);
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const dockControlsRef = useRef<DockControls | null>(null);

  // The course panel (#127) is condition-driven: open + focus it while the
  // project is a course, close it otherwise. Keyed on id/lesson so switching
  // lessons re-focuses. Gated on dockOpenIds so it also fires once the dock is
  // ready (the controls ref may be unset on the first render).
  const courseKey = project.loaded && project.manifest.course
    ? `${project.manifest.course.id}/${project.manifest.course.lesson}`
    : null;
  useEffect(() => {
    const c = dockControlsRef.current;
    if (!c) return;
    const isOpen = dockOpenIds.includes("course");
    if (courseKey !== null && !isOpen) { c.setPanelOpen("course", true); c.focusPanel("course"); }
    else if (courseKey === null && isOpen) c.setPanelOpen("course", false);
  }, [courseKey, dockOpenIds]);

  // Course Author + Preview surfaces (#139) — condition-driven open/close: open +
  // focus while the project is a course being authored (carries a root course.json).
  useEffect(() => {
    const c = dockControlsRef.current;
    if (!c) return;
    const authorOpen = dockOpenIds.includes("course-author");
    const previewOpen = dockOpenIds.includes("course-preview");
    if (authoring) {
      if (!authorOpen) { c.setPanelOpen("course-author", true); c.focusPanel("course-author"); }
      if (!previewOpen) c.setPanelOpen("course-preview", true);
    } else {
      if (authorOpen) c.setPanelOpen("course-author", false);
      if (previewOpen) c.setPanelOpen("course-preview", false);
    }
  }, [authoring, dockOpenIds]);

  // Theme (#118) — registered ThemePlugins; apply the selected palette's tokens
  // to :root and persist the choice. Default 'dark' (matches base tokens.css).
  const themes = useMemo(() => workbench.plugins.list<ThemePlugin>('theme'), [workbench.plugins]);
  const [themeId, setThemeId] = useState(() => loadThemeId('dark'));
  useEffect(() => {
    const theme = themes.find((t) => t.id === themeId) ?? themes[0];
    if (theme) { applyTheme(theme.tokens); saveThemeId(theme.id); }
  }, [themes, themeId]);

  const projectLabels = useProjectLabels(
    project.loaded ? project.files : null,
    result?.labels,
    sourceMap,
    cpuLanguage,
    toolchainLanguage,
  );

  // Keep the C language server worker's open `.c`/`.h` set in sync with the whole
  // project so cross-file C resolution sees every translation unit (#70).
  useProjectCDocuments(
    project.loaded ? project.files : null,
    project.loaded ? project.manifest.machine : undefined,
  );
  // Same cross-file sync for the asm language server (#140).
  useProjectAsmDocuments(
    project.loaded ? project.files : null,
    project.loaded ? project.manifest.toolchain : undefined,
    project.loaded ? project.activePath : undefined,
  );

  // Welcome screen needs each project's course stamp to split "Your projects"
  // from "Started courses" — annotate the rows with their manifest.course.
  const annotatedProjects = useProjectsWithCourse(workbench.storage, project.projects);

  // clang-format style for C sources (#60): a project `.clang-format` wins;
  // else the `editor.format` preset; else LLVM. Indent follows `editor.tabWidth`.
  const cFormatStyle = useMemo(() => {
    const tw = project.loaded ? project.manifest.editor?.tabWidth ?? 4 : 4;
    const preset = project.loaded ? project.manifest.editor?.format : undefined;
    const cf = project.loaded
      ? project.files.find((f) => f.path === ".clang-format" || f.path.endsWith("/.clang-format"))
      : undefined;
    const cfText = cf ? new TextDecoder().decode(cf.content) : undefined;
    return resolveCStyle(cfText, preset, tw);
  }, [project]);

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

  // C go-to-definition (#73): the LSP resolved a target — a project file opens
  // in the editor and jumps to the line; a sysroot header opens read-only.
  const onGoToDefinition = useCallback((target: DefinitionTarget) => {
    if (!project.loaded) return;
    if (target.sysroot) {
      openSystemFile(target.path);
      return;
    }
    const file = project.files.find((f) => f.path === target.path);
    if (!file) return;
    // Navigating to a project symbol — leave any open sysroot header viewer so
    // the editor shows (chained nav from a header to a project file, #78).
    setViewSystemFile(null);
    if (file.path !== project.activePath) project.setActivePath(file.path);
    setGotoTarget((prev) => ({ line: target.line, tick: (prev?.tick ?? 0) + 1 }));
  }, [project, openSystemFile]);

  // Find-references results (#74) — Shift+F12 in the editor fills these; the
  // sidebar panel lists them, click navigates cross-file (same path as
  // go-to-definition). Cleared on close or a fresh search.
  const [references, setReferences] = useState<{ symbol: string; refs: ReferenceLocation[] } | null>(null);
  const onFindReferences = useCallback((symbol: string, refs: ReferenceLocation[]) => {
    setReferences({ symbol, refs });
  }, []);
  // Bring the References panel forward when a find-references lookup lands (#120).
  useEffect(() => {
    if (references) dockControlsRef.current?.focusPanel("references");
  }, [references]);
  const jumpToReference = useCallback((path: string, line: number, sysroot: boolean) => {
    if (sysroot) { openSystemFile(path); return; }
    if (!project.loaded) return;
    const file = project.files.find((f) => f.path === path);
    if (!file) return;
    setViewSystemFile(null);
    if (file.path !== project.activePath) project.setActivePath(file.path);
    setGotoTarget((prev) => ({ line, tick: (prev?.tick ?? 0) + 1 }));
  }, [project, openSystemFile]);

  // Rename symbol (#75) — F2 in the editor opens the prompt; on confirm the LSP
  // resolves the edits and we apply them across the project's files.
  const [renameReq, setRenameReq] = useState<{ pos: number; symbol: string } | null>(null);
  const onRequestRename = useCallback((pos: number, symbol: string) => {
    setRenameReq({ pos, symbol });
  }, []);

  const breakpoints = useBreakpointAddrs(sourceMap, bpLinesByFile);

  const activePath = project.loaded ? project.activePath : "";

  // File switch re-engages auto-follow: when the user opens a different
  // source, they want the memory view to land on that file's emit window.
  // Adjust-during-render with a previous-path marker (#28).
  const [prevActivePath, setPrevActivePath] = useState(activePath);
  if (activePath !== prevActivePath) {
    setPrevActivePath(activePath);
    if (activePath) setMemBaseTouched(false);
  }

  const cursorHighlight = useCursorMemory({
    sourceMap, activePath, cursorLine, memBaseTouched, setMemBase,
  });

  const onResumeFollow = useCallback(() => setMemBaseTouched(false), []);

  // PanelPlugin lookup — manifest.panels (if present) drives the Debug column
  // order; otherwise machine.defaultPanels; otherwise [registers, memory]. Each
  // panel declares its layout slot ('debug' column vs the fixed 'output' slot),
  // so placement is data-driven — no panel id is special-cased here.
  const allPanels = useMemo(
    () => workbench.plugins.list<PanelPlugin>('panel'),
    [workbench.plugins],
  );
  const panelById = useMemo(() => {
    const m = new Map<string, PanelPlugin>();
    for (const p of allPanels) m.set(p.id, p);
    return m;
  }, [allPanels]);
  const isDebugSlot = useCallback(
    (id: string) => { const p = panelById.get(id); return !!p && (p.slot ?? 'debug') === 'debug'; },
    [panelById],
  );
  const debugColumnPanelIds = useMemo(() => {
    const manifestPanels = project.loaded ? project.manifest.panels : undefined;
    const fromManifest = manifestPanels?.filter(isDebugSlot);
    if (fromManifest && fromManifest.length > 0) return fromManifest;
    const fromMachine = machine.defaultPanels.filter(isDebugSlot);
    if (fromMachine.length > 0) return fromMachine;
    return ['registers', 'memory'];
  }, [project, machine, isDebugSlot]);
  const debugColumnPanels = useMemo(
    () => debugColumnPanelIds.map((id) => panelById.get(id)).filter((p): p is PanelPlugin => !!p),
    [debugColumnPanelIds, panelById],
  );
  const outputPanel = useMemo(() => allPanels.find((p) => p.slot === 'output'), [allPanels]);

  // Live cpu + memory bytes flow through ctx.events now (panels self-fetch
  // via DebugService on debug:step-done / debug:bp-hit / run:state). App
  // still owns UI-side state — base addr + highlight + initial output.
  // Output seed for the Output panel. Keyed on `result` alone so its identity
  // changes only on a build / reload-hydration (#62) — the panel re-syncs from
  // it on identity change, so restored output shows without an extra build:done.
  const outputData = useMemo(() => ({
    stdout: result?.stdout ?? '',
    stderr: result?.stderr ?? '',
    ok: result ? result.ok : null,
  }), [result]);

  const panelData = useMemo(() => ({
    memory: {
      base: memBase,
      onBaseChange: onMemBaseChange,
      highlightStart: cursorHighlight?.start,
      highlightLen: cursorHighlight?.len,
      following: !memBaseTouched,
      onResumeFollow,
    },
    output: outputData,
    variables: { labels: result?.labels, debugInfo: result?.debugInfo },
  }), [memBase, onMemBaseChange, cursorHighlight, outputData, memBaseTouched, onResumeFollow, result?.labels, result?.debugInfo]);

  // Live bank space mapped at a CPU address, from the active backend's
  // bankMap() (ADR-0014). null for flat machines / addresses outside any bank
  // window. Lets the current-line highlight disambiguate same-addr lines that
  // live in different banks.
  const liveSpaceAt = useCallback((pc: number): string | null => {
    const map = workbench.run.backend()?.bankMap?.();
    if (!map) return null;
    for (const w of map) if (pc >= w.start && pc <= w.end) return w.space;
    return null;
  }, [workbench]);

  const pcLine = useMemo(() => {
    // During run the PC moves too fast to track in the editor — hide
    // the marker. It reappears on pause / step / BP hit.
    if (running) return null;
    if (!sourceMap || !cpu) return null;
    const loc = resolvePcLoc(sourceMap, cpu.regs.pc, liveSpaceAt(cpu.regs.pc));
    if (!loc) return null;
    return loc.file === activePath ? loc.line : null;
  }, [sourceMap, cpu, activePath, running, liveSpaceAt]);

  // Follow PC into included files: when the emulator is paused/stepping and
  // the next op lives in a different source file, switch the active editor
  // tab to that file so the highlighted line is visible.
  const projectFilesRef = project.loaded ? project.files : null;
  const setActivePathFn = project.loaded ? project.setActivePath : null;
  // The last PC we auto-followed. The effect re-runs whenever activePath changes
  // too, so without this it would yank the editor back to the PC's file the
  // instant the user manually switched away — making it impossible to browse
  // other files while paused. Only follow when the PC itself moves (pause/step).
  const lastFollowPcRef = useRef<number | null>(null);
  useEffect(() => {
    if (running || !cpu || !sourceMap || !projectFilesRef || !setActivePathFn) return;
    if (cpu.regs.pc === lastFollowPcRef.current) return; // a manual switch, not a new stop
    const loc = resolvePcLoc(sourceMap, cpu.regs.pc, liveSpaceAt(cpu.regs.pc));
    if (!loc) return;
    lastFollowPcRef.current = cpu.regs.pc;
    if (loc.file === activePath) return;
    // SourceMap keys are full project paths post-30be0cf — exact-match the
    // file in the project tree, no basename fallback needed.
    const target = projectFilesRef.find((f) => f.path === loc.file);
    if (target && target.path !== activePath) setActivePathFn(target.path);
  }, [running, cpu, sourceMap, activePath, projectFilesRef, setActivePathFn, liveSpaceAt]);

  const breakpointLines = useMemo(() => {
    return bpLinesByFile.get(activePath) ?? new Set<number>();
  }, [bpLinesByFile, activePath]);

  const lineAddrs = useMemo(() => {
    return sourceMap?.locToAddr.get(activePath) ?? new Map<number, number>();
  }, [sourceMap, activePath]);

  // Per-line bank labels for the active file (ADR-0014) — only present when the
  // build is banked. Drives the addr-gutter bank suffix. Built from the lines
  // that emit code (lineAddrs keys) via the source map's static line→bank.
  const lineBanks = useMemo(() => {
    const out = new Map<number, string>();
    if (!sourceMap?.bankedAddrToLoc) return out;
    for (const line of lineAddrs.keys()) {
      const space = resolveLineSpace(sourceMap, activePath, line);
      if (space) out.set(line, space);
    }
    return out;
  }, [sourceMap, activePath, lineAddrs]);

  // Inline build diagnostics for the active file (#29). The latest build result
  // carries every diagnostic; filter to the open file so switching tabs shows
  // that file's markers. Prefer exact path match (same scheme as the source
  // map); fall back to basename only when nothing matches exactly, so a build
  // that reports a bare filename still lights up the right editor.
  const buildDiagnostics = useMemo(() => {
    const all = result?.diagnostics ?? [];
    if (all.length === 0) return [];
    const exact = all.filter((d) => d.file === activePath);
    if (exact.length > 0) return exact;
    const base = activePath.split("/").pop();
    return all.filter((d) => d.file.split("/").pop() === base);
  }, [result, activePath]);

  // LSP semantic diagnostics for the active file (#77) — analysis-driven,
  // as-you-type, complementary to the build diagnostics above (madside parses
  // the compiler output itself, so the server only ever publishes semantic
  // findings here). Merge the two, dropping any exact line+message duplicate so
  // a semantic finding that the build later confirms doesn't double up.
  const lspDiagnostics = useLspDiagnostics(activePath);
  const editorDiagnostics = useMemo(() => {
    if (lspDiagnostics.length === 0) return buildDiagnostics;
    const seen = new Set(buildDiagnostics.map((d) => `${d.line}:${d.message}`));
    const extra = lspDiagnostics.filter((d) => !seen.has(`${d.line}:${d.message}`));
    return extra.length === 0 ? buildDiagnostics : [...buildDiagnostics, ...extra];
  }, [buildDiagnostics, lspDiagnostics]);

  // Live memory values next to address equates (#34). Scan the open assembly
  // file for `LABEL = $addr` lines; the hook then reads the byte at each address
  // on every debug step / pause and feeds them to the editor gutter. Gated on an
  // assembly file (toolchainLanguage present) — other editors have no equates —
  // and on a live backend (the hook returns empty when not debugging).
  const activeContent = project.loaded ? project.active.content : null;
  const equateAddrs = useMemo(
    () => (activeContent && toolchainLanguage
      ? scanEquates(new TextDecoder().decode(activeContent))
      : new Map<number, number>()),
    [activeContent, toolchainLanguage],
  );
  const equateValues = useEquateValues(equateAddrs);

  const toggleBpRef = useRef<((path: string, line: number) => void) | null>(null);
  useEffect(() => { toggleBpRef.current = project.loaded ? project.toggleBreakpoint : null; });
  const onToggleBreakpoint = useCallback((line: number) => {
    toggleBpRef.current?.(activePath, line);
  }, [activePath]);

  // Decoded text of the active C file for the sidebar Outline (#76). Memoised on
  // the bytes + path so it only re-decodes when the file actually changes.
  const outlineText = useMemo(
    () => (isCFile(activePath) && activeContent ? new TextDecoder().decode(activeContent) : ""),
    [activePath, activeContent],
  );

  // Confirm a rename: ask the LSP for the edits at the captured cursor, apply
  // them to every touched project file, persist + reload (#75). The modal blocks
  // editing, so `outlineText` still matches the buffer the cursor offset came
  // from.
  const applyRename = useCallback(async (newName: string) => {
    const req = renameReq;
    setRenameReq(null);
    const name = newName.trim();
    if (!req || !project.loaded || !name || name === req.symbol) return;
    // C files rename via the cc65 server; asm files via the asm server (#140).
    const isC = isCFile(activePath);
    const text = isC ? outlineText : (activeContent ? new TextDecoder().decode(activeContent) : "");
    if (!text) return;
    let changes: RenameChanges | null;
    if (isC) {
      const { cRename } = await import("./codemirror/lsp/client");
      changes = await cRename(text, req.pos, name);
    } else {
      const { asmRename } = await import("./codemirror/lsp/asm-client");
      changes = await asmRename(text, req.pos, name);
    }
    if (!changes) return;
    const dec = new TextDecoder();
    const enc2 = new TextEncoder();
    const edits: { path: string; content: Uint8Array }[] = [];
    for (const [path, textEdits] of Object.entries(changes)) {
      const file = project.files.find((f) => f.path === path);
      if (!file) continue;
      edits.push({ path, content: enc2.encode(applyTextEdits(dec.decode(file.content), textEdits)) });
    }
    if (edits.length > 0) await project.applyEdits(edits);
  }, [renameReq, project, outlineText, activeContent, activePath]);


  // Run/debug transport controls (#65): onRun/onPause/onStep/onStepFrame/
  // onStepOver/onStop/onReset. onStepOver carries the documented sourceMap/cpu
  // stale-closure footgun (see the hook).
  const { onRun, onPause, onStep, onStepFrame, onStepOver, onStop, onReset } = useRunControls({
    workbench,
    result,
    runAssemble,
    resetEmuState,
    sourceMap,
    cpu,
    setBrokeOn,
    setRunBlockedMsg,
  });

  // BP-trap monitor: pause the FSM + record the trap PC on debug:bp-hit (#65).
  useDebugEventMonitor(workbench, setBrokeOn);


  // Modal-based dialogs (Radix Dialog) replace native prompt/confirm.
  type DialogKind = "none" | "renameProject" | "duplicateProject" | "deleteProject";
  const [dialog, setDialog] = useState<DialogKind>("none");
  const closeDialog = useCallback(() => setDialog("none"), []);

  const [paletteOpen, setPaletteOpen] = useState(false);
  // Close the active project → the welcome hub (existing projects + empty /
  // templates / courses). It's "close", not "new": the menu item led to the
  // hub, not a fresh project, which misread as a create action.
  const handleCloseProject = useCallback(() => {
    if (project.loaded) void project.closeProject();
  }, [project]);
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

  // Download the freshly assembled binary (xex / nes / …), named after the
  // project + the active machine's output format.
  const handleExportBinary = useCallback(() => {
    if (!project.loaded || !result?.ok || !result.xex) return;
    // Extension must match the BYTES, not the machine's default load format (#138):
    // the ZX z88dk build emits a .sna while the machine default is .tap, so name
    // the file by magic-detecting the built binary first (same as RunService does),
    // falling back to the default only when detection is inconclusive.
    const ext = machine.media?.detect(result.xex) ?? machine.media?.defaultFormat ?? "bin";
    const blob = new Blob([result.xex as BlobPart], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${project.manifest.name}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }, [project, result, machine]);
  const canExportBinary = result?.ok === true && !!result.xex;

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
      toast.error(err instanceof Error ? err : `import failed: ${String(err)}`);
    }
  }, [project, toast]);

  const handleSwitchProject = useCallback(async (id: string) => {
    if (!project.loaded) return;
    await project.switchProject(id);
    // project:switched is emitted by useProject's mount effect after the
    // reload settles (ADR-0007 — the store owns its emits).
  }, [project]);

  const handleOpenLesson = useCallback(async (courseId: string, lessonId: string) => {
    if (!project.loaded) return;
    const id = await openLesson(workbench.storage, courseId, lessonId);
    await project.switchProject(id);
  }, [project, workbench]);

  // The headless-run dep for declarative checks: load the binary on the LIVE
  // emulator backend, wait out the machine's boot allowance, advance `frames`,
  // then snapshot CPU + memory. Disturbs the live emulator (loads the freshly
  // built binary); the learner / author re-runs afterwards. Shared by the
  // learner Check (active project) and the authoring preview (a lesson starter).
  const runOnLiveBackend = useCallback<CheckRunDeps["run"]>(async (binary, frames) => {
    if (workbench.run.status !== "idle") workbench.run.unload();
    const loaded = await workbench.run.load(binary);
    if (!loaded.ok) throw new Error(loaded.error.message);
    // Boot allowance (#30): a loaded program may not run the user's code until
    // the machine has cold-booted (an Atari XEX waits out tens of frames of OS
    // boot). Advance until the PC enters the program's load range, so the
    // author's `afterFrames` counts frames *after the program starts*. The range
    // comes from the active MachinePlugin (Atari parses the XEX; NES omits it —
    // PC runs from the reset vector). Capped; falls back to plain frame stepping.
    const range = machine.programLoadRange?.(binary) ?? null;
    if (range) {
      const BOOT_CAP = 600; // ~10s of simulated frames — generous upper bound
      for (let i = 0; i < BOOT_CAP; i++) {
        await workbench.debug.stepFrame();
        const pc = (await workbench.debug.registers()).pc;
        if (pc >= range.lo && pc <= range.hi) break;
      }
    }
    for (let i = 0; i < frames; i++) await workbench.debug.stepFrame();
    const regs = await workbench.debug.registers();
    return { regs, readMem: (a, l, s) => workbench.debug.readMemory(a, l, s) };
  }, [workbench, machine]);

  // Run a lesson's declarative checks (learner): assemble the active project,
  // then run on the live backend if a register/memory check needs it.
  const handleCheck = useCallback(async (checks: CourseCheck[]): Promise<CheckReport> => {
    return runChecks(checks, {
      assemble: async () => {
        const r = await runAssemble();
        if (!r || !r.ok || !r.xex) {
          return { ok: false, error: (r?.stderr || "assembly failed").split("\n")[0], labels: r?.labels ?? new Map() };
        }
        return { ok: true, labels: r.labels ?? new Map(), binary: r.xex };
      },
      run: runOnLiveBackend,
    });
  }, [runAssemble, runOnLiveBackend]);

  // Course authoring (#139) — the active lesson's starter is the LIVE project, so
  // the "course files" the editor/preview/export see = the draft bundle with that
  // starter swapped in.
  const liveLessonStarter = useCallback(
    (): { path: string; content: string }[] => (project.files ?? []).map((f) => ({ path: f.path, content: new TextDecoder().decode(f.content) })),
    [project.files],
  );
  // Persist an edit to the draft bundle (course.json / a lesson's md / checks /
  // lesson structure). The incoming files already include the live starter.
  const onSaveDraft = useCallback(async (files: { path: string; content: string }[]) => {
    if (!course) return;
    await saveDraftCourse(workbench.storage, course.id, files);
    setDraftFiles(files);
  }, [course, workbench.storage]);
  // Switch the open lesson: save the current lesson's starter back into the
  // bundle, then open the target lesson as the active project (openLesson reuses
  // the per-lesson project, preserving edits).
  const onSelectLesson = useCallback(async (lessonId: string) => {
    if (!course || !draftFiles || lessonId === course.lesson) return;
    const synced = setLessonStarterInFiles(draftFiles, course.lesson, liveLessonStarter());
    await saveDraftCourse(workbench.storage, course.id, synced);
    setDraftFiles(synced);
    const pid = await openLesson(workbench.storage, course.id, lessonId);
    await project.switchProject(pid);
  }, [course, draftFiles, liveLessonStarter, project, workbench.storage]);
  // Add a lesson: sync the open lesson's starter, append a new lesson to the
  // bundle, persist, then open the new one. One sequenced op (composing
  // save+select separately would race on stale draftFiles).
  const onAddLesson = useCallback(async () => {
    if (!course || !draftFiles) return;
    const synced = setLessonStarterInFiles(draftFiles, course.lesson, liveLessonStarter());
    const machine = readCourseMeta(synced)?.machine ?? "atari-xl";
    const { files: withNew, lessonId } = addLessonInFiles(synced, machine, starterFilesForMachine);
    await saveDraftCourse(workbench.storage, course.id, withNew);
    setDraftFiles(withNew);
    const pid = await openLesson(workbench.storage, course.id, lessonId);
    await project.switchProject(pid);
  }, [course, draftFiles, liveLessonStarter, project, workbench.storage]);

  // Re-fetch a remote course from its repo (preserves learner edits — only the
  // course definition updates; the active lesson project is left as-is).
  const handleRefreshCourse = useCallback(async (courseId: string) => {
    const c = getCourse(courseId);
    if (c?.source.kind !== "github") return;
    await refreshCourseFromGitHub(workbench.storage, { owner: c.source.owner, repo: c.source.repo, ref: c.source.ref });
  }, [workbench]);

  // Discard a lesson's edits, restoring the (refreshed) starter files, then
  // reload the project so the editor shows them.
  const handleResetLesson = useCallback(async (courseId: string, lessonId: string) => {
    if (!project.loaded) return;
    const id = await resetLessonToStarter(workbench.storage, courseId, lessonId);
    if (id) await project.switchProject(id);
  }, [project, workbench]);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

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

  // Format the active C/C++ file in place with clang-format (#60). Drives the
  // Save command's format step and is a no-op for non-C files.
  const onFormatActive = useCallback(async () => {
    const v = editorViewRef.current;
    if (!v || !project.loaded) return;
    await formatCView(v, project.active.path, cFormatStyle);
  }, [project, cFormatStyle]);

  // The CommandRegistry is the single dispatch path for every user action:
  // toolbar buttons, keyboard shortcuts, and the command palette all go through
  // `commands.run(id, ctx)`. Commands register once and read the latest ops /
  // state via this ref, so they never go stale (and the registry stays the
  // extension point for plugin-contributed commands).
  // Kept current in an effect (not during render) so the command env stays
  // Rules-of-React clean (#28); commands read it lazily via env() at invoke
  // time, always after commit.
  const cmdEnvRef = useRef<AppCommandEnv | null>(null);
  useEffect(() => {
    cmdEnvRef.current = {
      ops: {
        runAssemble, onRun, onPause, onStop, onStep, onStepOver, onStepFrame, onReset,
        toggleBpAtCursor, formatActive: onFormatActive,
        onSnapshot: () => { if (project.loaded) void project.createSnapshotNow("manual"); },
        openPalette: () => setPaletteOpen(true),
      },
      state: { canRun, running, hasEmu },
    };
  });
  useEffect(() => {
    const env = (): AppCommandEnv => cmdEnvRef.current!;
    const disposers = buildAppCommands(env).map((c) => workbench.commands.register(c));
    return () => { for (const d of disposers) d(); };
  }, [workbench]);

  // Swallow external *file* drops that miss the Explorer's import dropzone (#31)
  // so the browser doesn't navigate away to the dropped file and blow away app
  // state. Gated on a Files payload so it never interferes with in-app drags
  // (e.g. CodeMirror's drag-to-move-text, which carries text/* not Files). The
  // Explorer's own onDrop still handles drops landing on the Files pane.
  useEffect(() => {
    const prevent = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  const activeProjectId = project.loaded ? project.projectId : undefined;
  const cmdCtx = useMemo<CommandContext>(() => ({ projectId: activeProjectId }), [activeProjectId]);
  const cmdCtxRef = useRef<CommandContext>(cmdCtx);
  useEffect(() => { cmdCtxRef.current = cmdCtx; });
  const getCmdCtx = useCallback(() => cmdCtxRef.current, []);
  useCommandShortcuts(workbench.commands, getCmdCtx);

  if (!project.loaded) {
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
          projects={[...annotatedProjects].sort((a, b) => b.updatedAt - a.updatedAt)}
          onOpen={(id) => { void project.switchProject(id); }}
          onDeleteProject={async (id) => {
            await workbench.storage.projects.delete(id);
            await project.refreshProjects();
          }}
        />
      </Suspense>
    );
  }

  // Body content surfaces — each becomes a dockview panel (DockLayout). The
  // toolbar (MenuBar/DebugBar/StatusBar) stays fixed chrome around it.
  const filesSurface = (
    <Explorer
      files={project.files}
      active={viewSystemFile ? "" : project.activePath}
      mainPath={project.manifest.main}
      onSelect={(p) => { setViewSystemFile(null); project.setActivePath(p); }}
      onCreateFile={project.createFile}
      onImportFile={project.createFile}
      onCreateFolder={project.createFolder}
      onRenameFile={project.renameFile}
      onRenameFolder={project.renameFolder}
      onDeleteFile={project.deleteFile}
      onDeleteFolder={project.deleteFolder}
      onDuplicateFile={project.duplicateFile}
      onSetMain={project.setMainFile}
      readOnlyMounts={readOnlyMounts}
    />
  );

  // Course panels (#139). A lesson stamped with a course shows EITHER the learner
  // lesson panel (installed course) OR Course Author + Preview (a local draft). The
  // active lesson is an ordinary project — file tree, build, run, debug all native.
  const courseSurface = course && !authoring ? (
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
  ) : null;

  // The course view = the draft bundle with the open lesson's live starter swapped
  // in. Guard: only swap when the active lesson is actually in the bundle (after a
  // reorder its dir id changes — fall back to the bundle's copy rather than append
  // a phantom lesson).
  const activeInDraft = !!(draftFiles && course && draftFiles.some((f) => f.path.startsWith(`lessons/${course.lesson}/`)));
  const courseFiles = authoring && draftFiles && course
    ? (activeInDraft ? setLessonStarterInFiles(draftFiles, course.lesson, liveLessonStarter()) : draftFiles)
    : null;
  const courseAuthorSurface = (courseFiles && course) ? (
    <Suspense fallback={<div className="app__loading">loading…</div>}>
      <CourseAuthor
        files={courseFiles}
        activeLessonId={course.lesson}
        onSaveFiles={(f) => { void onSaveDraft(f); }}
        onSelectLesson={(l) => { void onSelectLesson(l); }}
        onAddLesson={() => { void onAddLesson(); }}
      />
    </Suspense>
  ) : null;
  const courseAuthorPreviewSurface = (courseFiles && course) ? (
    <Suspense fallback={<div className="app__loading">loading…</div>}>
      <CourseAuthorPreview
        files={courseFiles}
        activeLessonId={course.lesson}
        onSelectLesson={(l) => { void onSelectLesson(l); }}
        onCheckLesson={(_, checks) => handleCheck(checks)}
      />
    </Suspense>
  ) : null;

  // Outline of the active C file (#76) — its own dock panel (#120). Empty state
  // for non-C / system files so the panel reads sensibly when idle.
  const outlineSurface = isCFile(activePath) && !viewSystemFile ? (
    <OutlinePanel
      path={activePath}
      content={outlineText}
      onJump={(line) => setGotoTarget((prev) => ({ line, tick: (prev?.tick ?? 0) + 1 }))}
    />
  ) : (
    <div className="app__panel-empty">Outline appears for C files.</div>
  );

  // References from a find-references lookup (#75) — its own dock panel (#120).
  const referencesSurface = references ? (
    <ReferencesPanel
      symbol={references.symbol}
      refs={references.refs}
      onJump={jumpToReference}
      onClose={() => setReferences(null)}
    />
  ) : (
    <div className="app__panel-empty">No references — use “Find references”.</div>
  );

  const editorBody = viewSystemFile ? (
    <SystemFileView
      path={viewSystemFile.path}
      text={viewSystemFile.text}
      onClose={() => setViewSystemFile(null)}
      onGoToDefinition={onGoToDefinition}
    />
  ) : activeEditorModule ? (
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
        onUpdateFile={project.updateActive}
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
        lineBanks={lineBanks}
        equateValues={equateValues}
        diagnostics={editorDiagnostics}
        projectLabels={projectLabels}
        tabWidth={project.manifest.editor?.tabWidth ?? 4}
        cFormatStyle={cFormatStyle}
        cpuLanguage={cpuLanguage}
        toolchainLanguage={toolchainLanguage}
        machine={project.manifest.machine}
        toolchainId={project.manifest.toolchain}
        gotoTarget={gotoTarget}
        onToggleBreakpoint={onToggleBreakpoint}
        onViewReady={(v) => { editorViewRef.current = v; }}
        onJumpToLabel={onJumpToLabel}
        onGoToDefinition={onGoToDefinition}
        onFindReferences={onFindReferences}
        onRequestRename={onRequestRename}
        onCursorLine={setCursorLine}
      />
    </Suspense>
  );

  // Editor surface = the consent banner (renders only when the project ships
  // untrusted plugins) stacked above the active editor (ADR-0013).
  const editorSurface = (
    <div className="app__editor-surface">
      <PluginTrustBanner files={project.loaded ? project.files : null} />
      <div className="app__editor-body">{editorBody}</div>
    </div>
  );

  const outputSurface = project.loaded && outputPanel ? (
    <PanelSlot
      panel={outputPanel}
      projectId={project.projectId}
      manifest={project.manifest}
      data={panelData}
    />
  ) : null;

  const emulatorSurface = (
    <Emulator
      breakpoints={breakpoints}
      onState={setCpu}
      blockedMsg={runBlockedMsg}
    />
  );

  // Each debug panel is its own dockable surface.
  const debugSurfaces: { id: string; title: string; node: ReactNode }[] = project.loaded
    ? debugColumnPanels.map((panel) => ({
        id: `panel:${panel.id}`,
        title: panel.title ?? panel.id,
        node: (
          <PanelSlot
            panel={panel}
            projectId={project.projectId}
            manifest={project.manifest}
            data={panelData}
          />
        ),
      }))
    : [];

  const dockSurfaces: Record<string, ReactNode> = {
    files: filesSurface,
    editor: editorSurface,
    outline: outlineSurface,
    references: referencesSurface,
    emulator: emulatorSurface,
    ...(courseSurface ? { course: courseSurface } : {}),
    ...(courseAuthorSurface ? { "course-author": courseAuthorSurface } : {}),
    ...(courseAuthorPreviewSurface ? { "course-preview": courseAuthorPreviewSurface } : {}),
    ...(outputSurface ? { output: outputSurface } : {}),
  };
  for (const d of debugSurfaces) dockSurfaces[d.id] = d.node;

  const dockPanels: DockPanelMeta[] = [
    { id: "files", title: "Files" },
    { id: "editor", title: "Editor" },
    { id: "outline", title: "Outline" },
    { id: "references", title: "References" },
    { id: "emulator", title: "Emulator" },
    ...(courseSurface ? [{ id: "course", title: "Course" }] : []),
    ...(courseAuthorSurface ? [{ id: "course-author", title: "Course Author" }] : []),
    ...(courseAuthorPreviewSurface ? [{ id: "course-preview", title: "Course Preview" }] : []),
    ...debugSurfaces.map((d) => ({ id: d.id, title: d.title })),
    ...(outputSurface ? [{ id: "output", title: "Output" }] : []),
  ];

  // View menu — toggle panels + float + layouts/presets + reset, driven by the
  // DockLayout imperative handle; checkmarks track open ids.
  const viewMenu = {
    panels: dockPanels.map((p) => ({ id: p.id, title: p.title, open: dockOpenIds.includes(p.id) })),
    onToggle: (id: string) => dockControlsRef.current?.toggle(id),
    onFloat: (id: string) => dockControlsRef.current?.float(id),
    onReset: () => dockControlsRef.current?.reset(),
    builtinLayouts: builtinLayoutNames,
    onBuiltinLayout: (name: string) => dockControlsRef.current?.applyBuiltin(name),
    userPresets: dockUserPresets,
    onUserPreset: (name: string) => dockControlsRef.current?.applyUserPreset(name),
    onDeletePreset: (name: string) => dockControlsRef.current?.deletePreset(name),
    onSavePreset: () => setSavePresetOpen(true),
    onCopyLayout: () => {
      const json = dockControlsRef.current?.exportLayout() ?? "{}";
      void navigator.clipboard?.writeText(json);
    },
    themes: themes.map((t) => ({ id: t.id, name: t.name ?? t.id, active: t.id === themeId })),
    onTheme: setThemeId,
  };

  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={100}>
    <div className="app">
      <MenuBar
        projects={project.projects}
        activeProjectId={project.projectId}
        activeProjectName={project.manifest.name}
        onCloseProject={handleCloseProject}
        onSwitchProject={handleSwitchProject}
        onRenameProject={handleRenameProject}
        onDuplicateProject={handleDuplicateProject}
        onDeleteProject={handleDeleteProject}
        onExportZip={handleExportZip}
        onExportBinary={handleExportBinary}
        canExportBinary={canExportBinary}
        onImportZip={handleImportZip}
        onAssemble={runAssemble}
        onRun={onRun}
        onPause={onPause}
        onStop={onStop}
        onStepOver={onStepOver}
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
        onCommandPalette={() => setPaletteOpen(true)}
        viewMenu={viewMenu}
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
        onStepOver={onStepOver}
        onStep={onStep}
        onFrame={onStepFrame}
        onReset={onReset}
        onToggleBp={toggleBpAtCursor}
      />
      <DockLayout
        surfaces={dockSurfaces}
        panels={dockPanels}
        controlsRef={dockControlsRef}
        onOpenChange={setDockOpenIds}
        onPresetsChange={setDockUserPresets}
      />
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
        open={renameReq !== null}
        title={`Rename '${renameReq?.symbol ?? ""}'`}
        initial={renameReq?.symbol ?? ""}
        confirmLabel="Rename"
        onCancel={() => setRenameReq(null)}
        onConfirm={applyRename}
      />
      <TextPromptDialog
        open={savePresetOpen}
        title="Save layout preset"
        description="Captures the current panel arrangement under this name."
        placeholder="My layout"
        initial=""
        confirmLabel="Save"
        onCancel={() => setSavePresetOpen(false)}
        onConfirm={(name) => {
          setSavePresetOpen(false);
          if (name.trim()) dockControlsRef.current?.saveCurrentAs(name.trim());
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

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={workbench.commands}
        ctx={cmdCtx}
        restoreFocus={() => editorViewRef.current?.focus()}
      />
    </div>
    </TooltipProvider>
  );
}
