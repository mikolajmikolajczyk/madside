import { useEffect, useMemo, useRef, useState } from "react";
import { byteHex, hex } from "@core/hex";
import type { ConverterMeta, ConverterModule, OptionSpec, ProjectManifestV2 as Manifest, Recipe } from "@ports";
import { buildConverterRegistry as buildRegistry, type ProjectConverterSource } from "@app";
import "./AssetPanel.css";

interface Props {
  filename: string;                     // active file's project path
  bytes: Uint8Array;                    // raw file bytes
  files: { path: string; content: Uint8Array }[];
  manifest: Manifest;
  onUpdateManifest: (next: Manifest) => Promise<unknown> | unknown;
  onUpdateFile: (bytes: Uint8Array) => Promise<unknown> | unknown; // write raw edits back
  onForceBuild: () => void;             // re-run assemble after recipe update
}

const utf8 = new TextDecoder();
const utf8enc = new TextEncoder();

// Assets we can sensibly edit as text. Everything else (png/wav/bin) is
// binary — show the preview only, no textarea that would corrupt the bytes.
const BINARY_EXTS = new Set(["png", "jpg", "jpeg", "gif", "bmp", "bin", "raw", "wav"]);
const isTextAsset = (ext: string) => !BINARY_EXTS.has(ext);

// Does the current form produce the exact recipe already saved? Used to hide
// "Update recipe" when there's nothing to update.
function recipeMatchesForm(
  recipe: Recipe | undefined,
  form: { converter: string; output: string; options: Record<string, unknown> },
): boolean {
  if (!recipe) return false;
  if (recipe.converter !== form.converter) return false;
  if (recipe.output !== form.output) return false;
  const a = recipe.options ?? {};
  const b = form.options;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export function AssetPanel(p: Props) {
  const ext = (p.filename.split(".").pop() ?? "").toLowerCase();
  const textEditable = isTextAsset(ext);

  const [view, setView] = useState<"preview" | "raw">("preview");

  const [registry, setRegistry] = useState<Map<string, ConverterModule> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const sources: ProjectConverterSource[] = p.files
      .filter((f) => /^converters\/[^/]+\.js$/.test(f.path))
      .map((f) => ({ path: f.path, content: utf8.decode(f.content) }));
    buildRegistry(sources).then((r) => { if (!cancelled) setRegistry(r); }).catch(console.error);
    return () => { cancelled = true; };
  }, [p.files]);

  const applicableConverters = useMemo<ConverterMeta[]>(() => {
    if (!registry) return [];
    const out: ConverterMeta[] = [];
    for (const mod of registry.values()) {
      if (mod.meta.inputExt.some((e) => e.toLowerCase() === ext)) out.push(mod.meta);
    }
    return out;
  }, [registry, ext]);

  const existingRecipe = useMemo<Recipe | undefined>(() => {
    return p.manifest.recipes?.find((r) => r.input === p.filename);
  }, [p.manifest, p.filename]);

  const [selectedId, setSelectedId] = useState<string>(
    existingRecipe?.converter ?? applicableConverters[0]?.id ?? "",
  );
  useEffect(() => {
    if (!selectedId && applicableConverters[0]) setSelectedId(applicableConverters[0].id);
    if (existingRecipe && selectedId !== existingRecipe.converter) setSelectedId(existingRecipe.converter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.filename, applicableConverters.length, existingRecipe?.converter]);

  const selectedMeta = applicableConverters.find((m) => m.id === selectedId);

  const [options, setOptions] = useState<Record<string, unknown>>({});
  useEffect(() => {
    if (!selectedMeta) return;
    const next: Record<string, unknown> = {};
    for (const spec of selectedMeta.optionsSchema) {
      next[spec.name] = existingRecipe?.options?.[spec.name] ?? spec.default;
    }
    setOptions(next);
  }, [selectedMeta, existingRecipe]);

  const defaultOutput = useMemo(() => {
    const stem = p.filename.replace(/^assets\//, "").replace(/\.[^./]+$/, "");
    return `generated/${stem || "out"}.asm`;
  }, [p.filename]);

  const [output, setOutput] = useState<string>(existingRecipe?.output ?? defaultOutput);
  useEffect(() => {
    setOutput(existingRecipe?.output ?? defaultOutput);
  }, [existingRecipe?.output, defaultOutput]);

  const formRecipe = {
    converter: selectedId,
    output: output.trim() || defaultOutput,
    options,
  };
  // "Update recipe" only does something when the form diverges from what's
  // saved. When it matches (or there's no converter), there's nothing to apply.
  const recipeDirty = !!selectedMeta && !recipeMatchesForm(existingRecipe, formRecipe);

  const apply = async () => {
    if (!selectedMeta) return;
    const newRecipe: Recipe = {
      input: p.filename,
      output: output.trim() || defaultOutput,
      converter: selectedMeta.id,
      options: { ...options },
    };
    const recipes = (p.manifest.recipes ?? []).filter((r) => r.input !== newRecipe.input);
    recipes.push(newRecipe);
    await p.onUpdateManifest({ ...p.manifest, recipes });
    p.onForceBuild();
  };

  const remove = async () => {
    if (!existingRecipe) return;
    const recipes = (p.manifest.recipes ?? []).filter((r) => r.input !== existingRecipe.input);
    await p.onUpdateManifest({ ...p.manifest, recipes });
    p.onForceBuild();
  };

  return (
    <div className="asset">
      <div className="asset__header">
        <span className="asset__name">{p.filename}</span>
        {existingRecipe && <span className="asset__badge">recipe → {existingRecipe.output}</span>}
        {textEditable && (
          <div className="asset__viewtoggle" role="tablist">
            <button
              role="tab"
              aria-selected={view === "preview"}
              className={`asset__tab${view === "preview" ? " asset__tab--active" : ""}`}
              onClick={() => setView("preview")}
            >
              Preview
            </button>
            <button
              role="tab"
              aria-selected={view === "raw"}
              className={`asset__tab${view === "raw" ? " asset__tab--active" : ""}`}
              onClick={() => setView("raw")}
            >
              Raw
            </button>
          </div>
        )}
      </div>
      <div className="asset__body">
        <div className="asset__preview">
          {view === "raw" && textEditable ? (
            <RawEditor bytes={p.bytes} onChange={(b) => void p.onUpdateFile(b)} />
          ) : (
            <Preview filename={p.filename} bytes={p.bytes} ext={ext} />
          )}
        </div>
        <div className="asset__form">
          {applicableConverters.length === 0 ? (
            <div className="asset__empty">no converter applicable to .{ext}</div>
          ) : (
            <>
              <Field label="Converter">
                <select
                  className="asset__input"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  {applicableConverters.map((c) => (
                    <option key={c.id} value={c.id}>{c.label} — {c.id}</option>
                  ))}
                </select>
              </Field>

              {selectedMeta?.optionsSchema.map((spec) => (
                <Field key={spec.name} label={spec.label ?? spec.name}>
                  <OptionInput
                    spec={spec}
                    value={options[spec.name]}
                    onChange={(v) => setOptions((prev) => ({ ...prev, [spec.name]: v }))}
                  />
                </Field>
              ))}

              <Field label="Output">
                <input
                  className="asset__input"
                  value={output}
                  onChange={(e) => setOutput(e.target.value)}
                  placeholder={defaultOutput}
                />
              </Field>

              <div className="asset__actions">
                {!existingRecipe ? (
                  <button className="asset__btn asset__btn--primary" onClick={() => void apply()}>
                    Add recipe
                  </button>
                ) : (
                  <>
                    <button
                      className="asset__btn asset__btn--primary"
                      onClick={() => void apply()}
                      disabled={!recipeDirty}
                      title={recipeDirty ? "Save changes to this recipe" : "No changes to save"}
                    >
                      Update recipe
                    </button>
                    <button className="asset__btn asset__btn--danger" onClick={() => void remove()}>
                      Remove recipe
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="asset__field">
      <span className="asset__field-label">{label}</span>
      {children}
    </label>
  );
}

function OptionInput({ spec, value, onChange }: { spec: OptionSpec; value: unknown; onChange: (v: unknown) => void }) {
  if (spec.type === "number") {
    return (
      <input
        className="asset__input"
        type="number"
        value={String(value ?? spec.default)}
        min={spec.min}
        max={spec.max}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    );
  }
  if (spec.type === "boolean") {
    return (
      <input
        className="asset__check"
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }
  if (spec.type === "enum") {
    return (
      <select
        className="asset__input"
        value={String(value ?? spec.default)}
        onChange={(e) => onChange(e.target.value)}
      >
        {spec.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <input
      className="asset__input"
      type="text"
      value={String(value ?? spec.default)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function RawEditor({ bytes, onChange }: { bytes: Uint8Array; onChange: (bytes: Uint8Array) => void }) {
  const text = useMemo(() => utf8.decode(bytes), [bytes]);
  return (
    <textarea
      className="asset__raw"
      spellCheck={false}
      value={text}
      onChange={(e) => onChange(utf8enc.encode(e.target.value))}
    />
  );
}

function Preview({ filename, bytes, ext }: { filename: string; bytes: Uint8Array; ext: string }) {
  if (["png", "jpg", "jpeg", "gif", "bmp"].includes(ext)) {
    return <ImagePreview bytes={bytes} mime={mimeFor(ext)} />;
  }
  if (ext === "csv") {
    return <CsvPreview bytes={bytes} />;
  }
  return <HexPreview bytes={bytes} />;
  void filename;
}

function mimeFor(ext: string): string {
  switch (ext) {
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "bmp": return "image/bmp";
    default: return "application/octet-stream";
  }
}

function ImagePreview({ bytes, mime }: { bytes: Uint8Array; mime: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const blob = new Blob([bytes as BlobPart], { type: mime });
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [bytes, mime]);
  if (!url) return null;
  return <img src={url} alt="preview" className="asset__img" />;
}

function CsvPreview({ bytes }: { bytes: Uint8Array }) {
  const text = utf8.decode(bytes);
  const rows = text.split(/\r?\n/).slice(0, 20).map((r) => r.split(","));
  return (
    <table className="asset__csv">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

function HexPreview({ bytes }: { bytes: Uint8Array }) {
  const ref = useRef<HTMLPreElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const lines: string[] = [];
    const max = Math.min(bytes.length, 256);
    for (let i = 0; i < max; i += 16) {
      const slice = bytes.subarray(i, i + 16);
      const hexBytes = Array.from(slice, (b) => byteHex(b)).join(" ");
      const ascii = Array.from(slice, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".")).join("");
      lines.push(hex(i, 4) + "  " + hexBytes.padEnd(48, " ") + "  " + ascii);
    }
    ref.current.textContent = lines.join("\n");
  }, [bytes]);
  return <pre className="asset__hex" ref={ref} />;
}
