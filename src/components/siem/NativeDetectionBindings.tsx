import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { NativeRuleReview } from './NativeRuleReview';
import { getProviderMeta } from '@/lib/providerMeta';
import type { IntegrationProvider } from '@/types';

interface BindingRow {
  id: string;
  vendor_rule_id: string;
  binding_status: string;
  availability: 'present' | 'missing' | 'unknown';
  observed_enabled: boolean | null;
  last_seen_at: string | null;
  // `provider` lives directly on siem_rule_bindings (constrained to the six import providers),
  // so the connection's provider name never needs a second round trip through `integrations`.
  provider: IntegrationProvider | null;
  integrations: { name: string | null } | null;
}

function providerNameOf(binding: BindingRow): string {
  const meta = binding.provider ? getProviderMeta(binding.provider) : undefined;
  return binding.integrations?.name || meta?.name || 'the connected SIEM';
}

/** What the last check actually established about this rule in the SIEM. Deliberately using the
 *  spec's row-state vocabulary: "we could not read it" is a different claim from "it is not
 *  there", and "state unavailable" is a different claim from Disabled. */
function stateLabel(binding: BindingRow, providerName: string): string {
  if (binding.binding_status !== 'active') return 'Not tracked';
  if (binding.availability === 'missing') return `Not found in ${providerName}`;
  if (binding.availability !== 'present') return 'State unavailable';
  if (binding.observed_enabled === null) return 'State unavailable';
  return binding.observed_enabled ? `Enabled in ${providerName}` : `Disabled in ${providerName}`;
}

export function NativeDetectionBindings({ detectionId }: { detectionId: string }) {
  const [bindings, setBindings] = useState<BindingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setBindings([]);
    setError(null);
    void supabase
      .from('siem_rule_bindings')
      // The connection name comes from the embedded integration rather than from the detection's
      // native_provenance: a rule linked through match resolution keeps its original provenance on
      // purpose, so provenance cannot name the connection it is actually bound to.
      .select('id,vendor_rule_id,binding_status,availability,observed_enabled,provider,last_seen_at,integrations(name)')
      .eq('detection_id', detectionId)
      .then(({ data, error }) => {
        if (!cancelled) {
          if (error) setError(error.message);
          else setBindings((data || []) as unknown as BindingRow[]);
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
      {bindings.map((binding) => {
        const providerName = providerNameOf(binding);
        return (
        <section key={binding.id} className="rounded-xl border border-outline-variant/20 p-4">
          <button
            type="button"
            aria-expanded={expanded === binding.id}
            onClick={() => setExpanded(expanded === binding.id ? null : binding.id)}
            className="font-medium text-left"
          >
            Production comparison · {providerName}
          </button>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-on-surface-variant">
            <div className="flex items-baseline gap-1.5">
              <dt>Rule</dt>
              <dd className="font-mono text-on-surface break-all">{binding.vendor_rule_id}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt>State</dt>
              <dd className="text-on-surface">{stateLabel(binding, providerName)}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt>Last checked</dt>
              <dd className="text-on-surface">
                {binding.last_seen_at ? (
                  <time dateTime={binding.last_seen_at}>{new Date(binding.last_seen_at).toLocaleString()}</time>
                ) : (
                  'Never'
                )}
              </dd>
            </div>
          </dl>
          {/* State reflects the last check, not live production, and importing never deployed
              anything — both are easy to misread from a badge alone. */}
          <p className="mt-1.5 text-[11px] text-on-surface-variant">
            Reflects the last check, not a live reading.
          </p>
          {expanded === binding.id && (
            <NativeRuleReview key={binding.id} bindingId={binding.id} providerName={providerName} />
          )}
        </section>
        );
      })}
    </div>
  );
}
