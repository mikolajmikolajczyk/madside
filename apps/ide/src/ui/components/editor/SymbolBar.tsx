import type { PointerEvent as ReactPointerEvent } from "react";
import type { EditorView } from "@codemirror/view";
import {
  indentMore,
  cursorCharLeft,
  cursorCharRight,
  cursorLineUp,
  cursorLineDown,
  cursorLineBoundaryBackward,
  cursorLineBoundaryForward,
} from "@codemirror/commands";
import "./SymbolBar.css";

// On-screen-keyboard accessory bar (#144). Soft keyboards bury exactly the chars
// retro code needs (`# $ @ .` for MADS/asm, `{ } ( ) ; [ ] *` for C). A single
// app-level horizontal scrollable toolbar that floats just above the soft
// keyboard (anchored to the visual viewport, so it tracks the iPad OSK rather
// than hiding behind it), inserting at the cursor / driving navigation without
// the editor losing focus (so the keyboard stays open).

const SYMBOLS = [
  "#", "$", "%", "&", "(", ")", "[", "]", "{", "}", "<", ">", ";", ":", ",", ".",
  "\"", "'", "/", "\\", "|", "~", "^", "*", "+", "-", "=", "_", "@",
];

interface SpecialKey {
  label: string;
  run: (view: EditorView) => void;
  wide?: boolean;
  arrow?: boolean;
  /** This key intentionally dismisses the keyboard (Esc) — don't re-focus after. */
  blur?: boolean;
}

const SPECIAL: SpecialKey[] = [
  { label: "Tab", run: (v) => { indentMore(v); }, wide: true },
  { label: "←", run: (v) => { cursorCharLeft(v); }, arrow: true },
  { label: "→", run: (v) => { cursorCharRight(v); }, arrow: true },
  { label: "↑", run: (v) => { cursorLineUp(v); }, arrow: true },
  { label: "↓", run: (v) => { cursorLineDown(v); }, arrow: true },
  { label: "Home", run: (v) => { cursorLineBoundaryBackward(v); }, wide: true },
  { label: "End", run: (v) => { cursorLineBoundaryForward(v); }, wide: true },
  { label: "Esc", run: (v) => v.contentDOM.blur(), wide: true, blur: true },
];

function insertAtCursor(view: EditorView, text: string): void {
  view.dispatch(view.state.replaceSelection(text));
  view.focus();
}

/** The floating accessory bar. `getView` reads the focused EditorView; `bottomPx`
 *  is how far above the screen bottom to sit (the keyboard's occluded height, so
 *  the bar rests right on top of the OSK). Buttons preventDefault on pointerdown
 *  so tapping one never blurs the editor — the cursor + soft keyboard stay put. */
export function SymbolBar({ getView, bottomPx }: { getView: () => EditorView | null; bottomPx: number }) {
  // Keep the editor focused: a pointerdown that lands on the bar must not move
  // focus off the contenteditable (which would dismiss the OSK).
  const keep = (e: ReactPointerEvent) => e.preventDefault();

  return (
    <div
      className="cm-symbolbar"
      role="toolbar"
      aria-label="Code symbols"
      data-testid="editor.symbolbar"
      style={{ bottom: bottomPx }}
    >
      {/* Symbols scroll horizontally… */}
      <div className="cm-symbolbar__scroll">
        {SYMBOLS.map((s) => (
          <button
            key={s}
            type="button"
            className="cm-symbolbar__key"
            onPointerDown={keep}
            onClick={() => { const v = getView(); if (v) insertAtCursor(v, s); }}
          >
            {s}
          </button>
        ))}
      </div>
      {/* …while the navigation keys stay pinned, always reachable. */}
      <div className="cm-symbolbar__fixed">
        {SPECIAL.map((k) => (
          <button
            key={k.label}
            type="button"
            className={"cm-symbolbar__key" + (k.wide ? " cm-symbolbar__key--wide" : "") + (k.arrow ? " cm-symbolbar__key--arrow" : "")}
            onPointerDown={keep}
            onClick={() => {
              const v = getView();
              if (!v) return;
              k.run(v);
              // Re-assert focus so iOS doesn't dismiss the keyboard after a tap
              // (preventDefault isn't always enough); Esc is the one that should
              // close it.
              if (!k.blur) v.focus();
            }}
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}
