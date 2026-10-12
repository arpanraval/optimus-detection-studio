import React from 'react';

export function LoadError({
  label = 'Couldn’t load this content.',
  onRetry,
}: {
  label?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="p-6 text-sm text-on-surface-variant space-y-3">
      <p>{label}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 rounded-xl border border-outline-variant text-primary"
        >
          Try again
        </button>
      )}
    </div>
  );
}
