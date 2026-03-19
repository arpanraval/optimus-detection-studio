import React, { useEffect, useState } from 'react';

interface DecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reasoning: string | null, quickReason: string | null) => void;
  onSkip?: () => void;
  decisionType: string;
  title: string;
  description: string;
  isBlocking: boolean;
}

const QUICK_REASONS = [
  { value: 'false_positive_fix', label: 'False positive fix' },
  { value: 'performance_optimization', label: 'Performance optimization' },
  { value: 'log_source_change', label: 'Log source change' },
  { value: 'coverage_expansion', label: 'Coverage expansion' },
  { value: 'vendor_update', label: 'Vendor update' },
  { value: 'other', label: 'Other' },
];

export const DecisionModal: React.FC<DecisionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onSkip,
  decisionType,
  title,
  description,
  isBlocking,
}) => {
  const [reasoning, setReasoning] = useState('');
  const [quickReason, setQuickReason] = useState<string | null>(null);

  // Reset form state when modal opens so stale values don't persist across re-opens
  useEffect(() => {
    if (isOpen) {
      setReasoning('');
      setQuickReason(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isQueryTuning = decisionType === 'query_tuning';
  const canSubmit = isBlocking ? reasoning.trim().length >= 10 : true;

  const handleConfirm = () => {
    onConfirm(
      reasoning.trim() || null,
      quickReason
    );
    setReasoning('');
    setQuickReason(null);
  };

  const handleSkip = () => {
    if (onSkip) onSkip();
    else onClose();
    setReasoning('');
    setQuickReason(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-container rounded-xl border border-outline/10 shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="px-6 pt-5 pb-3">
          <h3 className="text-lg font-semibold text-on-surface">{title}</h3>
          <p className="text-sm text-on-surface-variant mt-1">{description}</p>
        </div>

        {/* Body */}
        <div className="px-6 pb-4 space-y-4">
          {/* Quick reason dropdown (for query tuning) */}
          {isQueryTuning && (
            <div>
              <label htmlFor="decision-quick-reason" className="block text-xs font-medium text-on-surface-variant mb-1.5">
                What changed?
              </label>
              <select
                id="decision-quick-reason"
                value={quickReason || ''}
                onChange={(e) => setQuickReason(e.target.value || null)}
                className="w-full px-3 py-2 bg-surface rounded-lg border border-outline/20 text-sm text-on-surface focus:border-primary focus:outline-none"
              >
                <option value="">Select a reason...</option>
                {QUICK_REASONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Reasoning textarea */}
          <div>
            <label htmlFor="decision-reasoning" className="block text-xs font-medium text-on-surface-variant mb-1.5">
              {isBlocking ? 'Why? (required)' : 'Why? (optional)'}
            </label>
            <textarea
              id="decision-reasoning"
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              placeholder={isBlocking
                ? 'Explain the reasoning behind this decision...'
                : 'Optionally explain why...'}
              rows={3}
              className="w-full px-3 py-2 bg-surface rounded-lg border border-outline/20 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none resize-none"
            />
            {isBlocking && reasoning.trim().length > 0 && reasoning.trim().length < 10 && (
              <p className="text-xs text-red-400 mt-1">Minimum 10 characters</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center justify-end gap-3">
          {!isBlocking && (
            <button
              onClick={handleSkip}
              className="px-4 py-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Skip
            </button>
          )}
          {isBlocking && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="px-4 py-2 bg-primary text-on-primary text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isBlocking ? 'Confirm & Record' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DecisionModal;
