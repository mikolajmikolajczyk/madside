// Extra JS completions tuned for writing madside converters.
// Wired through @codemirror/lang-javascript's `javascriptLanguage.data.of()`
// so it composes with lang-javascript's built-in scope-aware completion.

import { javascriptLanguage } from "@codemirror/lang-javascript";
import { snippet, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";

const CONVERTER_SCAFFOLD = `export const meta = {
  id: "\${1:converter-id}",
  label: "\${2:Human readable label}",
  inputExt: ["\${3:ext}"],
  optionsSchema: [
    { name: "\${4:option}", type: "string", default: "\${5:default}" },
  ],
};

export default async function convert(input, opts) {
  // input: Uint8Array (raw file bytes)
  // opts:  Record<string, unknown> validated against optionsSchema
  \${6:// TODO}
  return {
    bytes: new Uint8Array(),
    mimeHint: "text/x-asm",
    summary: "\${7:result summary}",
  };
}
`;

const META_BLOCK = `export const meta = {
  id: "\${1:id}",
  label: "\${2:label}",
  inputExt: ["\${3:ext}"],
  optionsSchema: [
    \${4}
  ],
};
`;

const CONVERT_FN = `export default async function convert(input, opts) {
  \${1:// TODO}
  return {
    bytes: \${2:new Uint8Array()},
    mimeHint: "\${3:text/x-asm}",
    summary: "\${4}",
  };
}
`;

const OPTION_NUMBER = `{ name: "\${1:name}", type: "number", default: \${2:0}, min: \${3:0}, max: \${4:255} },`;
const OPTION_STRING = `{ name: "\${1:name}", type: "string", default: "\${2}" },`;
const OPTION_ENUM   = `{ name: "\${1:name}", type: "enum", options: ["\${2:a}", "\${3:b}"], default: "\${2:a}" },`;
const OPTION_BOOL   = `{ name: "\${1:name}", type: "boolean", default: \${2:false} },`;

const SNIPPETS: { label: string; detail: string; info?: string; template: string; boost?: number }[] = [
  {
    label: "converter",
    detail: "scaffold full converter module",
    info: "meta + default convert(input, opts) — drop into converters/*.js",
    template: CONVERTER_SCAFFOLD,
    boost: 10,
  },
  { label: "meta",         detail: "metadata block",          template: META_BLOCK,   boost: 8 },
  { label: "convert-fn",   detail: "convert default export",  template: CONVERT_FN,   boost: 8 },
  { label: "option-number", detail: "number option entry",    template: OPTION_NUMBER, boost: 6 },
  { label: "option-string", detail: "string option entry",    template: OPTION_STRING, boost: 6 },
  { label: "option-enum",   detail: "enum option entry",      template: OPTION_ENUM,   boost: 6 },
  { label: "option-bool",   detail: "boolean option entry",   template: OPTION_BOOL,   boost: 6 },
];

// Quick references for the converter API surface. These are completion items
// the user can pick; they paste straight literal text (no placeholders).
const API_HINTS: { label: string; detail: string; info?: string }[] = [
  { label: "Uint8Array",   detail: "new Uint8Array(len) | new Uint8Array([...])", info: "raw byte buffer; input & output type" },
  { label: "TextEncoder",  detail: "new TextEncoder().encode(str) → Uint8Array",   info: "for emitting text payloads" },
  { label: "TextDecoder",  detail: "new TextDecoder().decode(bytes) → string",     info: "for parsing text inputs (CSV, JSON, etc.)" },
  { label: "createImageBitmap", detail: "await createImageBitmap(blobOrUint8Array)", info: "decode PNG/JPG without dragging in a DOM <img>" },
  { label: "OffscreenCanvas",  detail: "new OffscreenCanvas(w, h)",                info: "for reading pixel data off image bitmaps" },
  { label: "DataView",     detail: "new DataView(buf.buffer, offset, length)",      info: "endian-aware reads/writes" },
];

function jsConverterCompletions(ctx: CompletionContext): CompletionResult | null {
  const word = ctx.matchBefore(/[A-Za-z_$][A-Za-z0-9_$-]*/);
  if (!word) return null;
  if (word.from === word.to && !ctx.explicit) return null;

  const options: {
    label: string;
    type?: string;
    detail?: string;
    info?: string;
    apply?: ReturnType<typeof snippet>;
    boost?: number;
  }[] = [];

  for (const s of SNIPPETS) {
    options.push({
      label: s.label,
      type: "function",
      detail: s.detail,
      info: s.info,
      apply: snippet(s.template),
      boost: s.boost,
    });
  }

  for (const h of API_HINTS) {
    options.push({
      label: h.label,
      type: "class",
      detail: h.detail,
      info: h.info,
    });
  }

  return { from: word.from, options, validFor: /^[A-Za-z0-9_$-]*$/ };
}

// Extension to add into the editor — it composes with lang-javascript's own
// scope-aware completion source via languageData facet.
export const jsConverterExtras = javascriptLanguage.data.of({
  autocomplete: jsConverterCompletions,
});
