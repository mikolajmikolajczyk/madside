import { useState } from "react";
import { Dialog, DialogContent } from "../ui/Dialog";
import "./GitHubDialog.css";

/** Save-to-GitHub dialog (#160): pick the target repo (only on the first save —
 *  afterwards the project is bound and just shows where it goes), a commit
 *  message, and an "amend" toggle. Amend (default on) replaces our previous
 *  commit when it's still the branch HEAD, so repeated saves don't pile up
 *  commits; it harmlessly appends otherwise. */
export function GitHubPushDialog({
  open,
  defaultMessage,
  boundRepo,
  repos,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  defaultMessage: string;
  /** The repo the project is already bound to, or null on its first save. */
  boundRepo: string | null;
  /** Repos the user can push to (for the first-save picker). */
  repos: string[];
  onCancel: () => void;
  onConfirm: (message: string, amend: boolean, repo: string) => void;
}) {
  const [message, setMessage] = useState(defaultMessage);
  const [amend, setAmend] = useState(true);
  const [repo, setRepo] = useState<string>(boundRepo ?? "");
  // Reset on open (adjust-during-render, no setState-in-effect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setMessage(defaultMessage);
      setAmend(true);
      setRepo(boundRepo ?? "");
    }
  }

  const canSave = repo.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent title="Save to GitHub" description="Commit message for this push.">
        <div className="gh-push">
          {boundRepo ? (
            <p className="gh__muted">Saving to <strong>{boundRepo}</strong>.</p>
          ) : (
            <label className="gh__muted gh__field">
              Save to repo
              <select value={repo} onChange={(e) => setRepo(e.target.value)}>
                <option value="">Choose a repo…</option>
                {repos.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
          )}
          <textarea
            className="gh-push__msg"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Update project"
            spellCheck={false}
          />
          <label className="gh-push__amend">
            <input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} />
            Amend my last commit (if it's still the latest)
          </label>
          <div className="gh-push__actions">
            <button type="button" className="ui-dialog__btn" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="ui-dialog__btn ui-dialog__btn--primary"
              disabled={!canSave}
              onClick={() => canSave && onConfirm(message, amend, repo.trim())}
            >
              Save
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
