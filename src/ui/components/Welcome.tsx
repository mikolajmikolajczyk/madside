import { useMemo, useState } from "react";
import { instantiateTemplate, listTemplates } from "@app";
import "./Welcome.css";

interface Props {
  /** Called with the new project's id after a template is instantiated. */
  onOpen: (projectId: string) => void;
}

/** First-run / no-project view. Shows a grid of bundled-template cards
 *  (name, machine, description, file tree). Picking one instantiates a project
 *  into storage and opens it. */
export function Welcome({ onOpen }: Props) {
  const templates = useMemo(() => listTemplates(), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const row = await instantiateTemplate(id);
      onOpen(row.id);
    } catch (e) {
      setError(String(e));
      setBusyId(null);
    }
  };

  return (
    <div className="welcome" data-testid="welcome">
      <div className="welcome__head">
        <h1 className="welcome__title">madside</h1>
        <p className="welcome__sub">Pick a template to start a project.</p>
      </div>
      <div className="welcome__grid">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            className="welcome__card"
            disabled={busyId != null}
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
            {busyId === t.id && <span className="welcome__card-busy">creating…</span>}
          </button>
        ))}
      </div>
      {error && <div className="welcome__error">{error}</div>}
    </div>
  );
}
