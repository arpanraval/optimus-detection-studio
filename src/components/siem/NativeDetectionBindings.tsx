import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { NativeRuleReview } from './NativeRuleReview';

export function NativeDetectionBindings({ detectionId }: { detectionId: string }) {
  const [bindings, setBindings] = useState<Array<{ id: string; vendor_rule_id: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setBindings([]);
    setError(null);
    void supabase
      .from('siem_rule_bindings')
      .select('id,vendor_rule_id')
      .eq('detection_id', detectionId)
      .then(({ data, error }) => {
        if (!cancelled) {
          if (error) setError(error.message);
          else setBindings(data || []);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [detectionId]);
  return (
    <div className="space-y-4 mb-5">
      {error && (
        <p role="alert" className="text-sm text-error">
          Could not load production bindings: {error}
        </p>
      )}
      {bindings.map((binding) => (
        <section key={binding.id} className="rounded-xl border border-outline-variant/20 p-4">
          <button
            type="button"
            aria-expanded={expanded === binding.id}
            onClick={() => setExpanded(expanded === binding.id ? null : binding.id)}
            className="font-medium"
          >
            Production comparison · {binding.vendor_rule_id}
          </button>
          {expanded === binding.id && <NativeRuleReview key={binding.id} bindingId={binding.id} />}
        </section>
      ))}
    </div>
  );
}
