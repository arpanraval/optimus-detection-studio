import React, { Component, ErrorInfo } from 'react';
import { Icon } from '../Icon';

interface Props {
  tabName: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class TabErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[${this.props.tabName}] Tab error:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center mb-3">
            <Icon name="alert-triangle" className="w-6 h-6 text-error" />
          </div>
          <h3 className="text-base font-medium text-on-surface mb-1">
            Failed to load {this.props.tabName}
          </h3>
          <p className="text-sm text-on-surface-variant mb-4 max-w-md">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-surface-container-highest text-on-surface hover:bg-surface-container-high transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
