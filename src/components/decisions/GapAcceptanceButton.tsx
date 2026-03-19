import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useDetectionDecisions } from '../../hooks/useDetectionDecisions';
import type { DetectionDecision } from '../../types/intelligence';

interface GapAcceptanceButtonProps {
  techniqueId: string;
  onAccepted?: () => void;
  onReopened?: () => void;
}

type GapState = 'accepted' | 'open' | 'loading';

export const GapAcceptanceButton: React.FC<GapAcceptanceButtonProps> = ({
  techniqueId,
  onAccepted,
  onReopened,
}) => {
  const [gapState, setGapState] = useState<GapState>('loading');
  const [showForm, setShowForm] = useState(false);
  const [reasoning, setReasoning] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use hook without a detectionId — we only use createDecision from it
  const { createDecision } = useDetectionDecisions();

  const fetchLatestDecision = useCallback(async () => {
    setGapState('loading');
    const { data, error: fetchError } = await supabase
      .from('detection_decisions')
      .select('id, decision_type, created_at')
      .eq('technique_id', techniqueId)
      .in('decision_type', ['gap_accepted', 'gap_rejected'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error('[GapAcceptanceButton] fetch error:', fetchError);
      setGapState('open');
      return;
    }

    const latest = (data as Pick<DetectionDecision, 'id' | 'decision_type' | 'created_at'>[])?.[0];
    if (latest?.decision_type === 'gap_accepted') {
      setGapState('accepted');
    } else {
      setGapState('open');
    }
  }, [techniqueId]);

  useEffect(() => {
    fetchLatestDecision();
  }, [fetchLatestDecision]);

  const handleAcceptRisk = async () => {
    if (!reasoning.trim()) {
      setError('Reasoning is required to accept a risk.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createDecision({
        technique_id: techniqueId,
        decision_type: 'gap_accepted',
        decision_context: `Gap accepted for technique ${techniqueId}`,
        reasoning: reasoning.trim(),
      });
      setShowForm(false);
      setReasoning('');
      setGapState('accepted');
      onAccepted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save decision.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopen = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await createDecision({
        technique_id: techniqueId,
        decision_type: 'gap_rejected',
        decision_context: `Gap re-opened for technique ${techniqueId}`,
        reasoning: null,
      });
      setGapState('open');
      onReopened?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to re-open gap.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setReasoning('');
    setError(null);
  };

  if (gapState === 'loading') {
    return (
      <div className="h-8 w-28 rounded-lg bg-surface-container-high animate-pulse" aria-label="Loading gap status" />
    );
  }

  if (gapState === 'accepted') {
    return (
      <div className="flex flex-col gap-2">
        {error && (
          <p className="text-xs text-error">{error}</p>
        )}
        <button
          type="button"
          disabled={submitting}
          onClick={handleReopen}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
            bg-red-500/10 text-red-400 border border-red-500/25
            hover:bg-red-500/20 hover:border-red-500/40
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors"
        >
          {submitting ? (
            <span className="w-3 h-3 border-2 border-red-400/40 border-t-red-400 rounded-full animate-spin" />
          ) : (
            <span className="w-3 h-3 rounded-full bg-red-400/60 flex-shrink-0" />
          )}
          Re-open Gap
        </button>
      </div>
    );
  }

  // gapState === 'open'
  if (showForm) {
    return (
      <div className="flex flex-col gap-2 p-3 rounded-xl bg-surface-container-high border border-outline-variant/30">
        <label htmlFor={`gap-reasoning-${techniqueId}`} className="text-xs font-semibold text-on-surface">
          Reasoning <span className="text-error">*</span>
        </label>
        <textarea
          id={`gap-reasoning-${techniqueId}`}
          value={reasoning}
          onChange={(e) => setReasoning(e.target.value)}
          placeholder="Why is this risk acceptable? (e.g. compensating controls in place, low-value target for this technique)"
          rows={3}
          className="w-full text-xs rounded-lg bg-surface-container border border-outline-variant/40 px-3 py-2
            text-on-surface placeholder-on-surface-variant/40 resize-none
            focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60
            transition-colors"
        />
        {error && (
          <p className="text-xs text-error">{error}</p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={submitting || !reasoning.trim()}
            onClick={handleAcceptRisk}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
              bg-emerald-500/15 text-emerald-400 border border-emerald-500/25
              hover:bg-emerald-500/25 hover:border-emerald-500/40
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors"
          >
            {submitting ? (
              <span className="w-3 h-3 border-2 border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin" />
            ) : null}
            Confirm Accept Risk
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleCancelForm}
            className="px-3 py-1.5 rounded-lg text-xs font-medium
              text-on-surface-variant hover:text-on-surface
              hover:bg-surface-container
              disabled:opacity-50
              transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="text-xs text-error">{error}</p>
      )}
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
          bg-emerald-500/10 text-emerald-400 border border-emerald-500/25
          hover:bg-emerald-500/20 hover:border-emerald-500/40
          transition-colors"
      >
        <span className="w-3 h-3 rounded-full bg-emerald-400/60 flex-shrink-0" />
        Accept Risk
      </button>
    </div>
  );
};
