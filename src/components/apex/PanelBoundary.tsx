import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * PANEL BOUNDARY — isolates one engine panel. A single panel that throws on a
 * partial/persisted data shape can no longer blank the whole Sentinel terminal;
 * the folded section still opens and reports the fault honestly.
 */
export class PanelBoundary extends Component<
  { label: string; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[PanelBoundary] ${this.props.label} failed`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-border/60 bg-background/40 p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {this.props.label} — unavailable
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            This engine could not render with the current data ({this.state.error.message}). Every
            other engine keeps running; the panel recovers on the next full data cycle.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default PanelBoundary;
