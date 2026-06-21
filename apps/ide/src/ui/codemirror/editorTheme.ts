import { EditorView } from "@codemirror/view";
import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// Shared CodeMirror look. Lives here (not inline in Editor) so the read-only
// sysroot header viewer (#78) renders with the same colours + the same hover /
// tooltip chrome as the project editor.
export const editorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "var(--bg-primary)",
      color: "var(--text-primary)",
    },
    ".cm-content": { fontFamily: "var(--font-mono)", caretColor: "var(--accent-mint)" },
    ".cm-cursor": { borderLeftColor: "var(--accent-mint)" },
    ".cm-activeLine": { backgroundColor: "var(--bg-secondary)" },
    ".cm-activeLineGutter": { backgroundColor: "var(--bg-secondary)" },
    ".cm-gutters": {
      backgroundColor: "var(--bg-primary)",
      color: "var(--text-quaternary)",
      border: "none",
      borderRight: "1px solid var(--border-default)",
    },
    ".cm-selectionBackground, .cm-content ::selection, ::selection": { backgroundColor: "rgba(74, 222, 128, 0.25) !important" },
    "&.cm-focused .cm-selectionBackground": { backgroundColor: "rgba(74, 222, 128, 0.35) !important" },
    ".cm-pcLine": { backgroundColor: "rgba(0, 200, 150, 0.18)" },
    ".cm-bpGutter": {
      width: "16px",
      cursor: "pointer",
      backgroundColor: "var(--bg-primary)",
      borderRight: "1px solid var(--border-default)",
    },
    ".cm-bpGutter .cm-gutterElement": {
      textAlign: "center",
      color: "var(--accent-coral)",
      lineHeight: "1",
      paddingTop: "2px",
    },
    ".cm-bpGutter .cm-gutterElement:hover": {
      backgroundColor: "var(--bg-tertiary)",
    },
    ".cm-bpGutter .cm-gutterElement:hover:empty::before": {
      content: "'○'", opacity: 0.4, color: "var(--text-tertiary)",
    },
    ".cm-addrGutter": {
      backgroundColor: "var(--bg-primary)",
      borderRight: "1px solid var(--border-default)",
      color: "var(--text-quaternary)",
      fontFamily: "var(--font-mono)",
      fontSize: "11px",
    },
    ".cm-addrGutter .cm-gutterElement": {
      padding: "0 6px",
      textAlign: "right",
    },
    ".cm-addrGutter .cm-equateValue": {
      color: "var(--accent-amber)",
    },
    ".cm-tooltip.cm-tooltip-autocomplete": {
      background: "var(--bg-secondary)",
      border: "1px solid var(--border-default)",
      boxShadow: "0 6px 18px rgba(0,0,0,0.6)",
      fontFamily: "var(--font-mono)",
      fontSize: "12px",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul": {
      fontFamily: "var(--font-mono)",
      maxHeight: "260px",
    },
    ".cm-tooltip-autocomplete ul li": {
      color: "var(--text-secondary)",
      padding: "3px 8px",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      background: "var(--bg-tertiary)",
      color: "var(--accent-mint)",
    },
    ".cm-completionLabel": { color: "inherit" },
    ".cm-completionDetail": {
      color: "var(--text-quaternary)",
      fontStyle: "normal",
      marginLeft: "12px",
    },
    ".cm-completionIcon": {
      color: "var(--text-quaternary)",
      opacity: 0.8,
    },
    ".cm-mads-hover": {
      fontFamily: "var(--font-mono)",
      fontSize: "12px",
      color: "var(--text-primary)",
      padding: "4px 8px",
      maxWidth: "560px",
    },
    ".cm-mads-hover strong": { color: "var(--accent-mint)" },
    ".cm-tooltip.cm-tooltip-hover": {
      background: "var(--bg-secondary)",
      border: "1px solid var(--border-default)",
      boxShadow: "0 4px 12px rgba(0,0,0,0.6)",
    },
    // Build diagnostics (#29). Lint tooltip + gutter markers, themed to match.
    ".cm-tooltip.cm-tooltip-lint": {
      background: "var(--bg-secondary)",
      border: "1px solid var(--border-default)",
      boxShadow: "0 4px 12px rgba(0,0,0,0.6)",
    },
    ".cm-diagnostic": {
      fontFamily: "var(--font-mono)",
      fontSize: "12px",
      padding: "4px 8px",
      borderLeftWidth: "4px",
    },
    ".cm-diagnostic-error": { borderLeftColor: "var(--accent-coral)" },
    ".cm-diagnostic-warning": { borderLeftColor: "var(--accent-amber)" },
    ".cm-lintRange-error": { backgroundPosition: "left bottom" },
    ".cm-lint-marker-error": { color: "var(--accent-coral)" },
    ".cm-lint-marker-warning": { color: "var(--accent-amber)" },
    ".cm-mads-preview": {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      maxWidth: "560px",
    },
    ".cm-mads-preview-head": {
      fontSize: "10px",
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "var(--text-quaternary)",
    },
    ".cm-mads-preview-doc": {
      color: "var(--text-primary)",
      fontSize: "11px",
      lineHeight: "1.45",
      whiteSpace: "pre-wrap",
      borderLeft: "2px solid var(--accent-mint)",
      paddingLeft: "8px",
    },
    ".cm-mads-preview-body": {
      margin: 0,
      padding: "6px 8px",
      background: "var(--bg-primary)",
      border: "1px solid var(--border-default)",
      color: "var(--text-primary)",
      fontFamily: "var(--font-mono)",
      fontSize: "11px",
      lineHeight: "1.4",
      whiteSpace: "pre",
      overflow: "auto",
      maxHeight: "200px",
    },
    // LSP semantic tokens (#72) — painted over the lexical highlight, so these
    // win where the cc65-intel server resolves a real role the lexer can't see
    // (a macro vs a plain identifier, a struct field, a function). `!important`
    // beats the syntaxHighlighting span colour on the same range.
    // Target the mark span AND any nested lezer-highlight span (`… *`) so the
    // semantic colour wins whichever way CodeMirror nests the two overlapping
    // marks — `!important` on one span can't beat a colour the *other* span sets
    // on itself.
    ".cm-st-type, .cm-st-type *": { color: "var(--accent-peach) !important" },
    ".cm-st-function, .cm-st-function *": { color: "var(--text-heading) !important" },
    ".cm-st-macro, .cm-st-macro *": { color: "var(--accent-amber) !important" },
    ".cm-st-property, .cm-st-property *": { color: "var(--accent-mint) !important" },
    ".cm-st-parameter, .cm-st-parameter *": { color: "var(--text-primary) !important", fontStyle: "italic" },
    ".cm-st-variable, .cm-st-variable *": { color: "var(--text-primary) !important" },
    // Signature help popup (#71). The base `.cm-tooltip` chrome covers any
    // plain showTooltip (autocomplete/hover keep their more-specific styles).
    ".cm-tooltip": {
      background: "var(--bg-secondary)",
      border: "1px solid var(--border-default)",
      boxShadow: "0 4px 12px rgba(0,0,0,0.6)",
    },
    ".cm-cc65-sighelp": {
      fontFamily: "var(--font-mono)",
      fontSize: "12px",
      color: "var(--text-secondary)",
      padding: "4px 8px",
      maxWidth: "560px",
      whiteSpace: "pre-wrap",
    },
    ".cm-cc65-sighelp strong": { color: "var(--accent-mint)", fontWeight: "bold" },
  },
  { dark: true }
);

// Lezer token → colour. The cc65 palette is small (mint / amber / coral /
// peach), so tags are grouped by role: keywords mint, types + preprocessor
// peach, literals + constants amber, strings coral, functions bright, operators
// dimmed. Covers the full lezer-cpp tag set so C reads richly — distinct from
// the future LSP semantic-token highlighting (cc65-intel #72), which is an
// analysis-driven overlay, not a replacement for this lexical pass.
export const editorHighlight = HighlightStyle.define([
  { tag: [t.lineComment, t.blockComment, t.comment], color: "var(--text-tertiary)", fontStyle: "italic" },
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.modifier, t.moduleKeyword], color: "var(--accent-mint)" },
  { tag: [t.typeName, t.standard(t.typeName), t.namespace], color: "var(--accent-peach)" },
  { tag: [t.processingInstruction, t.meta], color: "var(--accent-peach)" },
  { tag: [t.number, t.literal, t.bool, t.null, t.atom], color: "var(--accent-amber)" },
  { tag: [t.special(t.name), t.constant(t.variableName)], color: "var(--accent-amber)" },
  { tag: [t.string, t.character, t.special(t.string)], color: "var(--accent-coral)" },
  { tag: t.escape, color: "var(--accent-peach)" },
  { tag: [t.function(t.variableName), t.function(t.definition(t.variableName)), t.function(t.propertyName)], color: "var(--text-heading)" },
  { tag: [t.operator, t.arithmeticOperator, t.logicOperator, t.bitwiseOperator, t.compareOperator, t.definitionOperator, t.updateOperator, t.derefOperator], color: "var(--text-secondary)" },
  { tag: [t.variableName, t.propertyName, t.labelName], color: "var(--text-primary)" },
]);
