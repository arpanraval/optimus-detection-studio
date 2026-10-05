import React from 'react';
import { EMPTY_FILTER_LABEL, EMPTY_FILTER_VALUE } from '../../constants/filters';

interface ActiveFilterChipsProps {
  filters: Record<string, string[]>;
  fieldLabels: Record<string, string>;
  onRemove: (field: string, value: string) => void;
  onClearAll: () => void;
}

export function ActiveFilterChips({
  filters,
  fieldLabels,
  onRemove,
  onClearAll,
}: ActiveFilterChipsProps) {
  const entries = Object.entries(filters).filter(([, values]) => values.length > 0);

  if (entries.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap px-1">
      {entries.map(([field, values]) =>
        values.map(value => {
          // The "(None)" sentinel is an internal value; chips show the label users picked.
          const isEmpty = value === EMPTY_FILTER_VALUE;
          const display = isEmpty ? EMPTY_FILTER_LABEL : value;
          return (
          <span
            key={`${field}-${value}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs
                       bg-on-surface-variant/10 text-on-surface-variant rounded-full font-medium"
          >
            <span className="text-on-surface-variant/50">{fieldLabels[field] || field}:</span>
            <span className={`text-on-surface ${isEmpty ? 'italic' : ''}`}>{display}</span>
            <button
              onClick={() => onRemove(field, value)}
              className="ml-0.5 text-on-surface-variant/40 hover:text-on-surface-variant transition-colors"
              aria-label={`Remove ${display} filter`}
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" />
              </svg>
            </button>
          </span>
          );
        })
      )}
      <button
        onClick={onClearAll}
        className="text-[11px] text-on-surface-variant/40 hover:text-on-surface-variant
                   transition-colors ml-1"
      >
        Clear all
      </button>
    </div>
  );
}
