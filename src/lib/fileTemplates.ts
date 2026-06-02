// Registry of new-file templates. Each entry:
//  - shows up in the "+f" dropdown
//  - suggests a path (folder + name) based on where the user is creating
//  - seeds initial content
// To add new template kinds, append to TEMPLATES.

export interface FileTemplate {
  id: string;
  label: string;
  description?: string;
  // Suggested path; user can edit in the dialog before confirming.
  // parentDir is whatever container the user was acting on (context menu),
  // or "" when triggered from the top-level +f button.
  suggestedPath: (parentDir: string) => string;
  defaultContent: string;
}

const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

const CONVERTER_SCAFFOLD = `export const meta = {
  id: "new-converter",
  label: "New converter",
  inputExt: ["bin"],
  optionsSchema: [],
};

export default async function convert(input, opts) {
  // input: Uint8Array, opts: Record<string, unknown>
  return {
    bytes: input,
    mimeHint: "application/octet-stream",
    summary: \`\${input.length} bytes\`,
  };
}
`;

const ASM_SCAFFOLD = `; new file
        icl 'atari.a65'
        org $2000

start
        ; TODO
        jmp *

        run start
`;

export const TEMPLATES: FileTemplate[] = [
  {
    id: "empty",
    label: "Empty file",
    description: "Plain empty file",
    suggestedPath: (d) => join(d, "untitled.txt"),
    defaultContent: "",
  },
  {
    id: "asm",
    label: "ASM source",
    description: "MADS assembly stub",
    suggestedPath: (d) => join(d || "src", "new.asm"),
    defaultContent: ASM_SCAFFOLD,
  },
  {
    id: "asm-include",
    label: "ASM include",
    description: "Empty .inc file for shared equates / macros",
    suggestedPath: (d) => join(d || "src", "shared.inc"),
    defaultContent: "; shared equates / macros\n",
  },
  {
    id: "converter",
    label: "Converter",
    description: "JS converter module (meta + default convert)",
    suggestedPath: () => "converters/new-converter.js",
    defaultContent: CONVERTER_SCAFFOLD,
  },
  {
    id: "json",
    label: "JSON",
    description: "Empty JSON document",
    suggestedPath: (d) => join(d, "data.json"),
    defaultContent: "{}\n",
  },
];

export function findTemplate(id: string): FileTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
