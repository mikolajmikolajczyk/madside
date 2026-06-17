import { useRef, useState } from "react";
import { basename, dirname as parentDir } from "@core/path";
import { FileTree } from "./FileTree";
import { TextPromptDialog, ConfirmDialog } from "../ui/Dialog";
import { Tip } from "../ui/Tooltip";
import { useToast } from "../ui/Toast";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "../ui/Menu";
import { TEMPLATES, findTemplate, type FileTemplate } from "@app/fileTemplates";
import "./Explorer.css";

interface FileEntry { path: string }

interface Props {
  files: FileEntry[];
  active: string;
  mainPath?: string;
  onSelect: (path: string) => void;
  onCreateFile: (path: string, content?: string) => Promise<unknown>;
  /** Import a raw file from outside the project (upload / drag-drop). Binary-
   *  safe — bytes are stored verbatim so PNG/bin survive intact (#31). */
  onImportFile: (path: string, bytes: Uint8Array) => Promise<unknown>;
  onCreateFolder: (path: string) => Promise<unknown>;
  onRenameFile: (oldPath: string, newPath: string) => Promise<unknown>;
  onRenameFolder: (oldPrefix: string, newPrefix: string) => Promise<unknown>;
  onDeleteFile: (path: string) => Promise<unknown>;
  onDeleteFolder: (prefix: string) => Promise<unknown>;
  onDuplicateFile: (path: string, newPath: string) => Promise<unknown>;
  onSetMain: (path: string) => Promise<unknown>;
}

type DialogState =
  | { kind: "none" }
  | { kind: "newFile"; parentDir: string; templateId: string }
  | { kind: "newFolder"; parentDir: string }
  | { kind: "duplicate"; sourcePath: string }
  | { kind: "deleteFile"; path: string }
  | { kind: "deleteFolder"; prefix: string };

const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

export function Explorer(props: Props) {
  const toast = useToast();
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const close = () => setDialog({ kind: "none" });

  const importInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Import one or more external files into `dir` (root by default). Binary-safe;
  // collisions get a `-N` suffix so an import never clobbers an existing file.
  const importFiles = async (fileList: FileList | File[], dir = "") => {
    const list = Array.from(fileList);
    if (list.length === 0) return;
    const taken = new Set(props.files.map((f) => f.path));
    let firstPath: string | null = null;
    let count = 0;
    for (const file of list) {
      const path = uniquePath(taken, dir, sanitizeName(file.name));
      taken.add(path);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        await props.onImportFile(path, bytes);
        if (!firstPath) firstPath = path;
        count++;
      } catch (e) {
        toast.error(e);
      }
    }
    if (firstPath) props.onSelect(firstPath);
    if (count > 0) toast.push("info", `Imported ${count} file${count > 1 ? "s" : ""}`);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) void importFiles(e.dataTransfer.files);
  };

  // Default template for context-menu "New file" — first entry in the registry.
  const defaultTemplate: FileTemplate = TEMPLATES[0];

  const handleCreateFile = (parentDir: string) =>
    setDialog({ kind: "newFile", parentDir, templateId: defaultTemplate.id });
  const handleCreateFromTemplate = (parentDir: string, templateId: string) =>
    setDialog({ kind: "newFile", parentDir, templateId });

  const handleCreateFolder = (parentDir: string) => setDialog({ kind: "newFolder", parentDir });
  const handleDuplicate = (sourcePath: string) => setDialog({ kind: "duplicate", sourcePath });
  const handleDelete = (path: string, isFolder: boolean) =>
    setDialog(isFolder ? { kind: "deleteFolder", prefix: path } : { kind: "deleteFile", path });

  const handleRename = async (oldPath: string, isFolder: boolean, newName: string) => {
    if (!newName) return;
    if (newName === basename(oldPath)) return;
    const dir = parentDir(oldPath);
    const newPath = joinPath(dir, newName);
    try {
      if (isFolder) await props.onRenameFolder(oldPath, newPath);
      else await props.onRenameFile(oldPath, newPath);
    } catch (e) {
      toast.error(e);
    }
  };

  const activeTemplate = dialog.kind === "newFile" ? findTemplate(dialog.templateId) : undefined;
  const newFileInitial = dialog.kind === "newFile" && activeTemplate
    ? activeTemplate.suggestedPath(dialog.parentDir)
    : "";

  return (
    <aside
      className={`explorer${dragOver ? " explorer--dragover" : ""}`}
      data-focus-region="explorer"
      onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={onDrop}
    >
      <input
        ref={importInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = e.target.files;
          e.target.value = "";
          if (files) void importFiles(files);
        }}
      />
      <div className="explorer__header">
        <span className="explorer__label label">Files</span>
        <div className="explorer__actions">
          <Tip label="Import file" side="bottom">
            <button
              className="explorer__iconbtn"
              onClick={() => importInputRef.current?.click()}
              aria-label="Import file"
            >↥</button>
          </Tip>
          <Menu>
            <Tip label="New file" side="bottom">
              <MenuTrigger className="explorer__iconbtn" aria-label="New file">+f</MenuTrigger>
            </Tip>
            <MenuContent align="end">
              {TEMPLATES.map((t) => (
                <MenuItem
                  key={t.id}
                  onSelect={() => handleCreateFromTemplate("", t.id)}
                >
                  {t.label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
          <Tip label="New folder" side="bottom">
            <button className="explorer__iconbtn" onClick={() => handleCreateFolder("")} aria-label="New folder">+/</button>
          </Tip>
        </div>
      </div>
      <FileTree
        files={props.files}
        activePath={props.active}
        mainPath={props.mainPath}
        onSelect={props.onSelect}
        onCreateFile={handleCreateFile}
        onCreateFolder={handleCreateFolder}
        onRename={handleRename}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onSetMain={(p) => { void props.onSetMain(p); }}
      />

      <TextPromptDialog
        open={dialog.kind === "newFile"}
        title={activeTemplate ? `New file — ${activeTemplate.label}` : "New file"}
        description={activeTemplate?.description ?? "Path is relative to project root."}
        placeholder="path/to/file"
        initial={newFileInitial}
        confirmLabel="Create"
        onCancel={close}
        onConfirm={async (path) => {
          const d = dialog;
          close();
          if (!path.trim() || d.kind !== "newFile") return;
          const tpl = findTemplate(d.templateId);
          const content = tpl?.defaultContent ?? "";
          try { await props.onCreateFile(path.trim(), content); }
          catch (e) { toast.error(e); }
        }}
      />
      <TextPromptDialog
        open={dialog.kind === "newFolder"}
        title="New folder"
        description={dialog.kind === "newFolder" && dialog.parentDir
          ? `Creating inside ${dialog.parentDir}/`
          : "Path is relative to project root."}
        placeholder="assets"
        initial=""
        confirmLabel="Create"
        onCancel={close}
        onConfirm={async (name) => {
          const d = dialog;
          close();
          if (!name.trim() || d.kind !== "newFolder") return;
          const fullPath = joinPath(d.parentDir, name.trim());
          try { await props.onCreateFolder(fullPath); }
          catch (e) { toast.error(e); }
        }}
      />
      <TextPromptDialog
        open={dialog.kind === "duplicate"}
        title="Duplicate file"
        description={dialog.kind === "duplicate" ? `Copy of ${dialog.sourcePath}` : ""}
        initial={dialog.kind === "duplicate" ? suggestDup(dialog.sourcePath) : ""}
        confirmLabel="Duplicate"
        onCancel={close}
        onConfirm={async (path) => {
          const d = dialog;
          close();
          if (!path.trim() || d.kind !== "duplicate") return;
          try { await props.onDuplicateFile(d.sourcePath, path.trim()); }
          catch (e) { toast.error(e); }
        }}
      />
      <ConfirmDialog
        open={dialog.kind === "deleteFile"}
        title={dialog.kind === "deleteFile" ? `Delete ${basename(dialog.path)}?` : ""}
        description="Cannot be undone."
        confirmLabel="Delete"
        danger
        onCancel={close}
        onConfirm={async () => {
          const d = dialog;
          close();
          if (d.kind !== "deleteFile") return;
          await props.onDeleteFile(d.path);
        }}
      />
      <ConfirmDialog
        open={dialog.kind === "deleteFolder"}
        title={dialog.kind === "deleteFolder" ? `Delete folder ${dialog.prefix}?` : ""}
        description="All files inside will be removed. Cannot be undone."
        confirmLabel="Delete"
        danger
        onCancel={close}
        onConfirm={async () => {
          const d = dialog;
          close();
          if (d.kind !== "deleteFolder") return;
          await props.onDeleteFolder(d.prefix);
        }}
      />
    </aside>
  );
}

// Browsers hand back a bare filename, but be defensive: strip any path parts and
// characters that don't belong in a project path.
function sanitizeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.replace(/[^A-Za-z0-9._-]/g, "_") || "imported";
}

// First free `dir/name`, suffixing `-1`, `-2`, … before the extension on
// collision so an import never overwrites an existing file.
function uniquePath(taken: ReadonlySet<string>, dir: string, name: string): string {
  let candidate = joinPath(dir, name);
  if (!taken.has(candidate)) return candidate;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 1; ; i++) {
    candidate = joinPath(dir, `${stem}-${i}${ext}`);
    if (!taken.has(candidate)) return candidate;
  }
}

function suggestDup(path: string): string {
  const dir = parentDir(path);
  const name = basename(path);
  const dotIdx = name.lastIndexOf(".");
  const stem = dotIdx > 0 ? name.slice(0, dotIdx) : name;
  const ext = dotIdx > 0 ? name.slice(dotIdx) : "";
  return joinPath(dir, `${stem}-copy${ext}`);
}
