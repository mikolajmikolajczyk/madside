import { useState } from "react";
import { Dialog, DialogContent } from "../ui/Dialog";
import "./GitHubDialog.css";

/** Save-to-GitHub dialog (#160): commit message + an "amend" toggle. Amend
 *  (default on) replaces our previous commit when it's still the branch HEAD, so
 *  repeated saves don't pile up commits; it harmlessly appends otherwise. */
export function GitHubPushDialog({
  open,
  defaultMessage,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  defaultMessage: string;
  onCancel: () => void;
  onConfirm: (message: string, amend: boolean) => void;
}) {
  const [message, setMessage] = useState(defaultMessage);
  const [amend, setAmend] = useState(true);
  // Reset on open (adjust-during-render, no setState-in-effect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setMessage(defaultMessage);
      setAmend(true);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent title="Save to GitHub" description="Commit message for this push.">
        <div className="gh-push">
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
              onClick={() => onConfirm(message, amend)}
            >
              Save
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
