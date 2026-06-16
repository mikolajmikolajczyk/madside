// Command palette — fuzzy-search the workbench CommandRegistry and run by id.
// Opened via Ctrl+K / Ctrl+Shift+P (see useCommandShortcuts). Lists only the
// commands runnable in the current context (their `when(ctx)` gate), shows each
// accelerator, and dispatches through `commands.run(id, ctx)` — the same path
// the keyboard shortcuts use. Plugin/panel-contributed commands appear here for
// free, since they register on the same registry.

import * as RDialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CommandContext, CommandRegistry } from "@ports";
import { fuzzyFilter, visibleCommands } from "../../commands/filterCommands";
import { PALETTE_COMMAND_ID } from "../../commands/appCommands";
import "./CommandPalette.css";

const EXCLUDE = new Set([PALETTE_COMMAND_ID]);

interface Props {
  open: boolean;
  onClose: () => void;
  commands: CommandRegistry;
  ctx: CommandContext;
}

export function CommandPalette({ open, onClose, commands, ctx }: Props) {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);

  // Runnable command set for this context (when()-gated), snapshot while open.
  const base = useMemo(
    () => (open ? visibleCommands(commands.list(), ctx, EXCLUDE) : []),
    [open, commands, ctx],
  );
  const results = useMemo(() => fuzzyFilter(base, query), [base, query]);

  useEffect(() => { if (open) { setQuery(""); setSel(0); } }, [open]);
  useEffect(() => { setSel(0); }, [query]);

  // Defer the chosen command until the palette has closed AND Radix has restored
  // focus to the pre-open element (usually the editor). Running it in
  // onCloseAutoFocus → microtask means a no-focus-change command (Run/Step/
  // Snapshot) leaves the caret back in the editor, while a command that
  // intentionally moves focus (Build → output) still wins (#24).
  const pendingRef = useRef<string | null>(null);
  const run = (id: string) => { pendingRef.current = id; onClose(); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const c = results[sel]; if (c) run(c.id); }
  };

  return (
    <RDialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <RDialog.Portal>
        <RDialog.Overlay className="ui-dialog__overlay" />
        <RDialog.Content
          className="cmdpal"
          aria-label="Command palette"
          onKeyDown={onKeyDown}
          onCloseAutoFocus={() => {
            const id = pendingRef.current;
            pendingRef.current = null;
            if (id) queueMicrotask(() => void commands.run(id, ctx));
          }}
        >
          <RDialog.Title className="cmdpal__sr-only">Command palette</RDialog.Title>
          <input
            autoFocus
            className="cmdpal__input"
            placeholder="Type a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            role="combobox"
            aria-label="Search commands"
            aria-expanded={results.length > 0}
            aria-controls="cmdpal-list"
            aria-autocomplete="list"
            aria-activedescendant={results[sel] ? `cmdpal-opt-${results[sel].id}` : undefined}
            data-testid="cmdpal.input"
          />
          <ul id="cmdpal-list" className="cmdpal__list" role="listbox" aria-label="Commands">
            {results.length === 0 && <li className="cmdpal__empty">No matching commands</li>}
            {results.map((c, i) => (
              <li
                key={c.id}
                id={`cmdpal-opt-${c.id}`}
                role="option"
                aria-selected={i === sel}
                className={"cmdpal__item" + (i === sel ? " cmdpal__item--sel" : "")}
                onMouseEnter={() => setSel(i)}
                onClick={() => run(c.id)}
                data-testid={`cmdpal.item.${c.id}`}
              >
                <span className="cmdpal__title">{c.title}</span>
                {c.shortcut && <span className="cmdpal__shortcut">{c.shortcut}</span>}
              </li>
            ))}
          </ul>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
