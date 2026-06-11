import React from "react";

interface Props {
  pluginId: string;
  onReload?: () => void;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

/** React error boundary scoped to a single plugin editor. Catches errors
 *  thrown during render / effect of descendants and renders a fallback that
 *  names the offending plugin. The host (PluginEditor) supplements this with
 *  a window-level error listener for async errors thrown from plugin event
 *  handlers — those don't go through React. */
export class PluginEditorErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? null });
    console.error(`PluginEditor[${this.props.pluginId}] crashed`, error, info);
  }

  reset = (): void => {
    this.setState({ error: null, componentStack: null });
    this.props.onReload?.();
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="plugin-editor__error">
        <div className="plugin-editor__error-title">
          plugin <code>{this.props.pluginId}</code> crashed
        </div>
        <pre className="plugin-editor__error-body">
          {this.state.error.message}
          {this.state.componentStack ? "\n\n" + this.state.componentStack : ""}
        </pre>
        <button type="button" onClick={this.reset}>Reload editor</button>
      </div>
    );
  }
}
