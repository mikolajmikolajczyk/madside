import "./SystemFileView.css";

// Read-only viewer for a toolchain sysroot file (#50). Sysroot files (cc65
// headers, the linker cfg, …) aren't project files — they can't be edited and
// never enter storage — so they get this plain viewer rather than the full
// editor. Syntax highlighting is a follow-up (#47).
export function SystemFileView({ path, text, onClose }: { path: string; text: string; onClose: () => void }) {
  return (
    <div className="sysview">
      <div className="sysview__header">
        <span className="sysview__path">{path}</span>
        <span className="sysview__badge">read-only · system</span>
        <button className="sysview__close" onClick={onClose} aria-label="Close system file">×</button>
      </div>
      <pre className="sysview__body">{text}</pre>
    </div>
  );
}
