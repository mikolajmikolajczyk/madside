import type { ProjectRow } from "@adapters/storage-idb/types";
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
    <div className="menubar">
      <Menu>
        <MenuTrigger>File</MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={p.onNewProject}>New project…</MenuItem>
          <MenuItem onSelect={p.onAssemble} shortcut="Ctrl+S">Save</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={p.onRenameProject}>Rename…</MenuItem>
          <MenuItem onSelect={p.onDuplicateProject}>Duplicate…</MenuItem>
          <MenuItem onSelect={p.onDeleteProject} danger>Delete</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={p.onExportZip}>Export ZIP</MenuItem>
          <MenuItem onSelect={p.onImportZip}>Import ZIP…</MenuItem>
          <MenuSeparator />
          {p.onSnapshotNow && (
            <MenuItem onSelect={p.onSnapshotNow}>Snapshot now</MenuItem>
          )}
          {p.onOpenHistory && (
            <MenuItem onSelect={p.onOpenHistory}>History…</MenuItem>
          )}
          <MenuSeparator />
          <MenuSub>
            <MenuSubTrigger>Switch project</MenuSubTrigger>
            <MenuSubContent>
              {p.projects.length === 0 ? (
                <MenuLabel>(none)</MenuLabel>
              ) : (
                p.projects.map((proj) => (
                  <MenuItem
                    key={proj.id}
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
        <MenuTrigger>Edit</MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={p.onUndo} shortcut="Ctrl+Z">Undo</MenuItem>
          <MenuItem onSelect={p.onRedo} shortcut="Ctrl+Shift+Z">Redo</MenuItem>
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
        <MenuTrigger>Run</MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={p.onAssemble} shortcut="Ctrl+B" disabled={p.busy}>Build</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={p.onRun} shortcut="F5" disabled={!p.canRun || p.running}>Run</MenuItem>
          <MenuItem onSelect={p.onPause} shortcut="F6" disabled={!p.running}>Pause</MenuItem>
          <MenuItem onSelect={p.onStop} shortcut="Shift+F5">Stop</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={p.onStep} shortcut="F10" disabled={p.running}>Step</MenuItem>
          <MenuItem onSelect={p.onFrame} shortcut="F11" disabled={p.running}>Frame</MenuItem>
          {p.onToggleBp && (
            <MenuItem onSelect={p.onToggleBp} shortcut="F9">Toggle breakpoint</MenuItem>
          )}
          {p.onClearBp && (
            <MenuItem onSelect={p.onClearBp}>Clear all breakpoints</MenuItem>
          )}
          <MenuSeparator />
          <MenuItem onSelect={p.onReset} shortcut="Ctrl+Shift+F5">Restart</MenuItem>
        </MenuContent>
      </Menu>

      <Menu>
        <MenuTrigger>Help</MenuTrigger>
        <MenuContent>
          <MenuItem disabled>About</MenuItem>
          <MenuItem disabled>Shortcuts…</MenuItem>
        </MenuContent>
      </Menu>

      <div className="menubar__title">{p.activeProjectName}</div>
    </div>
  );
}
