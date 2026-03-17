import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Icon } from './Icon';

// =============================================================================
// Types
// =============================================================================

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

// =============================================================================
// Base Error Boundary
// =============================================================================

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <DefaultErrorFallback 
          error={this.state.error} 
          onReset={this.handleReset} 
        />
      );
    }
    return this.props.children;
  }
}

// =============================================================================
// Default Error Fallback Component (M3 Themed)
// =============================================================================

interface ErrorFallbackProps {
  error?: Error;
  onReset?: () => void;
  title?: string;
  description?: string;
  showDetails?: boolean;
  variant?: 'page' | 'section' | 'inline';
}

export const DefaultErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  onReset,
  title = 'Something went wrong',
  description,
  showDetails = false,
  variant = 'page'
}) => {
  const [showStack, setShowStack] = React.useState(false);

  // Inline variant - compact error display
  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-error-container/50 border border-error/20">
        <Icon name="alert-circle" className="w-4 h-4 text-error flex-shrink-0" />
        <span className="text-sm text-on-error-container">{error?.message || 'An error occurred'}</span>
        {onReset && (
          <button 
            onClick={onReset}
            className="ml-auto text-xs text-error hover:text-error/80 underline underline-offset-2 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  // Section variant - for data sections within a page
  if (variant === 'section') {
    return (
      <div className="flex flex-col items-center justify-center p-8 rounded-[24px] bg-surface-container-low border border-outline-variant/30">
        <div className="w-14 h-14 rounded-full bg-error-container flex items-center justify-center mb-4">
          <Icon name="alert-circle" className="w-7 h-7 text-on-error-container" />
        </div>
        <h3 className="text-base font-semibold text-on-surface mb-1">{title}</h3>
        <p className="text-sm text-on-surface-variant mb-5 text-center max-w-xs">
          {description || error?.message || 'Failed to load this section.'}
        </p>
        {onReset && (
          <button
            onClick={onReset}
            className="px-5 py-2.5 text-sm font-medium bg-surface-container text-on-surface rounded-full border border-outline-variant/30 hover:bg-surface-container-high hover:border-outline-variant/50 transition-all"
          >
            Try Again
          </button>
        )}
      </div>
    );
  }

  // Page variant - full page error display (default)
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="w-20 h-20 rounded-full bg-error-container flex items-center justify-center mb-6">
        <Icon name="alert-circle" className="w-10 h-10 text-on-error-container" />
      </div>
      
      <h2 className="text-2xl font-bold text-on-surface mb-2">{title}</h2>
      
      <p className="text-on-surface-variant mb-8 max-w-md">
        {description || error?.message || 'An unexpected error occurred. Please try again.'}
      </p>
      
      <div className="flex items-center gap-3">
        {onReset && (
          <button
            onClick={onReset}
            className="px-6 py-3 bg-primary text-on-primary font-semibold rounded-full hover:bg-primary/90 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all active:scale-95"
          >
            Try Again
          </button>
        )}
        
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-surface-container text-on-surface font-semibold rounded-full border border-outline-variant/30 hover:bg-surface-container-high hover:border-outline-variant/50 transition-all active:scale-95"
        >
          Refresh Page
        </button>
      </div>

      {/* Error Details (expandable) */}
      {showDetails && error && (
        <div className="mt-10 w-full max-w-2xl">
          <button
            onClick={() => setShowStack(!showStack)}
            className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors mx-auto"
          >
            <Icon name={showStack ? 'chevron-down' : 'chevron-right'} className="w-4 h-4" />
            Technical Details
          </button>
          
          {showStack && (
            <pre className="mt-3 p-4 bg-surface-container-lowest rounded-2xl text-left text-xs text-on-surface-variant overflow-x-auto border border-outline-variant/30 font-mono">
              <code>{import.meta.env.DEV ? (error.stack || error.message) : error.message}</code>
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// App-Level Error Boundary (Catastrophic Errors)
// =============================================================================

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AppErrorBoundary] Critical error:', error);
    console.error('[AppErrorBoundary] Stack:', errorInfo.componentStack);
    // TODO: Send to error tracking service (Sentry, etc.)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            {/* Logo/Brand mark */}
            <div className="w-24 h-24 rounded-full bg-error-container flex items-center justify-center mb-8 mx-auto">
              <Icon name="alert-circle" className="w-12 h-12 text-on-error-container" />
            </div>
            
            <h1 className="text-3xl font-bold text-on-surface mb-3 font-brand">
              Application Error
            </h1>
            
            <p className="text-on-surface-variant mb-8">
              Optimus Detection Studio encountered a critical error and needs to restart.
            </p>
            
            <button
              onClick={() => window.location.reload()}
              className="px-8 py-3.5 bg-primary text-on-primary font-bold rounded-full hover:bg-primary/90 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all active:scale-95"
            >
              Restart Application
            </button>
            
            {this.state.error && (
              <p className="mt-8 text-xs text-outline font-mono">
                {this.state.error.message}
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// =============================================================================
// Page-Level Error Boundary (View Isolation)
// =============================================================================

interface PageErrorBoundaryProps {
  children: ReactNode;
  pageName?: string;
  onNavigateHome?: () => void;
}

export class PageErrorBoundary extends Component<
  PageErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: PageErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[PageErrorBoundary:${this.props.pageName || 'unknown'}] Error:`, error);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-error-container flex items-center justify-center mb-5">
            <Icon name="alert-circle" className="w-8 h-8 text-on-error-container" />
          </div>
          
          <h2 className="text-xl font-bold text-on-surface mb-2">
            {this.props.pageName ? `Error Loading ${this.props.pageName}` : 'Page Error'}
          </h2>
          
          <p className="text-on-surface-variant mb-6 max-w-md">
            {this.state.error?.message || 'This page encountered an error. You can try again or navigate to another section.'}
          </p>
          
          <div className="flex items-center gap-3">
            <button
              onClick={this.handleReset}
              className="px-5 py-2.5 bg-primary text-on-primary font-semibold rounded-full hover:bg-primary/90 shadow-md shadow-primary/20 transition-all active:scale-95"
            >
              Try Again
            </button>
            
            {this.props.onNavigateHome && (
              <button
                onClick={() => {
                  this.handleReset();
                  this.props.onNavigateHome?.();
                }}
                className="px-5 py-2.5 bg-surface-container text-on-surface font-semibold rounded-full border border-outline-variant/30 hover:bg-surface-container-high transition-all active:scale-95"
              >
                Go to Dashboard
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// =============================================================================
// Data Section Error Boundary (Compact)
// =============================================================================

interface DataErrorBoundaryProps {
  children: ReactNode;
  sectionName?: string;
  onRetry?: () => void;
}

export class DataErrorBoundary extends Component<
  DataErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: DataErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[DataErrorBoundary:${this.props.sectionName || 'data'}] Error:`, error);
  }

  handleReset = () => {
    this.props.onRetry?.();
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <DefaultErrorFallback
          error={this.state.error}
          onReset={this.handleReset}
          title={this.props.sectionName ? `Failed to load ${this.props.sectionName}` : 'Data Error'}
          variant="section"
        />
      );
    }

    return this.props.children;
  }
}