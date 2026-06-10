import "./Output.css";

interface Props {
  stdout: string;
  stderr: string;
  ok: boolean | null;
}

export function Output({ stdout, stderr, ok }: Props) {
  const tag = ok === null ? "—" : ok ? "OK" : "ERR";
  const tagClass = ok === null ? "" : ok ? "output__tag--ok" : "output__tag--err";
  return (
    <div className="output">
      <div className="output__header">
        <span className="label">Output</span>
        <span className={"output__tag " + tagClass}>{tag}</span>
      </div>
      <pre className="output__body">{[stdout, stderr].filter(Boolean).join("\n") || "(no output)"}</pre>
    </div>
  );
}
