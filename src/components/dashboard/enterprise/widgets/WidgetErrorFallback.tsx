import React from 'react';

interface WidgetErrorFallbackProps {
  error?: Error;
  resetErrorBoundary?: () => void;
}

const WidgetErrorFallback: React.FC<WidgetErrorFallbackProps> = ({ error, resetErrorBoundary }) => (
  <div className="flex flex-col items-center justify-center h-full min-h-[80px] p-4">
    <p className="text-[12px] font-brand font-bold text-error/60 mb-1">Widget Error</p>
    <p className="text-[11px] font-brand text-on-surface-variant/40 text-center mb-2">
      {error?.message || 'Something went wrong'}
    </p>
    {resetErrorBoundary && (
      <button
        onClick={resetErrorBoundary}
        className="text-[11px] font-brand font-bold text-primary hover:text-primary/70 transition-colors"
      >
        Retry
      </button>
    )}
  </div>
);

export default WidgetErrorFallback;
