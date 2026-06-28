import type { GitHubSyncStatus } from "@app";
import "./StatusBar.css";

interface GitHubStatus {
  signedIn: boolean;
  user: string | null;
  status: GitHubSyncStatus;
  onClick: () => void;
}

interface Props {
  projectName: string;
  activePath: string;
  busy: boolean;
  result: { ok: boolean; exitCode: number } | null;
  running: boolean;
  pc?: number | null;
  brokeOn?: number | null;
  /** GitHub account + auto-sync indicator; absent when GitHub isn't configured. */
  github?: GitHubStatus | null;
}

/** Label + dot-colour class for the GitHub cell. */
function ghCell(g: GitHubStatus): { text: string; cls: string } {
  if (!g.signedIn) return { text: "GitHub: signed out", cls: "status__gh--err" };
  const who = g.user ?? "GitHub";
  switch (g.status) {
    case "pending": return { text: `${who} · unsynced`, cls: "status__gh--warn" };
    case "syncing": return { text: `${who} · syncing…`, cls: "status__gh--busy" };
    case "paused": return { text: `${who} · sync paused`, cls: "status__gh--warn" };
    case "error": return { text: `${who} · sync error`, cls: "status__gh--err" };
    case "off": return { text: `${who} · auto-sync off`, cls: "status__gh--off" };
    default: return { text: `${who} · synced`, cls: "status__gh--ok" };
  }
}

const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");

export function StatusBar({ projectName, activePath, busy, result, running, pc, brokeOn, github }: Props) {
  const assembleText = busy
    ? "working…"
    : result == null
      ? "ready"
      : result.ok
        ? "ok"
        : `err [exit ${result.exitCode}]`;
  const assembleClass = busy
    ? ""
    : result == null
      ? ""
      : result.ok
        ? "status__cell--ok"
        : "status__cell--err";

  const emuText = running
    ? "running"
    : brokeOn != null
      ? `bp @ $${hex4(brokeOn)}`
      : pc != null
        ? `paused @ $${hex4(pc)}`
        : "idle";

  return (
    <footer className="status">
      <div className="status__cell status__cell--left">
        <span className="status__project">{projectName}</span>
        <span className="status__sep">·</span>
        <span className="status__path">{activePath}</span>
      </div>
      <div className={"status__cell " + assembleClass}>{assembleText}</div>
      {github && (() => {
        const c = ghCell(github);
        return (
          <button type="button" className="status__cell status__gh" onClick={github.onClick} title="GitHub — click to manage">
            <span className={"status__gh-dot " + c.cls} aria-hidden />
            {c.text}
          </button>
        );
      })()}
      <div className="status__cell status__cell--right">{emuText}</div>
    </footer>
  );
}
