import React, { useState } from 'react';

interface QueryTuningPromptProps {
  onConfirm: (quickReason: string, reasoning: string | null) => void;
  onSkip: () => void;
}

const QUICK_REASONS = [
  { value: 'false_positive_fix', label: 'False positive fix' },
  { value: 'performance_optimization', label: 'Performance optimization' },
  { value: 'log_source_change', label: 'Log source change' },
  { value: 'coverage_expansion', label: 'Coverage expansion' },
  { value: 'vendor_update', label: 'Vendor update' },
  { value: 'other', label: 'Other' },
];

export const QueryTuningPrompt: React.FC<QueryTuningPromptProps> = ({
  onConfirm,
  onSkip,
}) => {
  const [quickReason, setQuickReason] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [expanded, setExpanded] = useState(false);

  const handleConfirm = () => {
    onConfirm(quickReason || 'other', reasoning.trim() || null);
  };

  return (
    <div className="bg-surface-container-high/50 rounded-lg border border-outline/10 p-4 mt-3">
      <p className="text-sm font-medium text-on-surface mb-2">Query changed — what was the reason?</p>

      <div className="flex flex-wrap gap-2 mb-3">
        {QUICK_REASONS.map(r => (
          <button
            key={r.value}
            type="button"
            aria-pressed={quickReason === r.value}
            onClick={() => setQuickReason(r.value)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              quickReason === r.value
                ? 'bg-primary/20 border-primary/40 text-primary'
                : 'bg-surface border-outline/20 text-on-surface-variant hover:border-outline/40'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs text-on-surface-variant hover:text-on-surface transition-colors"
        >
          + Add details
        </button>
      ) : (
        <textarea
          value={reasoning}
          onChange={(e) => setReasoning(e.target.value)}
          placeholder="Optional details about the change..."
          rows={2}
          className="w-full px-3 py-2 bg-surface rounded-lg border border-outline/20 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none resize-none mb-2"
        />
      )}

      <div className="flex items-center justify-end gap-2 mt-3">
        <button
          type="button"
          onClick={onSkip}
          className="px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface transition-colors"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!quickReason}
          className="px-3 py-1.5 bg-primary text-on-primary text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-40"
        >
          Save with reason
        </button>
      </div>
    </div>
  );
};

export default QueryTuningPrompt;
