import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { DetectionDecision, DecisionType, QuickReason } from '../types/intelligence';

interface CreateDecisionInput {
  detection_id?: string;
  technique_id?: string;
  decision_type: DecisionType;
  decision_context: string;
  reasoning?: string | null;
  quick_reason?: QuickReason | null;
  previous_value?: string;
  new_value?: string;
  related_entity_ids?: string[];
  review_by?: string;
}

export function useDetectionDecisions(detectionId?: string) {
  const [decisions, setDecisions] = useState<DetectionDecision[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDecisions = useCallback(async () => {
    if (!detectionId) return;
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('detection_decisions')
      .select('*')
      .eq('detection_id', detectionId)
      .order('created_at', { ascending: false });
    if (fetchError) {
      setError('Failed to load decisions');
      console.error('fetchDecisions error:', fetchError);
    }
    setDecisions((data as DetectionDecision[]) || []);
    setLoading(false);
  }, [detectionId]);

  useEffect(() => { fetchDecisions(); }, [fetchDecisions]);

  const createDecision = useCallback(async (input: CreateDecisionInput) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Auto-set review_by for gap_accepted (90 days) and deprecation (180 days)
    let reviewBy = input.review_by || null;
    if (!reviewBy && input.decision_type === 'gap_accepted') {
      reviewBy = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    }
    if (!reviewBy && input.decision_type === 'status_change' && input.new_value === 'Deprecated') {
      reviewBy = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    }

    const { data, error } = await supabase
      .from('detection_decisions')
      .insert({ ...input, user_id: user.id, review_by: reviewBy })
      .select()
      .single();

    if (error) throw error;
    if (detectionId) fetchDecisions();
    return data as DetectionDecision;
  }, [detectionId, fetchDecisions]);

  const createBulkDecisions = useCallback(async (
    detectionIds: string[],
    base: Omit<CreateDecisionInput, 'detection_id' | 'related_entity_ids'>
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const rows = detectionIds.map(id => ({
      ...base,
      user_id: user.id,
      detection_id: id,
      related_entity_ids: detectionIds.filter(x => x !== id),
      review_by: base.decision_type === 'status_change' && base.new_value === 'Deprecated'
        ? new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString()
        : null,
    }));
    const { error } = await supabase.from('detection_decisions').insert(rows);
    if (error) throw error;
  }, []);

  return { decisions, loading, error, fetchDecisions, createDecision, createBulkDecisions };
}
