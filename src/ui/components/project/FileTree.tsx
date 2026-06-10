import { useEffect, useMemo, useRef, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { basename, dirname as parentDir } from "@core/path";
import "./FileTree.css";
import "../ui/ui.css";

const PLACEHOLDER = ".gitkeep";

interface FileLike { path: string }

interface TreeFile { kind: "file"; path: string; name: string }
interface TreeFolder { kind: "folder"; path: string; name: string; children: TreeNode[] }
type TreeNode = TreeFile | TreeFolder;

interface Props {
  files: FileLike[];
  activePath: string;
  mainPath?: string;
  onSelect: (path: string) => void;
  // CRUD actions; consumers wire these to dialogs + store.
  onCreateFile: (parentDir: string) => void;       // parentDir "" = root
  onCreateFolder: (parentDir: string) => void;
  onRename: (path: string, isFolder: boolean, newName: string) => void;
  onDelete: (path: string, isFolder: boolean) => void;
  onDuplicate: (path: string) => void;
  onSetMain: (path: string) => void;
}

export function FileTree(p: Props) {
  const tree = useMemo(() => buildTree(p.files), [p.files]);
  // Default-expand all folders (small projects).
  const [expanded, setExpanded] = useState<Set<string>>(() => collectFolderPaths(tree));
  // When new folders appear in the project, expand them too.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const f of collectFolderPaths(tree)) next.add(f);
      return next;
    });
  }, [tree]);

  const [editing, setEditing] = useState<{ path: string; isFolder: boolean } | null>(null);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const beginRename = (path: string, isFolder: boolean) => setEditing({ path, isFolder });
  const cancelRename = () => setEditing(null);
  const commitRename = (oldPath: string, isFolder: boolean, newName: string) => {
    setEditing(null);
    if (!newName || newName === basename(oldPath)) return;
    const dir = parentDir(oldPath);
    const newPath = dir ? `${dir}/${newName}` : newName;
    p.onRename(oldPath, isFolder, newName);
    void newPath; // newPath constructed for caller's benefit; onRename gets newName, caller composes.
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div className="filetree">
          {tree.map((node) => (
            <NodeView
              key={node.path}
              node={node}
              depth={0}
              expanded={expanded}
              onToggle={toggle}
              activePath={p.activePath}
              mainPath={p.mainPath}
              editing={editing}
              onBeginRename={beginRename}
              onCancelRename={cancelRename}
              onCommitRename={commitRename}
              onSelect={p.onSelect}
              onCreateFile={p.onCreateFile}
              onCreateFolder={p.onCreateFolder}
              onDelete={p.onDelete}
              onDuplicate={p.onDuplicate}
              onSetMain={p.onSetMain}
            />
          ))}
          {tree.length === 0 && <div className="filetree__empty">(no files)</div>}
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="ui-menu__content">
          <ContextMenu.Item className="ui-menu__item" onSelect={() => p.onCreateFile("")}>New file…</ContextMenu.Item>
          <ContextMenu.Item className="ui-menu__item" onSelect={() => p.onCreateFolder("")}>New folder…</ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

interface NodeViewProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  activePath: string;
  mainPath?: string;
  editing: { path: string; isFolder: boolean } | null;
  onBeginRename: (path: string, isFolder: boolean) => void;
  onCancelRename: () => void;
  onCommitRename: (path: string, isFolder: boolean, newName: string) => void;
  onSelect: (path: string) => void;
  onCreateFile: (parentDir: string) => void;
  onCreateFolder: (parentDir: string) => void;
  onDelete: (path: string, isFolder: boolean) => void;
  onDuplicate: (path: string) => void;
  onSetMain: (path: string) => void;
}

function NodeView(p: NodeViewProps) {
  const { node } = p;
  const isFolder = node.kind === "folder";
  const isActive = !isFolder && node.path === p.activePath;
  const isMain = !isFolder && node.path === p.mainPath;
  const isExpanded = isFolder && p.expanded.has(node.path);
  const isEditing = p.editing?.path === node.path && p.editing.isFolder === isFolder;

  const rowKey = (e: React.KeyboardEvent) => {
    if (e.key === "F2") { e.preventDefault(); p.onBeginRename(node.path, isFolder); }
  };

  const onClick = () => {
    if (isFolder) p.onToggle(node.path);
    else p.onSelect(node.path);
  };

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div
            className={
              "filetree__row"
              + (isActive ? " filetree__row--active" : "")
              + (isMain ? " filetree__row--main" : "")
            }
            style={{ paddingLeft: 6 + p.depth * 12 }}
            tabIndex={0}
            onClick={onClick}
            onDoubleClick={() => p.onBeginRename(node.path, isFolder)}
            onKeyDown={rowKey}
            title={node.path}
          >
            <span className="filetree__caret">
              {isFolder ? (isExpanded ? "▾" : "▸") : ""}
            </span>
            <NodeIcon isFolder={isFolder} expanded={isExpanded} name={node.name} />
            {isEditing ? (
              <RenameInput
                initial={node.name}
                onCommit={(name) => p.onCommitRename(node.path, isFolder, name)}
                onCancel={p.onCancelRename}
              />
            ) : (
              <span className="filetree__name">{node.name}</span>
            )}
            {isMain && <span className="filetree__badge">main</span>}
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="ui-menu__content">
            {isFolder ? (
              <>
                <ContextMenu.Item className="ui-menu__item" onSelect={() => p.onCreateFile(node.path)}>New file…</ContextMenu.Item>
                <ContextMenu.Item className="ui-menu__item" onSelect={() => p.onCreateFolder(node.path)}>New folder…</ContextMenu.Item>
                <ContextMenu.Separator className="ui-menu__sep" />
                <ContextMenu.Item className="ui-menu__item" onSelect={() => p.onBeginRename(node.path, true)}>Rename</ContextMenu.Item>
                <ContextMenu.Item className="ui-menu__item ui-menu__item--danger" onSelect={() => p.onDelete(node.path, true)}>Delete</ContextMenu.Item>
              </>
            ) : (
              <>
                <ContextMenu.Item className="ui-menu__item" onSelect={() => p.onBeginRename(node.path, false)}>Rename</ContextMenu.Item>
                <ContextMenu.Item className="ui-menu__item" onSelect={() => p.onDuplicate(node.path)}>Duplicate…</ContextMenu.Item>
                <ContextMenu.Item className="ui-menu__item ui-menu__item--danger" onSelect={() => p.onDelete(node.path, false)}>Delete</ContextMenu.Item>
                <ContextMenu.Separator className="ui-menu__sep" />
                <ContextMenu.Item
                  className="ui-menu__item"
                  disabled={isMain}
                  onSelect={() => p.onSetMain(node.path)}
                >
                  Set as main
                </ContextMenu.Item>
              </>
            )}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      {isFolder && isExpanded && node.children.map((child) => (
        <NodeView
          key={child.path}
          {...p}
          node={child}
          depth={p.depth + 1}
        />
      ))}
    </>
  );
}

type IconKind = "code" | "json" | "image" | "binary" | "text" | "file";

function fileKind(name: string): IconKind {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot) : "";
  switch (ext) {
    case ".a65": case ".asm": case ".inc": case ".mac": case ".s": return "code";
    case ".json": return "json";
    case ".png": case ".jpg": case ".jpeg": case ".bmp": case ".gif": case ".tmx": return "image";
    case ".bin": case ".obx": case ".xex": case ".wasm": case ".rom": return "binary";
    case ".csv": case ".txt": case ".md": case ".lst": case ".lab": return "text";
    default: return "file";
  }
}

function NodeIcon({ isFolder, expanded, name }: { isFolder: boolean; expanded: boolean; name: string }) {
  if (isFolder) {
    return (
      <span className="filetree__icon filetree__icon--folder">
        {expanded ? (
          <svg viewBox="0 0 16 16" width={13} height={13} aria-hidden="true">
            <path d="M2 5 L6 5 L7 6 L14 6 L14 7 L2 7 Z" fill="currentColor" />
            <path d="M2 7 L3 13 L14 13 L15 7 Z" fill="currentColor" opacity="0.55" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width={13} height={13} aria-hidden="true">
            <path d="M2 5 L6 5 L7 6 L14 6 L14 13 L2 13 Z" fill="currentColor" />
          </svg>
        )}
      </span>
    );
  }
  const kind = fileKind(name);
  return (
    <span className={`filetree__icon filetree__icon--${kind}`}>
      <svg viewBox="0 0 16 16" width={13} height={13} aria-hidden="true">
        <path
          d="M3.5 2 L10 2 L13 5 L13 14 L3.5 14 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M10 2 L10 5 L13 5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        {kind === "code" && (
          <text x="8" y="12" textAnchor="middle" fontSize="6" fontFamily="monospace" fill="currentColor">a</text>
        )}
        {kind === "json" && (
          <text x="8" y="12" textAnchor="middle" fontSize="6" fontFamily="monospace" fill="currentColor">{`{}`}</text>
        )}
        {kind === "image" && (
          <circle cx="6.5" cy="11" r="1.2" fill="currentColor" />
        )}
        {kind === "binary" && (
          <text x="8" y="12" textAnchor="middle" fontSize="5" fontFamily="monospace" fill="currentColor">10</text>
        )}
        {kind === "text" && (
          <>
            <rect x="5" y="9" width="6" height="0.8" fill="currentColor" />
            <rect x="5" y="11" width="4" height="0.8" fill="currentColor" />
          </>
        )}
      </svg>
    </span>
  );
}

function RenameInput({ initial, onCommit, onCancel }: { initial: string; onCommit: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="filetree__input"
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); onCommit(value.trim()); }
        else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      }}
      onBlur={() => onCommit(value.trim())}
    />
  );
}

function buildTree(files: FileLike[]): TreeNode[] {
  const root: { children: TreeNode[] } = { children: [] };
  const folderIndex = new Map<string, TreeFolder>();

  for (const f of files) {
    if (basename(f.path) === PLACEHOLDER) {
      // Just register the parent folder; placeholder file itself isn't shown.
      const dir = parentDir(f.path);
      if (dir) ensureFolder(folderIndex, root, dir);
      continue;
    }
    const dir = parentDir(f.path);
    const parent = dir ? ensureFolder(folderIndex, root, dir) : root;
    parent.children.push({ kind: "file", path: f.path, name: basename(f.path) });
  }
  sortRecursive(root.children);
  return root.children;
}

function ensureFolder(idx: Map<string, TreeFolder>, root: { children: TreeNode[] }, dir: string): TreeFolder {
  const cached = idx.get(dir);
  if (cached) return cached;
  const parts = dir.split("/");
  let cursor: { children: TreeNode[] } = root;
  let cumulative = "";
  for (const part of parts) {
    cumulative = cumulative ? `${cumulative}/${part}` : part;
    let folder = idx.get(cumulative);
    if (!folder) {
      folder = { kind: "folder", path: cumulative, name: part, children: [] };
      idx.set(cumulative, folder);
      cursor.children.push(folder);
    }
    cursor = folder;
  }
  return cursor as TreeFolder;
}

function sortRecursive(nodes: TreeNode[]) {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const n of nodes) if (n.kind === "folder") sortRecursive(n.children);
}

function collectFolderPaths(nodes: TreeNode[]): Set<string> {
  const out = new Set<string>();
  const walk = (ns: TreeNode[]) => {
    for (const n of ns) if (n.kind === "folder") { out.add(n.path); walk(n.children); }
  };
  walk(nodes);
  return out;
}
