import React from 'react';

interface ScopeToggleProps {
  includeMyLab: boolean;
  onChange: (include: boolean) => void;
  className?: string;
}

export function ScopeToggle({ includeMyLab, onChange, className = '' }: ScopeToggleProps) {
  return (
    <div className={`inline-flex items-center rounded-lg bg-surface-container p-0.5 ${className}`}>
      <button
        onClick={() => onChange(false)}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
          !includeMyLab
            ? 'bg-primary/15 text-primary shadow-sm'
            : 'text-on-surface-variant hover:text-on-surface'
        }`}
      >
        Production Only
      </button>
      <button
        onClick={() => onChange(true)}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
          includeMyLab
            ? 'bg-primary/15 text-primary shadow-sm'
            : 'text-on-surface-variant hover:text-on-surface'
        }`}
      >
        + My Lab
      </button>
    </div>
  );
}
