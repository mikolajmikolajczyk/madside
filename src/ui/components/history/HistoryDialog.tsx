// Dialog showing per-project snapshot list with restore/delete actions.

import * as RDialog from "@radix-ui/react-dialog";
import { useMemo, useState } from "react";
import { diffSnapshots, type SnapshotMeta } from "@adapters/storage-idb";
import { ConfirmDialog } from "../ui/Dialog";
import "../ui/ui.css";
import "./HistoryDialog.css";

interface Props {
  open: boolean;
  snapshots: SnapshotMeta[];
  onClose: () => void;
  onRestore: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCreateNow: (summary?: string) => Promise<unknown>;
}

export function HistoryDialog(p: Props) {
  const [pending, setPending] = useState<
    | { kind: "none" }
    | { kind: "restore"; id: string; summary: string }
    | { kind: "delete"; id: string; summary: string }
  >({ kind: "none" });
  const closePending = () => setPending({ kind: "none" });
  const [diffOf, setDiffOf] = useState<string | null>(null);

  // Diff target = `diffOf` snapshot vs the next-older snapshot in the list.
  const diff = useMemo(() => {
    if (!diffOf) return null;
    const idx = p.snapshots.findIndex((s) => s.id === diffOf);
    if (idx < 0) return null;
    const newer = p.snapshots[idx];
    const older = p.snapshots[idx + 1];   // list is sorted desc; older comes after
    if (!older) return { newer, older: null, d: null };
    return { newer, older, d: diffSnapshots(older, newer) };
  }, [diffOf, p.snapshots]);

  return (
    <>
      <RDialog.Root open={p.open} onOpenChange={(o) => { if (!o) p.onClose(); }}>
        <RDialog.Portal>
          <RDialog.Overlay className="ui-dialog__overlay" />
          <RDialog.Content className="ui-dialog__content history">
            <RDialog.Title className="ui-dialog__title">History</RDialog.Title>
            <RDialog.Description className="ui-dialog__desc">
              Snapshots taken on Ctrl+S or after 30s of no edits. Restore overwrites the project; the deleted state can still be recovered from earlier snapshots.
            </RDialog.Description>

            <div className="history__list">
              {p.snapshots.length === 0 ? (
                <div className="history__empty">No snapshots yet. Press Ctrl+S to take one.</div>
              ) : (
                p.snapshots.map((s) => (
                  <div key={s.id} className="history__row">
                    <div className="history__cell history__cell--meta">
                      <span className="history__time">{relativeTime(s.ts)}</span>
                      <span className="history__abs">{new Date(s.ts).toLocaleString()}</span>
                    </div>
                    <div className="history__cell history__cell--summary">
                      <span className={"history__tag history__tag--" + s.summary}>{s.summary}</span>
                      <span className="history__count">{Object.keys(s.tree).length} files</span>
                    </div>
                    <div className="history__cell history__cell--actions">
                      <button
                        className="history__btn"
                        onClick={() => setDiffOf(s.id)}
                      >Diff</button>
                      <button
                        className="history__btn"
                        onClick={() => setPending({ kind: "restore", id: s.id, summary: s.summary })}
                      >Restore</button>
                      <button
                        className="history__btn history__btn--danger"
                        onClick={() => setPending({ kind: "delete", id: s.id, summary: s.summary })}
                      >Delete</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="ui-dialog__actions">
              <button
                type="button"
                className="ui-dialog__btn"
                onClick={() => void p.onCreateNow("manual")}
              >Snapshot now</button>
              <button type="button" className="ui-dialog__btn ui-dialog__btn--primary" onClick={p.onClose}>Close</button>
            </div>
          </RDialog.Content>
        </RDialog.Portal>
      </RDialog.Root>

      <ConfirmDialog
        open={pending.kind === "restore"}
        title={pending.kind === "restore" ? `Restore snapshot?` : ""}
        description="Project files will be overwritten with this snapshot's contents. Any files added since will be removed. A fresh snapshot of the current state is recommended before restoring."
        confirmLabel="Restore"
        onCancel={closePending}
        onConfirm={async () => {
          if (pending.kind !== "restore") return;
          const id = pending.id;
          closePending();
          await p.onRestore(id);
        }}
      />
      <RDialog.Root open={diff !== null} onOpenChange={(o) => { if (!o) setDiffOf(null); }}>
        <RDialog.Portal>
          <RDialog.Overlay className="ui-dialog__overlay" />
          <RDialog.Content className="ui-dialog__content history">
            <RDialog.Title className="ui-dialog__title">Snapshot diff</RDialog.Title>
            <RDialog.Description className="ui-dialog__desc">
              {diff?.older
                ? `Changes from ${new Date(diff.older.ts).toLocaleString()} → ${new Date(diff.newer.ts).toLocaleString()}.`
                : "This is the oldest snapshot — nothing to diff against."}
            </RDialog.Description>
            {diff?.d && (
              <div className="history__diff">
                <DiffSection label="added" tone="add" items={diff.d.added} />
                <DiffSection label="removed" tone="rm" items={diff.d.removed} />
                <DiffSection label="modified" tone="mod" items={diff.d.modified} />
                <div className="history__diff-unchanged">{diff.d.unchanged} files unchanged</div>
              </div>
            )}
            <div className="ui-dialog__actions">
              <button type="button" className="ui-dialog__btn ui-dialog__btn--primary" onClick={() => setDiffOf(null)}>Close</button>
            </div>
          </RDialog.Content>
        </RDialog.Portal>
      </RDialog.Root>

      <ConfirmDialog
        open={pending.kind === "delete"}
        title="Delete snapshot?"
        description="The snapshot is removed; underlying file blobs may stay in storage until a future cleanup pass."
        confirmLabel="Delete"
        danger
        onCancel={closePending}
        onConfirm={async () => {
          if (pending.kind !== "delete") return;
          const id = pending.id;
          closePending();
          await p.onDelete(id);
        }}
      />
    </>
  );
}

function DiffSection({ label, tone, items }: { label: string; tone: "add" | "rm" | "mod"; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className={"history__diff-section history__diff-section--" + tone}>
      <div className="history__diff-head">{label} ({items.length})</div>
      <ul className="history__diff-list">
        {items.map((p) => <li key={p}>{p}</li>)}
      </ul>
    </div>
  );
}

function relativeTime(ts: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - ts) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
