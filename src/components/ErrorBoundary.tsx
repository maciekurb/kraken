import React from 'react';
import { copyLogsToClipboard, formatLogsForExport, logger } from '../debug/logger';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  copied: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '', copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage: error?.message || String(error),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    logger.error('APP', 'React ErrorBoundary caught crash', {
      error,
      componentStack: info.componentStack,
    });
  }

  handleCopy = async () => {
    const ok = await copyLogsToClipboard(formatLogsForExport());
    this.setState({ copied: ok });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="app-shell" style={{ padding: '1rem' }}>
        <div className="parchment-card brass">
          <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--crimson-banner)', marginTop: 0 }}>
            Application Error
          </h2>
          <p className="small-text">{this.state.errorMessage}</p>
          <div className="stack-sm">
            <button type="button" className="btn btn-primary btn-block" onClick={() => void this.handleCopy()}>
              {this.state.copied ? 'Logs Copied!' : 'Copy Diagnostic Logs'}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-block"
              onClick={() => window.location.reload()}
            >
              Reload App
            </button>
          </div>
          <textarea
            className="debug-raw-textarea"
            style={{ marginTop: '0.75rem', height: '240px' }}
            readOnly
            value={formatLogsForExport()}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      </div>
    );
  }
}
