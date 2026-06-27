import { useProjectPlugins, type PluginKind } from "../hooks/useProjectPlugins";
import "./PluginInventory.css";

interface Props {
  files: { path: string; content: Uint8Array }[] | null;
}

const TRIGGER: Record<PluginKind, string> = {
  editor: "runs when you open a file it handles",
  converter: "runs during an asset build",
};

/** Discoverable inventory of a project's executable plugins (#69) — every
 *  `editors`/`converters` `*.js`, its kind, when it runs, and whether you've
 *  trusted it. Transparency surface (the consent banner only shows *untrusted*
 *  ones, and disappears once trusted); read-only, no actions. */
export function PluginInventory({ files }: Props) {
  const plugins = useProjectPlugins(files);

  if (plugins.length === 0) {
    return <p className="plugins__empty">This project ships no custom plugins.</p>;
  }

  return (
    <div className="plugins">
      <p className="plugins__intro">
        These project files run code in the app on your origin. Each runs lazily — only when used.
      </p>
      <ul className="plugins__list">
        {plugins.map((p) => (
          <li key={p.path} className="plugins__row">
            <code className="plugins__path" title={p.path}>{p.path}</code>
            <span className="plugins__kind">{p.kind}</span>
            <span className="plugins__trigger">{TRIGGER[p.kind]}</span>
            <span className={"plugins__trust " + (p.trusted ? "plugins__trust--ok" : "plugins__trust--no")}>
              {p.trusted ? "trusted" : "not trusted"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
