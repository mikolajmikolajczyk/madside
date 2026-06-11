import { useEffect } from "react";

interface ShortcutOps {
  runAssemble: () => Promise<unknown> | void;
  onRun: () => Promise<unknown> | void;
  onPause: () => void;
  onStop: () => void;
  onStep: () => void;
  onStepFrame: () => void;
  onReset: () => Promise<unknown> | void;
  toggleBpAtCursor: () => void;
  onSnapshot: () => void;
}

interface ShortcutState {
  canRun: boolean;
  running: boolean;
}

/** Window-level keyboard shortcuts. Web-IDE convention (replit / stackblitz /
 *  codepen) — Run-family lives on Ctrl+Enter so we don't hijack browser
 *  reload (F5 / Ctrl+R). Dropped bindings: F5, Shift+F5, Ctrl+Shift+F5,
 *  Ctrl+R, Ctrl+Shift+R, Ctrl+P — every one of them collides with browser
 *  reload / print and caused the "Run fires when I refresh" footgun.
 *
 *  Active map:
 *    Ctrl+Enter             — Run
 *    Ctrl+Shift+Enter       — Restart (reset + run if was running)
 *    Ctrl+.                 — Pause
 *    Ctrl+Shift+.           — Stop
 *    F9                     — Toggle breakpoint at cursor
 *    F10                    — Step instruction
 *    F11                    — Step frame
 *    Ctrl+S                 — Save + assemble + snapshot
 *    Ctrl+B / Ctrl+Shift+B  — Assemble (no save)
 *
 *  All callbacks are read fresh from the latest `ops` object on every
 *  keystroke, so the caller doesn't need to memoize them. */
export function useDebuggerShortcuts(ops: ShortcutOps, state: ShortcutState) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const k = e.key.toLowerCase();
      const { canRun, running } = state;

      // Save + build family (preventDefault stops browser save-as).
      if (mod && !shift && k === "s") {
        e.preventDefault();
        void ops.runAssemble();
        ops.onSnapshot();
        return;
      }
      if (mod && !shift && k === "b") { e.preventDefault(); void ops.runAssemble(); return; }
      if (mod && shift && k === "b")  { e.preventDefault(); void ops.runAssemble(); return; }

      // Run family — Ctrl+Enter (Cmd+Enter on Mac) keeps clear of browser
      // reload bindings.
      if (mod && !shift && k === "enter") {
        e.preventDefault();
        if (canRun && !running) void ops.onRun();
        return;
      }
      if (mod && shift && k === "enter") {
        e.preventDefault();
        void ops.onReset();
        return;
      }

      // Pause / Stop — Ctrl+. is the conventional debugger stop shortcut
      // (matches VSCode debugger Stop binding).
      if (mod && !shift && k === ".") {
        e.preventDefault();
        if (running) ops.onPause();
        return;
      }
      if (mod && shift && k === ".") {
        e.preventDefault();
        ops.onStop();
        return;
      }

      // Debugger keys with no browser collision (F9) or whose default we're
      // happy to preventDefault away (F10 menu bar, F11 fullscreen).
      if (!mod && e.key === "F9")  { e.preventDefault(); ops.toggleBpAtCursor(); return; }
      if (!mod && e.key === "F10") { e.preventDefault(); if (!running) ops.onStep(); return; }
      if (!mod && e.key === "F11") { e.preventDefault(); if (!running) ops.onStepFrame(); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ops, state]);
}
