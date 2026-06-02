// Parse a CSV of numeric cells into a MADS `dta` table.
// Each row → one `dta` line. Hex (`$xx`) / binary (`%01`) / decimal accepted.

import type { ConverterModule } from "../types";

const builtin: ConverterModule = {
  meta: {
    id: "csv-to-data",
    label: "CSV → MADS data",
    inputExt: ["csv"],
    optionsSchema: [
      { name: "label", type: "string", default: "data" },
      { name: "size", type: "enum", options: ["byte", "word"], default: "byte" },
    ],
  },
  async convert(input, opts) {
    const label = String(opts.label ?? "data");
    const size = String(opts.size ?? "byte") === "word" ? "word" : "byte";
    const directive = size === "word" ? "dta a" : "dta";
    const text = new TextDecoder().decode(input);
    const lines: string[] = [];
    lines.push(`; generated from converter "csv-to-data" (${size})`);
    lines.push(`${label}`);
    let cells = 0;
    for (const rawRow of text.split(/\r?\n/)) {
      const row = rawRow.replace(/(^|,)\s*#[^,\n]*/g, ""); // strip inline `#` comments
      const trimmed = row.trim();
      if (!trimmed) continue;
      const fields = trimmed.split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map(parseCell);
      if (!fields.length) continue;
      cells += fields.length;
      lines.push("        " + directive + " " + fields.join(","));
    }
    const out = lines.join("\n") + "\n";
    return {
      bytes: new TextEncoder().encode(out),
      mimeHint: "text/x-asm",
      summary: `${cells} cells, ${size}`,
    };
  },
};

function parseCell(raw: string): string {
  // Pass through existing MADS literal syntax; otherwise format decimal.
  if (/^(\$[0-9a-fA-F]+|%[01]+|[<>]?[A-Za-z_][A-Za-z0-9_.]*|'.'|".")$/.test(raw)) return raw;
  const n = Number(raw);
  if (Number.isFinite(n)) return Math.trunc(n).toString();
  return raw;
}

export default builtin;
