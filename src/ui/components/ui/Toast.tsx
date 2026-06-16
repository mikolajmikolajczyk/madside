// Transient notification surface (ADR-0004: "no alerts; banner or panel state").
// Replaces native alert() in error paths. Errors auto-dismiss but can be closed;
// they stack and never block input.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { errorMessage } from "@ports";
import "./Toast.css";

type ToastKind = "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  push(kind: ToastKind, message: string): void;
  /** Surface an error. Accepts an Error or anything; extracts a human message. */
  error(e: unknown): void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DISMISS_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, kind, message }]);
    window.setTimeout(() => remove(id), DISMISS_MS);
  }, [remove]);

  const api = useMemo<ToastApi>(
    () => ({
      push,
      error: (e) => push("error", errorMessage(e)),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="region" aria-label="Notifications">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
            <span className="toast__msg">{t.message}</span>
            <button type="button" className="toast__close" aria-label="Dismiss" onClick={() => remove(t.id)}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast called outside <ToastProvider>");
  return api;
}
