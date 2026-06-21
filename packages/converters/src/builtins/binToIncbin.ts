// Emit raw bytes as MADS `dta` byte sequences. Validates the pipeline end-to-end.

import type { ConverterModule } from "../types";

const builtin: ConverterModule = {
  meta: {
    id: "bin-to-incbin",
    label: "Binary → MADS data",
    inputExt: ["bin", "raw"],
    optionsSchema: [
      { name: "label", type: "string", default: "data" },
      { name: "perLine", type: "number", default: 16, min: 1, max: 64 },
    ],
  },
  async convert(input, opts) {
    const label = String(opts.label ?? "data");
    const perLine = Math.max(1, Math.min(64, Number(opts.perLine ?? 16)));
    const lines: string[] = [];
    lines.push(`; generated from converter "bin-to-incbin"`);
    lines.push(`; ${input.length} bytes`);
    lines.push(`${label}`);
    for (let i = 0; i < input.length; i += perLine) {
      const slice = input.subarray(i, i + perLine);
      const parts = Array.from(slice, (b) => "$" + b.toString(16).toUpperCase().padStart(2, "0"));
      lines.push("        dta " + parts.join(","));
    }
    const text = lines.join("\n") + "\n";
    return {
      bytes: new TextEncoder().encode(text),
      mimeHint: "text/x-asm",
      summary: `${input.length} bytes → ${lines.length} lines`,
    };
  },
};

export default builtin;
