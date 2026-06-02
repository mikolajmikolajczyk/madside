import "./StatusBar.css";

interface Props {
  projectName: string;
  activePath: string;
  busy: boolean;
  result: { ok: boolean; exitCode: number } | null;
  running: boolean;
  pc?: number | null;
  brokeOn?: number | null;
}

const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");

export function StatusBar({ projectName, activePath, busy, result, running, pc, brokeOn }: Props) {
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
      <div className="status__cell status__cell--right">{emuText}</div>
    </footer>
  );
}
