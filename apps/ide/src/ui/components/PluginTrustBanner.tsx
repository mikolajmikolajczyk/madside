import { useState } from "react";
import { trustPluginHash, useWorkbench, type PluginRef } from "@app";
import { useUntrustedPlugins } from "../hooks/useUntrustedPlugins";
import "./PluginTrustBanner.css";

interface Props {
  files: { path: string; content: Uint8Array }[] | null;
}

/** Non-blocking consent surface for project-local plugins (ADR-0013). Lists the
 *  `editors`/`converters` `*.js` in the active project the user hasn't trusted;
 *  Trust runs them (now + forever, keyed on content hash), Skip hides the row for
 *  the session. Renders nothing when every plugin is trusted or skipped. */
export function PluginTrustBanner({ files }: Props) {
  const { storage } = useWorkbench();
  const untrusted = useUntrustedPlugins(files);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const pending = untrusted.filter((p) => !skipped.has(p.hash));
  if (pending.length === 0) return null;

  const trust = (p: PluginRef) => void trustPluginHash(storage, p.hash);
  const skip = (p: PluginRef) => setSkipped((s) => new Set(s).add(p.hash));

  return (
    <div className="plugin-trust" role="alert">
      <div className="plugin-trust__head">
        <span className="plugin-trust__icon" aria-hidden>⚠</span>
        <span>
          This project ships {pending.length} unverified plugin{pending.length > 1 ? "s" : ""} that
          run code in the app. Run only ones you trust.
        </span>
      </div>
      <ul className="plugin-trust__list">
        {pending.map((p) => (
          <li key={p.hash} className="plugin-trust__row">
            <code className="plugin-trust__path" title={p.path}>{p.path}</code>
            <span className="plugin-trust__actions">
              <button className="plugin-trust__trust" onClick={() => trust(p)}>Trust &amp; run</button>
              <button className="plugin-trust__skip" onClick={() => skip(p)}>Skip</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
