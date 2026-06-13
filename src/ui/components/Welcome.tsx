import { useMemo, useState } from "react";
import { createBlankProject, getTemplateManifestText, instantiateTemplate, listTemplates } from "@app";
import { ManifestEditor } from "./manifest/ManifestEditor";
import "./Welcome.css";

interface Props {
  /** Called with the new project's id after a project is created. */
  onOpen: (projectId: string) => void;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** First-run / no-project view. Top: an empty project with the project.json
 *  properties editor + Create. Below: bundled-template cards. Picking either
 *  creates a project into storage and opens it. */
export function Welcome({ onOpen }: Props) {
  // Templates minus 'empty' (the empty flow is the top section).
  const templates = useMemo(() => listTemplates().filter((t) => t.id !== "empty"), []);
  const emptyFiles = useMemo(
    () => (listTemplates().find((t) => t.id === "empty")?.files ?? []).map((path) => ({ path })),
    [],
  );
  const [blankBytes, setBlankBytes] = useState<Uint8Array>(() => enc.encode(getTemplateManifestText("empty") ?? "{}\n"));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createBlank = async () => {
    setBusy("blank");
    setError(null);
    try {
      const row = await createBlankProject(dec.decode(blankBytes));
      onOpen(row.id);
    } catch (e) {
      setError(`could not create project: ${String(e)}`);
      setBusy(null);
    }
  };

  const pick = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const row = await instantiateTemplate(id);
      onOpen(row.id);
    } catch (e) {
      setError(String(e));
      setBusy(null);
    }
  };

  return (
    <div className="welcome" data-testid="welcome">
      <div className="welcome__head">
        <h1 className="welcome__title">madside</h1>
        <p className="welcome__sub">Start a new project.</p>
      </div>

      <section className="welcome__blank">
        <div className="welcome__section-title label">Empty project</div>
        <div className="welcome__manifest">
          <ManifestEditor value={blankBytes} onChange={setBlankBytes} files={emptyFiles} />
        </div>
        <button
          type="button"
          className="welcome__create"
          disabled={busy != null}
          onClick={() => void createBlank()}
          data-testid="welcome.create-blank"
        >
          {busy === "blank" ? "creating…" : "Create project"}
        </button>
      </section>

      <section className="welcome__templates">
        <div className="welcome__section-title label">Or start from a template</div>
        <div className="welcome__grid">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              className="welcome__card"
              disabled={busy != null}
              onClick={() => void pick(t.id)}
              data-testid={`welcome.template.${t.id}`}
            >
              <span className="welcome__card-head">
                <span className="welcome__card-name">{t.name}</span>
                <span className="welcome__card-machine label">{t.machine}</span>
              </span>
              <span className="welcome__card-desc">{t.description}</span>
              <ul className="welcome__card-files">
                {t.files.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {busy === t.id && <span className="welcome__card-busy">creating…</span>}
            </button>
          ))}
        </div>
      </section>

      {error && <div className="welcome__error">{error}</div>}
    </div>
  );
}
