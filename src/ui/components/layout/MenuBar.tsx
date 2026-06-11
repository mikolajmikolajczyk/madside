// eslint-disable-next-line boundaries/element-types -- TODO(M3): service extraction lifts this import into a service call
import type { ProjectRow } from "@adapters/storage-idb";
import {
  Menu, MenuTrigger, MenuContent, MenuItem, MenuLabel, MenuSeparator,
  MenuSub, MenuSubTrigger, MenuSubContent,
} from "../ui/Menu";
import "./MenuBar.css";

export interface MenuBarProps {
  projects: ProjectRow[];
  activeProjectId: string;
  activeProjectName: string;
  onNewProject: () => void;
  onSwitchProject: (id: string) => void;
  onRenameProject: () => void;
  onDuplicateProject: () => void;
  onDeleteProject: () => void;
  onExportZip: () => void;
  onImportZip: () => void;
  onAssemble: () => void;
  onRun: () => void;
  onPause: () => void;
  onStop: () => void;
  onStep: () => void;
  onFrame: () => void;
  onReset: () => void;
  canRun: boolean;
  running: boolean;
  busy: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggleBp?: () => void;
  onClearBp?: () => void;
  onOpenHistory?: () => void;
  onSnapshotNow?: () => void;
}

export function MenuBar(p: MenuBarProps) {
  return (
    <div className="menubar" data-testid="menubar">
      <Menu>
        <MenuTrigger data-testid="menu.file">File</MenuTrigger>
        <MenuContent>
          <MenuItem data-testid="menu.file.new" onSelect={p.onNewProject}>New project…</MenuItem>
          <MenuItem data-testid="menu.file.save" onSelect={p.onAssemble} shortcut="Ctrl+S">Save</MenuItem>
          <MenuSeparator />
          <MenuItem data-testid="menu.file.rename" onSelect={p.onRenameProject}>Rename…</MenuItem>
          <MenuItem data-testid="menu.file.duplicate" onSelect={p.onDuplicateProject}>Duplicate…</MenuItem>
          <MenuItem data-testid="menu.file.delete" onSelect={p.onDeleteProject} danger>Delete</MenuItem>
          <MenuSeparator />
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

      <Menu>
        <MenuTrigger data-testid="menu.run">Run</MenuTrigger>
        <MenuContent>
          <MenuItem data-testid="menu.run.build" onSelect={p.onAssemble} shortcut="Ctrl+B" disabled={p.busy}>Build</MenuItem>
          <MenuSeparator />
          <MenuItem data-testid="menu.run.run" onSelect={p.onRun} shortcut="Ctrl+Enter" disabled={!p.canRun || p.running}>Run</MenuItem>
          <MenuItem data-testid="menu.run.pause" onSelect={p.onPause} shortcut="Ctrl+." disabled={!p.running}>Pause</MenuItem>
          <MenuItem data-testid="menu.run.stop" onSelect={p.onStop} shortcut="Ctrl+Shift+.">Stop</MenuItem>
          <MenuSeparator />
          <MenuItem data-testid="menu.run.step" onSelect={p.onStep} shortcut="F10" disabled={p.running}>Step</MenuItem>
          <MenuItem data-testid="menu.run.frame" onSelect={p.onFrame} shortcut="F11" disabled={p.running}>Frame</MenuItem>
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
          <MenuItem disabled>About</MenuItem>
          <MenuItem disabled>Shortcuts…</MenuItem>
        </MenuContent>
      </Menu>

      <div className="menubar__title" data-testid="menubar.title">{p.activeProjectName}</div>
    </div>
  );
}
