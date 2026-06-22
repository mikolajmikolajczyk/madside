import type { ProjectRow } from "@ports";
import {
  Menu, MenuTrigger, MenuContent, MenuItem, MenuCheckboxItem, MenuLabel, MenuSeparator,
  MenuSub, MenuSubTrigger, MenuSubContent,
} from "../ui/Menu";
import "./MenuBar.css";

// In production the docs site is served at /docs/ on the same origin. In dev
// that path hits the app's SPA fallback (the docs are a separate Astro dev
// server), so point at it directly — run `just docs-dev` to have it up.
// Overridable via VITE_DOCS_URL.
const DOCS_URL =
  (import.meta.env.VITE_DOCS_URL as string | undefined) ??
  (import.meta.env.DEV ? "http://localhost:4321/docs/" : "/docs/");

export interface MenuBarProps {
  projects: ProjectRow[];
  activeProjectId: string;
  activeProjectName: string;
  /** Close the active project → the welcome hub (existing projects + empty /
   *  templates / courses). */
  onCloseProject: () => void;
  onSwitchProject: (id: string) => void;
  onRenameProject: () => void;
  onDuplicateProject: () => void;
  onDeleteProject: () => void;
  onExportZip: () => void;
  /** Download the assembled binary; disabled until a successful build exists. */
  onExportBinary: () => void;
  canExportBinary: boolean;
  onImportZip: () => void;
  onAssemble: () => void;
  onRun: () => void;
  onPause: () => void;
  onStop: () => void;
  onStepOver: () => void;
  onStep: () => void;
  onFrame: () => void;
  onReset: () => void;
  canRun: boolean;
  running: boolean;
  hasEmu: boolean;
  busy: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggleBp?: () => void;
  onClearBp?: () => void;
  onOpenHistory?: () => void;
  onSnapshotNow?: () => void;
  onAbout?: () => void;
  onCommandPalette?: () => void;
  /** Present only in dockview layout mode — drives the View menu (panel
   *  show/hide + reset). */
  viewMenu?: {
    panels: { id: string; title: string; open: boolean }[];
    onToggle: (id: string) => void;
    onFloat: (id: string) => void;
    onReset: () => void;
    builtinLayouts: string[];
    onBuiltinLayout: (name: string) => void;
    userPresets: string[];
    onUserPreset: (name: string) => void;
    onDeletePreset: (name: string) => void;
    onSavePreset: () => void;
    onCopyLayout: () => void;
    themes: { id: string; name: string; active: boolean }[];
    onTheme: (id: string) => void;
  };
}

export function MenuBar(p: MenuBarProps) {
  return (
    <div className="menubar" data-testid="menubar">
      <Menu>
        <MenuTrigger data-testid="menu.file">File</MenuTrigger>
        <MenuContent>
          <MenuItem data-testid="menu.file.close" onSelect={p.onCloseProject}>Close project</MenuItem>
          <MenuItem data-testid="menu.file.save" onSelect={p.onAssemble} shortcut="Ctrl+S">Save</MenuItem>
          <MenuSeparator />
          <MenuItem data-testid="menu.file.rename" onSelect={p.onRenameProject}>Rename…</MenuItem>
          <MenuItem data-testid="menu.file.duplicate" onSelect={p.onDuplicateProject}>Duplicate…</MenuItem>
          <MenuItem data-testid="menu.file.delete" onSelect={p.onDeleteProject} danger>Delete</MenuItem>
          <MenuSeparator />
          <MenuItem
            data-testid="menu.file.export-binary"
            onSelect={p.onExportBinary}
            disabled={!p.canExportBinary}
          >Export binary</MenuItem>
          <MenuItem data-testid="menu.file.export-zip" onSelect={p.onExportZip}>Export ZIP</MenuItem>
          <MenuItem data-testid="menu.file.import-zip" onSelect={p.onImportZip}>Import ZIP…</MenuItem>
          <MenuSeparator />
          {p.onSnapshotNow && (
            <MenuItem data-testid="menu.file.snapshot" onSelect={p.onSnapshotNow}>Snapshot now</MenuItem>
          )}
          {p.onOpenHistory && (
            <MenuItem data-testid="menu.file.history" onSelect={p.onOpenHistory}>History…</MenuItem>
          )}
          <MenuSeparator />
          <MenuSub>
            <MenuSubTrigger data-testid="menu.file.switch-project">Switch project</MenuSubTrigger>
            <MenuSubContent>
              {p.projects.length === 0 ? (
                <MenuLabel>(none)</MenuLabel>
              ) : (
                p.projects.map((proj) => (
                  <MenuItem
                    key={proj.id}
                    data-testid={`menu.file.switch-project.${proj.id}`}
                    disabled={proj.id === p.activeProjectId}
                    onSelect={() => p.onSwitchProject(proj.id)}
                  >
                    {(proj.id === p.activeProjectId ? "• " : "  ") + proj.name}
                  </MenuItem>
                ))
              )}
            </MenuSubContent>
          </MenuSub>
        </MenuContent>
      </Menu>

      <Menu>
        <MenuTrigger data-testid="menu.edit">Edit</MenuTrigger>
        <MenuContent>
          <MenuItem data-testid="menu.edit.undo" onSelect={p.onUndo} shortcut="Ctrl+Z">Undo</MenuItem>
          <MenuItem data-testid="menu.edit.redo" onSelect={p.onRedo} shortcut="Ctrl+Shift+Z">Redo</MenuItem>
          <MenuSeparator />
          <MenuItem disabled shortcut="Ctrl+X">Cut</MenuItem>
          <MenuItem disabled shortcut="Ctrl+C">Copy</MenuItem>
          <MenuItem disabled shortcut="Ctrl+V">Paste</MenuItem>
          <MenuSeparator />
          <MenuItem disabled shortcut="Ctrl+F">Find</MenuItem>
          <MenuItem disabled shortcut="Ctrl+H">Replace</MenuItem>
        </MenuContent>
      </Menu>

      {p.viewMenu && (
        <Menu>
          <MenuTrigger data-testid="menu.view">View</MenuTrigger>
          <MenuContent>
            <MenuLabel>Panels</MenuLabel>
            {p.viewMenu.panels.map((panel) => (
              <MenuCheckboxItem
                key={panel.id}
                data-testid={`menu.view.panel.${panel.id}`}
                checked={panel.open}
                onCheckedChange={() => p.viewMenu?.onToggle(panel.id)}
              >
                {panel.title}
              </MenuCheckboxItem>
            ))}
            <MenuSeparator />
            <MenuSub>
              <MenuSubTrigger data-testid="menu.view.float">Float panel</MenuSubTrigger>
              <MenuSubContent>
                {p.viewMenu.panels.filter((panel) => panel.open).map((panel) => (
                  <MenuItem
                    key={panel.id}
                    data-testid={`menu.view.float.${panel.id}`}
                    onSelect={() => p.viewMenu?.onFloat(panel.id)}
                  >
                    {panel.title}
                  </MenuItem>
                ))}
              </MenuSubContent>
            </MenuSub>
            <MenuSub>
              <MenuSubTrigger data-testid="menu.view.layout">Layout preset</MenuSubTrigger>
              <MenuSubContent>
                <MenuLabel>Built-in</MenuLabel>
                {p.viewMenu.builtinLayouts.map((name) => (
                  <MenuItem
                    key={`builtin-${name}`}
                    data-testid={`menu.view.layout.builtin.${name}`}
                    onSelect={() => p.viewMenu?.onBuiltinLayout(name)}
                  >
                    {name}
                  </MenuItem>
                ))}
                <MenuSeparator />
                {p.viewMenu.userPresets.length > 0 && <MenuLabel>Saved</MenuLabel>}
                {p.viewMenu.userPresets.map((name) => (
                  <MenuItem
                    key={`user-${name}`}
                    data-testid={`menu.view.layout.user.${name}`}
                    onSelect={() => p.viewMenu?.onUserPreset(name)}
                  >
                    {name}
                  </MenuItem>
                ))}
                {p.viewMenu.userPresets.length > 0 && <MenuSeparator />}
                <MenuItem data-testid="menu.view.layout.save" onSelect={p.viewMenu.onSavePreset}>Save current layout…</MenuItem>
                {p.viewMenu.userPresets.length > 0 && (
                  <MenuSub>
                    <MenuSubTrigger data-testid="menu.view.layout.delete">Delete preset</MenuSubTrigger>
                    <MenuSubContent>
                      {p.viewMenu.userPresets.map((name) => (
                        <MenuItem
                          key={`del-${name}`}
                          data-testid={`menu.view.layout.delete.${name}`}
                          danger
                          onSelect={() => p.viewMenu?.onDeletePreset(name)}
                        >
                          {name}
                        </MenuItem>
                      ))}
                    </MenuSubContent>
                  </MenuSub>
                )}
                <MenuSeparator />
                <MenuItem data-testid="menu.view.layout.copy" onSelect={p.viewMenu.onCopyLayout}>Copy layout JSON</MenuItem>
              </MenuSubContent>
            </MenuSub>
            <MenuSub>
              <MenuSubTrigger data-testid="menu.view.theme">Theme</MenuSubTrigger>
              <MenuSubContent>
                {p.viewMenu.themes.map((t) => (
                  <MenuCheckboxItem
                    key={t.id}
                    data-testid={`menu.view.theme.${t.id}`}
                    checked={t.active}
                    onCheckedChange={() => p.viewMenu?.onTheme(t.id)}
                  >
                    {t.name}
                  </MenuCheckboxItem>
                ))}
              </MenuSubContent>
            </MenuSub>
            <MenuSeparator />
            <MenuItem data-testid="menu.view.reset" onSelect={p.viewMenu.onReset}>Reset layout</MenuItem>
          </MenuContent>
        </Menu>
      )}

      <Menu>
        <MenuTrigger data-testid="menu.run">Run</MenuTrigger>
        <MenuContent>
          <MenuItem data-testid="menu.run.build" onSelect={p.onAssemble} shortcut="Ctrl+B" disabled={p.busy}>Build</MenuItem>
          <MenuSeparator />
          <MenuItem data-testid="menu.run.run" onSelect={p.onRun} shortcut="Ctrl+Enter" disabled={!p.canRun || p.running}>Run</MenuItem>
          <MenuItem data-testid="menu.run.pause" onSelect={p.onPause} shortcut="Ctrl+." disabled={!p.running}>Pause</MenuItem>
          <MenuItem data-testid="menu.run.stop" onSelect={p.onStop} shortcut="Ctrl+Shift+.">Stop</MenuItem>
          <MenuSeparator />
          <MenuItem data-testid="menu.run.step-over" onSelect={p.onStepOver} shortcut="F10" disabled={p.running || !p.hasEmu}>Step Over</MenuItem>
          <MenuItem data-testid="menu.run.step" onSelect={p.onStep} shortcut="Shift+F10" disabled={p.running || !p.hasEmu}>Step Instruction</MenuItem>
          <MenuItem data-testid="menu.run.frame" onSelect={p.onFrame} shortcut="F11" disabled={p.running || !p.hasEmu}>Frame</MenuItem>
          {p.onToggleBp && (
            <MenuItem data-testid="menu.run.bp-toggle" onSelect={p.onToggleBp} shortcut="F9">Toggle breakpoint</MenuItem>
          )}
          {p.onClearBp && (
            <MenuItem data-testid="menu.run.bp-clear" onSelect={p.onClearBp}>Clear all breakpoints</MenuItem>
          )}
          <MenuSeparator />
          <MenuItem data-testid="menu.run.restart" onSelect={p.onReset} shortcut="Ctrl+Shift+Enter">Restart</MenuItem>
        </MenuContent>
      </Menu>

      <Menu>
        <MenuTrigger data-testid="menu.help">Help</MenuTrigger>
        <MenuContent>
          <MenuItem
            data-testid="menu.help.docs"
            onSelect={() => window.open(DOCS_URL, '_blank', 'noopener,noreferrer')}
          >
            Documentation
          </MenuItem>
          <MenuItem data-testid="menu.help.palette" onSelect={p.onCommandPalette} shortcut="Ctrl+K">
            Command Palette
          </MenuItem>
          <MenuItem data-testid="menu.help.about" onSelect={p.onAbout}>About</MenuItem>
        </MenuContent>
      </Menu>

      <div className="menubar__title" data-testid="menubar.title">{p.activeProjectName}</div>
    </div>
  );
}
