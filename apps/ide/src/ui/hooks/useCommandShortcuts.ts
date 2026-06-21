import { useEffect } from "react";
import type { CommandContext, CommandRegistry } from "@ports";
import { eventToShortcut } from "../commands/shortcut";
import { PALETTE_COMMAND_ID } from "../commands/appCommands";

// Window-level keyboard shortcuts, dispatched entirely through the
// CommandRegistry. Each command carries its accelerator as `shortcut`
// ("Ctrl+Enter", "F10", …); a keystroke is formatted the same way and matched
// against that — one source of truth for the binding and the palette label.
//
// `when(ctx)` gating lives on the commands, so a disabled binding (e.g. Pause
// while idle) simply no-ops inside `run`. We still preventDefault on any
// recognised binding so the browser default (save-as, reload, …) never leaks.
//
// Web-IDE convention: Run-family is on Ctrl+Enter so we don't hijack browser
// reload (F5 / Ctrl+R). Ctrl+P stays with the browser; the palette is Ctrl+K
// (plus a Ctrl+Shift+P alias for VS Code muscle memory).
export function useCommandShortcuts(
  commands: CommandRegistry,
  getCtx: () => CommandContext,
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const combo = eventToShortcut(e);
      if (!combo) return;
      const id =
        combo === "Ctrl+Shift+P"
          ? PALETTE_COMMAND_ID
          : commands.list().find((c) => c.shortcut === combo)?.id;
      if (!id || !commands.has(id)) return;
      // Capture phase + stopPropagation so a matched accelerator beats any
      // descendant handler — notably CodeMirror, whose defaultKeymap binds
      // Shift-Alt-Arrow (copy line) and Mod-Arrow (word nav). Only matched
      // combos are swallowed; everything else (incl. emulator game keys, which
      // carry no app accelerator) bubbles through untouched.
      e.preventDefault();
      e.stopPropagation();
      void commands.run(id, getCtx());
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [commands, getCtx]);
}
