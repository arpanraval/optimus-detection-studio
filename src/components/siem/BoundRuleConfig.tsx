import { Select } from '@/components/ui/Select';
import React from 'react';
import type { RuleContent } from '@/services/nativeSiemService';
import { applySchedule, schedulingFields } from '../../../supabase/functions/_shared/siem-rule-editing';

/**
 * The rule configuration a re-deploy sends — editable, because a re-deploy is not only a query
 * change. Severity, outcome, the search window, the schedule and whether the rule runs are all in
 * the update payload; showing them read-only made them unchangeable from Optimus once a rule was
 * imported.
 *
 * It is deliberately NOT the create form. That form is built from defaults, and defaults sitting in
 * a form over a live rule invite overwriting a real 24h0m window with 1h0m by simply being there.
 * These fields start as the values the rule has now, and what the user changes is what the review
 * below them then describes.
 */

export interface BoundConfigDraft {
  scheduleEditable?: boolean;
  lookbackEditable?: boolean;
  outcomeEditable?: boolean;
  severity: string;
  outcome: string;
  lookback: string;
  schedule: string;
  enabled: boolean | null;
}

export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low', 'Informational'];

/** The draft a rule starts from: what it is now, never a default. */
export function boundConfigFrom(content: RuleContent): BoundConfigDraft {
  return {
    ...schedulingFields(content),
    severity: content.severity ?? '',
    enabled: content.enabled ?? null,
  };
}

/** The content an update would write with this draft applied, for the review below the form. */
export function applyBoundConfig(content: RuleContent, draft: BoundConfigDraft): RuleContent {
  return {
    ...content,
    severity: draft.severity,
    enabled: draft.enabled,
    config: applySchedule(content, draft),
  } as RuleContent;
}

export function boundConfigChanged(a: BoundConfigDraft, b: BoundConfigDraft): boolean {
  return (Object.keys(a) as Array<keyof BoundConfigDraft>).some((key) => a[key] !== b[key]);
}

const FIELD_CLASS = 'w-full px-3 py-2 bg-surface-container-high border border-outline-variant rounded-lg ' +
  'text-sm text-on-surface focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10';

export function BoundRuleConfig({
  draft,
  onChange,
  disabled,
  providerName = 'the connected SIEM',
  provider,
}: {
  draft: BoundConfigDraft;
  onChange: (draft: BoundConfigDraft) => void;
  disabled?: boolean;
  providerName?: string;
  provider?: string;
}): React.JSX.Element {
  const set = <K extends keyof BoundConfigDraft>(key: K, value: BoundConfigDraft[K]) =>
    onChange({ ...draft, [key]: value });
  const severities = provider === 'sentinel' || provider === 'defender_xdr' ? SEVERITIES.filter(s => s !== 'Critical') : SEVERITIES;

  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold">Rule configuration this update sends</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-medium text-on-surface-variant mb-1">Severity</span>
          <Select
            value={draft.severity}
            onChange={(nextValue) => set('severity', nextValue)}
            disabled={disabled}
            aria-label="Severity"
            size="sm"
            options={[
              ...(severities.includes(draft.severity) ? severities : [draft.severity, ...severities]).map(
                (severity) => ({ value: severity, label: severity }),
              ),
            ]}
          />
        </label>
        {draft.outcomeEditable !== false && <label className="block">
          <span className="block text-xs font-medium text-on-surface-variant mb-1">Outcome</span>
          <input
            type="text"
            value={draft.outcome}
            onChange={(event) => set('outcome', event.target.value)}
            disabled={disabled}
            className={FIELD_CLASS}
          />
        </label>}
        {draft.lookbackEditable !== false && <label className="block">
          <span className="block text-xs font-medium text-on-surface-variant mb-1">Search window (lookback)</span>
          <input
            type="text"
            value={draft.lookback}
            onChange={(event) => set('lookback', event.target.value)}
            disabled={disabled}
            className={FIELD_CLASS}
          />
          <span className="block text-[11px] text-on-surface-variant mt-1">Keep the time format shown by this provider.</span>
        </label>}
        {draft.scheduleEditable !== false && <label className="block">
          <span className="block text-xs font-medium text-on-surface-variant mb-1">Schedule frequency</span>
          <input
            type="text"
            value={draft.schedule}
            onChange={(event) => set('schedule', event.target.value)}
            disabled={disabled}
            className={FIELD_CLASS}
          />
          <span className="block text-[11px] text-on-surface-variant mt-1">Keep the schedule format shown by this provider.</span>
        </label>}
        <label className="block">
          <span className="block text-xs font-medium text-on-surface-variant mb-1">Status in {providerName}</span>
          <Select
            value={draft.enabled === null ? 'unknown' : draft.enabled ? 'active' : 'inactive'}
            onChange={(nextValue) => set('enabled', nextValue === 'active')}
            disabled={disabled}
            aria-label="Rule status"
            size="sm"
            options={[
              ...(draft.enabled === null
                ? [{ value: 'unknown', label: 'Unknown — preserve current state', disabled: true }]
                : []),
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
          />
        </label>
      </div>
      <p className="text-[11px] text-on-surface-variant">
        Changes here are saved to the library copy when you deploy. Every other setting — trigger
        mode, suppression, notifications — is left exactly as {providerName} has it.
      </p>
    </section>
  );
}
