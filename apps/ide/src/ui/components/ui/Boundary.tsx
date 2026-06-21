// React error boundaries (ADR-0004). Two levels:
//  - level="root": one around the whole workbench. Catastrophic catch →
//    full-screen fallback with "reload" + "export project to ZIP" (work is
//    auto-saved to IndexedDB, but the export is the belt-and-braces escape).
//  - level="panel": one around every panel slot. A panel crash shows just that
//    panel as broken with a Retry button; the rest of the workbench keeps
//    working. (Level 3, plugin-editor mounts, has its own boundary.)

import React from "react";
import { exportActiveProjectToZip } from "@app";
import "./Boundary.css";

interface Props {
  level: "root" | "panel";
  /** Panel name shown in the panel-level fallback. */
  label?: string;
  /** Called after the user clicks Retry (e.g. to remount the subtree). */
  onReset?: () => void;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class Boundary extends React.Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`[boundary:${this.props.level}] caught`, error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  override render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.level === "root") {
      return (
        <div className="boundary boundary--root" role="alert">
          <div className="boundary__card">
            <h1 className="boundary__title">The workbench hit an unexpected error</h1>
            <p className="boundary__msg">
              Your work is auto-saved to this browser. Reload to recover, or export the
              current project first.
            </p>
            <pre className="boundary__detail">{error.message}</pre>
            <div className="boundary__actions">
              <button
                type="button"
                className="boundary__btn boundary__btn--primary"
                onClick={() => window.location.reload()}
              >
                Reload workbench
              </button>
              <button
                type="button"
                className="boundary__btn"
                onClick={() => void exportActiveProjectToZip()}
              >
                Export project to ZIP
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="boundary boundary--panel" role="alert">
        <div className="boundary__panel-title">
          panel {this.props.label ? <code>{this.props.label}</code> : null} crashed
        </div>
        <pre className="boundary__detail">{error.message}</pre>
        <button type="button" className="boundary__btn" onClick={this.reset}>
          Retry
        </button>
      </div>
    );
  }
}
