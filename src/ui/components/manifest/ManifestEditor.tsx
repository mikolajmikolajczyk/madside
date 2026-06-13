import { useMemo, useState } from "react";
import { parseProjectManifest, type MachinePlugin, type ToolchainPlugin } from "@ports";
import { useWorkbench } from "@app";
import { Editor } from "../editor/Editor";
import "./ManifestEditor.css";

interface Props {
  /** project.json bytes. */
  value: Uint8Array;
  /** Persist edited project.json bytes. */
  onChange: (bytes: Uint8Array) => void;
  /** Project files — source-file list feeds the `main` dropdown. */
  files: { path: string }[];
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const SRC_RE = /\.(a65|asm|inc|s|mac)$/i;

/** VS Code-style editor for project.json: a form view and a raw-JSON view,
 *  kept in sync. Raw JSON is the source of truth — the form patches the parsed
 *  object so fields the manifest schema ignores (recipes, editors, …) survive
 *  a round-trip. Special-cased in App for the project.json file (not a generic
 *  editor plugin — this needs registry access for the machine/toolchain lists). */
export function ManifestEditor({ value, onChange, files }: Props) {
  const workbench = useWorkbench();
  const [mode, setMode] = useState<"form" | "json">("form");

  const text = useMemo(() => dec.decode(value), [value]);
  const machines = useMemo(() => workbench.plugins.list("machine") as unknown as MachinePlugin[], [workbench]);
  const toolchains = useMemo(() => workbench.plugins.list("toolchain") as unknown as ToolchainPlugin[], [workbench]);
  const sourceFiles = useMemo(() => files.map((f) => f.path).filter((p) => SRC_RE.test(p)).sort(), [files]);

  // Raw parsed object (null when the JSON is malformed) + schema validation.
  const raw = useMemo<Record<string, unknown> | null>(() => {
    try {
      const o: unknown = JSON.parse(text);
      return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }, [text]);
  const parsed = useMemo(() => (raw ? parseProjectManifest(raw) : null), [raw]);

  const writeRaw = (next: Record<string, unknown>) => {
    onChange(enc.encode(JSON.stringify(next, null, 2) + "\n"));
  };
  const patch = (mut: (o: Record<string, unknown>) => void) => {
    if (!raw) return;
    const next = structuredClone(raw);
    mut(next);
    writeRaw(next);
  };

  const str = (k: string) => (typeof raw?.[k] === "string" ? (raw[k] as string) : "");
  const machine = machines.find((m) => m.id === str("machine"));

  // Toolchains are filtered to the selected machine's compatibleToolchains
  // (a machine declares which assemblers target it). A machine with none
  // declared falls back to the full list.
  const compatToolchains = machine?.compatibleToolchains ?? [];
  const toolchainOptions = compatToolchains.length
    ? toolchains.filter((t) => compatToolchains.includes(t.id))
    : toolchains;

  // Switch machine — also repair the toolchain if it's no longer compatible.
  const setMachine = (id: string) => patch((o) => {
    o.machine = id;
    const m = machines.find((x) => x.id === id);
    const compat = m?.compatibleToolchains ?? [];
    if (compat.length && typeof o.toolchain === "string" && !compat.includes(o.toolchain)) {
      o.toolchain = compat[0];
    }
  });

  const renderForm = () => {
    if (!raw) {
      return <div className="manifest__error">project.json is not valid JSON — fix it in the JSON view.</div>;
    }
    if (parsed && !parsed.ok) {
      return <div className="manifest__error">{parsed.error.message}</div>;
    }
    const run = (raw.run as { default?: { audio?: boolean } } | undefined) ?? {};
    const audio = run.default?.audio ?? false;
    const build = (raw.build as { args?: string[] } | undefined) ?? {};
    const args = Array.isArray(build.args) ? build.args : [];

    return (
      <div className="manifest__form">
        <label className="manifest__row">
          <span className="manifest__label">Name</span>
          <input
            className="manifest__input"
            value={str("name")}
            onChange={(e) => patch((o) => { o.name = e.target.value; })}
          />
        </label>

        <label className="manifest__row">
          <span className="manifest__label">Machine</span>
          <select
            className="manifest__input"
            value={str("machine")}
            onChange={(e) => setMachine(e.target.value)}
          >
            {machines.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
          </select>
        </label>

        <label className="manifest__row">
          <span className="manifest__label">Toolchain</span>
          <select
            className="manifest__input"
            value={str("toolchain")}
            onChange={(e) => patch((o) => { o.toolchain = e.target.value; })}
          >
            {str("toolchain") && !toolchainOptions.some((t) => t.id === str("toolchain")) && (
              <option value={str("toolchain")}>{str("toolchain")} (incompatible)</option>
            )}
            {toolchainOptions.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.id})</option>)}
          </select>
        </label>

        <label className="manifest__row">
          <span className="manifest__label">Main file</span>
          <select
            className="manifest__input"
            value={str("main")}
            onChange={(e) => patch((o) => { o.main = e.target.value; })}
          >
            {!sourceFiles.includes(str("main")) && str("main") && <option value={str("main")}>{str("main")}</option>}
            {sourceFiles.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>

        {machine && machine.compatibleEmulators.length > 1 && (
          <label className="manifest__row">
            <span className="manifest__label">Emulator</span>
            <select
              className="manifest__input"
              value={str("emulator")}
              onChange={(e) => patch((o) => { if (e.target.value) o.emulator = e.target.value; else delete o.emulator; })}
            >
              <option value="">(machine default)</option>
              {machine.compatibleEmulators.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
        )}

        <label className="manifest__row manifest__row--check">
          <input
            type="checkbox"
            checked={audio}
            onChange={(e) => patch((o) => {
              const r = (o.run as { default?: { audio?: boolean } } | undefined) ?? {};
              o.run = { ...r, default: { ...r.default, audio: e.target.checked } };
            })}
          />
          <span className="manifest__label">Audio on run</span>
        </label>

        <div className="manifest__row manifest__row--block">
          <span className="manifest__label">Build args</span>
          <textarea
            className="manifest__input manifest__textarea"
            placeholder="one toolchain flag per line, e.g. -d:DEBUG=1"
            value={args.join("\n")}
            onChange={(e) => patch((o) => {
              const next = e.target.value.split("\n").map((l) => l.trim()).filter(Boolean);
              if (next.length) o.build = { ...(o.build as object ?? {}), args: next };
              else if (o.build && typeof o.build === "object") delete (o.build as Record<string, unknown>).args;
            })}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="manifest" data-testid="manifest-editor">
      <div className="manifest__header label">
        <span>project.json</span>
        <div className="manifest__modes">
          <button
            type="button"
            className={"manifest__mode" + (mode === "form" ? " manifest__mode--on" : "")}
            onClick={() => setMode("form")}
            data-testid="manifest.mode.form"
          >Form</button>
          <button
            type="button"
            className={"manifest__mode" + (mode === "json" ? " manifest__mode--on" : "")}
            onClick={() => setMode("json")}
            data-testid="manifest.mode.json"
          >JSON</button>
        </div>
      </div>
      {mode === "form" ? (
        renderForm()
      ) : (
        <Editor value={text} filename="project.json" onChange={(s) => onChange(enc.encode(s))} />
      )}
    </div>
  );
}
