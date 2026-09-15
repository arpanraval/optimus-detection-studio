import React from 'react';
import type { RuleContent } from '@/services/nativeSiemService';

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
  severity: string;
  outcome: string;
  lookback: string;
  schedule: string;
  enabled: boolean;
}

export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low', 'Informational'];

function nested(config: Record<string, unknown>, ...path: string[]): unknown {
  return path.reduce<unknown>((value, key) =>
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, config);
}

/** The draft a rule starts from: what it is now, never a default. */
export function boundConfigFrom(content: RuleContent): BoundConfigDraft {
  const config = (content.config ?? {}) as Record<string, unknown>;
  return {
    severity: content.severity ?? '',
    outcome: String(nested(config, 'search', 'outcome') ?? ''),
    lookback: String(nested(config, 'search', 'lookback') ?? ''),
    schedule: String(nested(config, 'operation', 'schedule', 'definition') ?? ''),
    // An unknown production state is not "off": defaulting it to false would have the update
    // disable a running rule.
    enabled: content.enabled !== false,
  };
}

/** The content an update would write with this draft applied, for the review below the form. */
export function applyBoundConfig(content: RuleContent, draft: BoundConfigDraft): RuleContent {
  const config = (content.config ?? {}) as Record<string, unknown>;
  const search = (config.search ?? {}) as Record<string, unknown>;
  const operation = (config.operation ?? {}) as Record<string, unknown>;
  return {
    ...content,
    severity: draft.severity,
    enabled: draft.enabled,
    config: {
      ...config,
      search: { ...search, outcome: draft.outcome, lookback: draft.lookback },
      operation: { ...operation, schedule: { definition: draft.schedule } },
    },
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
}: {
  draft: BoundConfigDraft;
  onChange: (draft: BoundConfigDraft) => void;
  disabled?: boolean;
}): React.JSX.Element {
  const set = <K extends keyof BoundConfigDraft>(key: K, value: BoundConfigDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold">Rule configuration this update sends</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-medium text-on-surface-variant mb-1">Severity</span>
          <select
            value={draft.severity}
            onChange={(event) => set('severity', event.target.value)}
            disabled={disabled}
            className={FIELD_CLASS}
          >
            {(SEVERITIES.includes(draft.severity) ? SEVERITIES : [draft.severity, ...SEVERITIES])
              .map((severity) => <option key={severity} value={severity}>{severity}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-on-surface-variant mb-1">Outcome</span>
          <input
            type="text"
            value={draft.outcome}
            onChange={(event) => set('outcome', event.target.value)}
            disabled={disabled}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-on-surface-variant mb-1">Search window (lookback)</span>
          <input
            type="text"
            value={draft.lookback}
            onChange={(event) => set('lookback', event.target.value)}
            disabled={disabled}
            className={FIELD_CLASS}
          />
          <span className="block text-[11px] text-on-surface-variant mt-1">e.g. &quot;1h0m&quot;, &quot;24h0m&quot;</span>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-on-surface-variant mb-1">Schedule frequency</span>
          <input
            type="text"
            value={draft.schedule}
            onChange={(event) => set('schedule', event.target.value)}
            disabled={disabled}
            className={FIELD_CLASS}
          />
          <span className="block text-[11px] text-on-surface-variant mt-1">e.g. &quot;@every 1h0m&quot; (min &quot;@every 0h5m&quot;)</span>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-on-surface-variant mb-1">Status in CrowdStrike</span>
          <select
            value={draft.enabled ? 'active' : 'inactive'}
            onChange={(event) => set('enabled', event.target.value === 'active')}
            disabled={disabled}
            className={FIELD_CLASS}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>
      <p className="text-[11px] text-on-surface-variant">
        Changes here are saved to the library copy when you deploy. Every other setting — trigger
        mode, suppression, notifications — is left exactly as CrowdStrike has it.
      </p>
    </section>
  );
}
