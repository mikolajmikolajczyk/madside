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

/** Window-level keyboard shortcuts for the debugger.
 *
 *  Ctrl-letter set (madside originals): Ctrl+S = save + assemble, Ctrl+B
 *  = assemble, Ctrl+R = run, Ctrl+P = pause, Ctrl+Shift+R = reset.
 *  VSCode-style F-keys: F5 = run, Shift+F5 = stop, Ctrl+Shift+F5 =
 *  restart, F6 = pause, F9 = toggle BP, F10 = step instr, F11 = step
 *  frame.
 *
 *  All callbacks are read fresh from the latest `ops` object on every
 *  keystroke, so the caller doesn't need to memoize them — the handler
 *  is registered once on mount. */
export function useDebuggerShortcuts(ops: ShortcutOps, state: ShortcutState) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const k = e.key.toLowerCase();
      const { canRun, running } = state;

      // Ctrl-letter set
      if (mod && shift && k === "r") { e.preventDefault(); void ops.onReset(); return; }
      if (mod && shift && k === "b") { e.preventDefault(); void ops.runAssemble(); return; }
      if (mod && !shift && k === "s") {
        e.preventDefault();
        void ops.runAssemble();
        ops.onSnapshot();
        return;
      }
      if (mod && !shift && k === "b") { e.preventDefault(); void ops.runAssemble(); return; }
      if (mod && !shift && k === "r") { e.preventDefault(); if (canRun && !running) void ops.onRun(); return; }
      if (mod && !shift && k === "p") { e.preventDefault(); if (running) ops.onPause(); return; }

      // VSCode-style debugger keys
      if (mod && shift && e.key === "F5") { e.preventDefault(); void ops.onReset(); return; }
      if (!mod && e.key === "F5") {
        e.preventDefault();
        if (shift) { ops.onStop(); return; }
        if (canRun && !running) void ops.onRun();
        return;
      }
      if (!mod && e.key === "F6") { e.preventDefault(); if (running) ops.onPause(); return; }
      if (!mod && e.key === "F9") { e.preventDefault(); ops.toggleBpAtCursor(); return; }
      if (!mod && e.key === "F10") { e.preventDefault(); if (!running) ops.onStep(); return; }
      if (!mod && e.key === "F11") { e.preventDefault(); if (!running) ops.onStepFrame(); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ops, state]);
}
