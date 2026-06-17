import { useMemo, useState } from "react";
import "./SystemTree.css";

// Read-only tree of a toolchain's sysroot files (#50). Built from flat POSIX
// paths; folders collapse, files are clickable to open read-only. No mutation
// affordances — these aren't project files. Kept separate from FileTree (which
// owns rename/delete/drag) so the read-only contract is structural.

interface DirNode {
  dirs: Map<string, DirNode>;
  files: string[]; // leaf names
}

function buildTree(paths: string[]): DirNode {
  const root: DirNode = { dirs: new Map(), files: [] };
  for (const path of paths) {
    const parts = path.split("/").filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i]!;
      let next = node.dirs.get(name);
      if (!next) { next = { dirs: new Map(), files: [] }; node.dirs.set(name, next); }
      node = next;
    }
    if (parts.length) node.files.push(parts[parts.length - 1]!);
  }
  return root;
}

function Dir({ name, node, prefix, depth, activePath, onSelect }: {
  name: string;
  node: DirNode;
  prefix: string;
  depth: number;
  activePath?: string;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1); // top level expanded, rest collapsed
  const dirNames = [...node.dirs.keys()].sort();
  const fileNames = [...node.files].sort();
  return (
    <>
      <div
        className="systree__row systree__row--dir"
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="systree__caret">{open ? "▾" : "▸"}</span>
        <span className="systree__name">{name}</span>
      </div>
      {open && dirNames.map((d) => (
        <Dir key={d} name={d} node={node.dirs.get(d)!} prefix={`${prefix}${d}/`} depth={depth + 1} activePath={activePath} onSelect={onSelect} />
      ))}
      {open && fileNames.map((f) => {
        const full = `${prefix}${f}`;
        return (
          <div
            key={f}
            className={"systree__row systree__row--file" + (full === activePath ? " systree__row--active" : "")}
            style={{ paddingLeft: 6 + (depth + 1) * 12 }}
            onClick={() => onSelect(full)}
          >
            <span className="systree__name">{f}</span>
          </div>
        );
      })}
    </>
  );
}

export function SystemTree({ label, files, activePath, onSelect }: {
  label: string;
  files: string[];
  activePath?: string;
  onSelect: (path: string) => void;
}) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [open, setOpen] = useState(false);
  if (files.length === 0) return null;
  const dirNames = [...tree.dirs.keys()].sort();
  const fileNames = [...tree.files].sort();
  return (
    <div className="systree">
      <div className="systree__title" onClick={() => setOpen((o) => !o)}>
        <span className="systree__caret">{open ? "▾" : "▸"}</span>
        <span className="systree__label">{label}</span>
        <span className="systree__ro">read-only</span>
      </div>
      {open && (
        <div className="systree__body" role="tree" aria-label={label}>
          {dirNames.map((d) => (
            <Dir key={d} name={d} node={tree.dirs.get(d)!} prefix={`${d}/`} depth={0} activePath={activePath} onSelect={onSelect} />
          ))}
          {fileNames.map((f) => (
            <div
              key={f}
              className={"systree__row systree__row--file" + (f === activePath ? " systree__row--active" : "")}
              style={{ paddingLeft: 18 }}
              onClick={() => onSelect(f)}
            >
              <span className="systree__name">{f}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
