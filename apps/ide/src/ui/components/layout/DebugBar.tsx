import { Tip } from "../ui/Tooltip";
import "./DebugBar.css";

interface Props {
  canRun: boolean;
  running: boolean;
  busy: boolean;
  hasEmu: boolean;          // emu has a loaded xex (so Stop is meaningful)
  onRun: () => void;
  onPause: () => void;
  onStop: () => void;
  onStepOver: () => void;
  onStep: () => void;
  onFrame: () => void;
  onReset: () => void;
  onToggleBp: () => void;
  onAssemble: () => void;
  onSnapshot?: () => void;
  onHistory?: () => void;
  /** GitHub push/pull — present only when GitHub is configured + signed in + a
   *  repo is selected (#160/#161). */
  onPushGitHub?: () => void;
  onPullGitHub?: () => void;
}

export function DebugBar(p: Props) {
  return (
    <div className="dbgbar" data-testid="debugbar">
      <IconBtn testid="dbg.build" label="Build (Ctrl+B)" onClick={p.onAssemble} disabled={p.busy}>
        <svg viewBox="0 0 16 16" width={14} height={14}><path d="M3 3h10v3H3zM3 7h6v3H3zM3 11h10v2H3z" fill="currentColor"/></svg>
      </IconBtn>
      <div className="dbgbar__sep" />
      <IconBtn testid="dbg.run" label="Run (Ctrl+Enter)" onClick={p.onRun} disabled={!p.canRun || p.running} highlight>
        <svg viewBox="0 0 16 16" width={14} height={14}><path d="M4 3 L13 8 L4 13 Z" fill="currentColor"/></svg>
      </IconBtn>
      <IconBtn testid="dbg.pause" label="Pause (Ctrl+.)" onClick={p.onPause} disabled={!p.running}>
        <svg viewBox="0 0 16 16" width={14} height={14}><rect x="4" y="3" width="3" height="10" fill="currentColor"/><rect x="9" y="3" width="3" height="10" fill="currentColor"/></svg>
      </IconBtn>
      <IconBtn testid="dbg.stop" label="Stop (Ctrl+Shift+.)" onClick={p.onStop} disabled={!p.hasEmu}>
        <svg viewBox="0 0 16 16" width={14} height={14}><rect x="4" y="4" width="8" height="8" fill="currentColor"/></svg>
      </IconBtn>
      <IconBtn testid="dbg.step-over" label="Step Over (F10)" onClick={p.onStepOver} disabled={p.running || !p.hasEmu}>
        <svg viewBox="0 0 16 16" width={14} height={14}>
          <path d="M3 11 Q8 1 13 11" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
          <path d="M10.5 8.5 L13.2 11 L13.2 7.8" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="3" cy="13" r="1.3" fill="currentColor"/>
        </svg>
      </IconBtn>
      <IconBtn testid="dbg.step" label="Step Instruction (Shift+F10)" onClick={p.onStep} disabled={p.running || !p.hasEmu}>
        <svg viewBox="0 0 16 16" width={14} height={14}>
          <path d="M2 8 L11 8 M8 5 L11 8 L8 11" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="13.5" cy="8" r="1.4" fill="currentColor"/>
        </svg>
      </IconBtn>
      <IconBtn testid="dbg.frame" label="Frame (F11)" onClick={p.onFrame} disabled={p.running || !p.hasEmu}>
        <svg viewBox="0 0 16 16" width={14} height={14}>
          <path d="M3 3 L9 8 L3 13 Z" fill="currentColor"/>
          <rect x="11" y="3" width="2" height="10" fill="currentColor"/>
        </svg>
      </IconBtn>
      <IconBtn testid="dbg.reset" label="Restart (Ctrl+Shift+Enter)" onClick={p.onReset}>
        <svg viewBox="0 0 16 16" width={14} height={14}>
          <path d="M12 4 A5 5 0 1 0 13 9" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
          <path d="M12 2 L12 5 L9 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </IconBtn>
      <div className="dbgbar__sep" />
      <IconBtn testid="dbg.bp-toggle" label="Toggle breakpoint (F9)" onClick={p.onToggleBp}>
        <svg viewBox="0 0 16 16" width={14} height={14}><circle cx="8" cy="8" r="4.5" fill="var(--accent-coral)"/></svg>
      </IconBtn>

      {(p.onSnapshot || p.onHistory) && <div className="dbgbar__sep" />}
      {p.onSnapshot && (
        <IconBtn testid="dbg.snapshot" label="Snapshot now" onClick={p.onSnapshot}>
          <svg viewBox="0 0 16 16" width={14} height={14}>
            <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4" fill="none"/>
            <circle cx="8" cy="8" r="2.4" fill="currentColor"/>
          </svg>
        </IconBtn>
      )}
      {p.onHistory && (
        <IconBtn testid="dbg.history" label="History…" onClick={p.onHistory}>
          <svg viewBox="0 0 16 16" width={14} height={14}>
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" fill="none"/>
            <path d="M8 4.5 L8 8 L10.5 9.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </IconBtn>
      )}

      {(p.onPushGitHub || p.onPullGitHub) && <div className="dbgbar__sep" />}
      {p.onPushGitHub && (
        <IconBtn testid="dbg.gh-push" label="Save to GitHub (Ctrl+Shift+S)" onClick={p.onPushGitHub}>
          <svg viewBox="0 0 16 16" width={14} height={14}>
            <path d="M8 13 L8 4 M5 7 L8 4 L11 7" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 3 L13 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </IconBtn>
      )}
      {p.onPullGitHub && (
        <IconBtn testid="dbg.gh-pull" label="Pull from GitHub" onClick={p.onPullGitHub}>
          <svg viewBox="0 0 16 16" width={14} height={14}>
            <path d="M8 3 L8 12 M5 9 L8 12 L11 9" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 13 L13 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </IconBtn>
      )}
    </div>
  );
}

interface IconBtnProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  highlight?: boolean;
  testid?: string;
  children: React.ReactNode;
}

function IconBtn({ label, onClick, disabled, highlight, testid, children }: IconBtnProps) {
  // Split label into "name (shortcut)" if it looks like that, for nicer tooltip layout.
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(label);
  const tipName = m?.[1] ?? label;
  const tipShortcut = m?.[2];
  return (
    <Tip label={tipName} shortcut={tipShortcut}>
      <button
        className={"dbgbar__btn" + (highlight ? " dbgbar__btn--highlight" : "")}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        data-testid={testid}
      >
        {children}
      </button>
    </Tip>
  );
}
