// Dialog primitives + canned flows (text prompt, confirm).
// Replaces window.prompt / confirm. State-driven so callers can wire form values.

import * as RDialog from "@radix-ui/react-dialog";
import { useState, useEffect } from "react";
import "./ui.css";

export const Dialog = RDialog.Root;
export const DialogTrigger = RDialog.Trigger;

export function DialogContent({ children, title, description }: {
  children: React.ReactNode;
  title?: string;
  description?: string;
}) {
  return (
    <RDialog.Portal>
      <RDialog.Overlay className="ui-dialog__overlay" />
      <RDialog.Content className="ui-dialog__content">
        {title && <RDialog.Title className="ui-dialog__title">{title}</RDialog.Title>}
        {description && <RDialog.Description className="ui-dialog__desc">{description}</RDialog.Description>}
        {children}
      </RDialog.Content>
    </RDialog.Portal>
  );
}

// Canned: text input prompt. Open/close controlled by parent.
interface TextPromptProps {
  open: boolean;
  title: string;
  description?: string;
  initial?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}

export function TextPromptDialog(p: TextPromptProps) {
  const [value, setValue] = useState(p.initial ?? "");
  useEffect(() => { if (p.open) setValue(p.initial ?? ""); }, [p.open, p.initial]);

  return (
    <RDialog.Root open={p.open} onOpenChange={(o) => { if (!o) p.onCancel(); }}>
      <DialogContent title={p.title} description={p.description}>
        <form
          className="ui-dialog__form"
          onSubmit={(e) => { e.preventDefault(); p.onConfirm(value); }}
        >
          <input
            autoFocus
            className="ui-dialog__input"
            value={value}
            placeholder={p.placeholder}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="ui-dialog__actions">
            <button type="button" className="ui-dialog__btn" onClick={p.onCancel}>
              {p.cancelLabel ?? "Cancel"}
            </button>
            <button type="submit" className="ui-dialog__btn ui-dialog__btn--primary">
              {p.confirmLabel ?? "OK"}
            </button>
          </div>
        </form>
      </DialogContent>
    </RDialog.Root>
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog(p: ConfirmProps) {
  return (
    <RDialog.Root open={p.open} onOpenChange={(o) => { if (!o) p.onCancel(); }}>
      <DialogContent title={p.title} description={p.description}>
        <div className="ui-dialog__actions">
          <button type="button" className="ui-dialog__btn" onClick={p.onCancel}>
            {p.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            className={`ui-dialog__btn ui-dialog__btn--primary ${p.danger ? "ui-dialog__btn--danger" : ""}`}
            onClick={p.onConfirm}
            autoFocus
          >
            {p.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </DialogContent>
    </RDialog.Root>
  );
}
