import React from 'react';
import type { RuleContent } from '@/services/nativeSiemService';

/**
 * The rule configuration an update will write, shown as values rather than as a form.
 *
 * A new rule gets a configuration form because nothing exists yet to contradict. A tracked rule
 * already has settings in production, and a form pre-filled with defaults would invite overwriting
 * a real lookback with 1h0m by simply being there. But hiding the settings entirely was worse: the
 * update does write severity, outcome, lookback, schedule and status, and the screen that
 * authorises it said nothing about them.
 *
 * These are the library copy's values, which is what the write sends. They are edited in the
 * rule's production comparison ("Edit library copy"), not here.
 */

export interface ConfigRow {
  label: string;
  value: string;
}

const ABSENT = '—';

function text(value: unknown): string {
  if (value === null || value === undefined || value === '') return ABSENT;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function nested(config: Record<string, unknown>, ...path: string[]): unknown {
  return path.reduce<unknown>((value, key) =>
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, config);
}

export function ruleConfigSummary(content: RuleContent): ConfigRow[] {
  const config = (content.config ?? {}) as Record<string, unknown>;
  return [
    { label: 'Severity', value: text(content.severity) },
    { label: 'Outcome', value: text(nested(config, 'search', 'outcome')) },
    { label: 'Search window (lookback)', value: text(nested(config, 'search', 'lookback')) },
    { label: 'Schedule frequency', value: text(nested(config, 'operation', 'schedule', 'definition')) },
    {
      label: 'Status',
      value: content.enabled === null || content.enabled === undefined
        ? ABSENT
        : content.enabled ? 'Active' : 'Inactive',
    },
  ];
}

export function RuleConfigSummary({ content }: { content: RuleContent }): React.JSX.Element {
  const rows = React.useMemo(() => ruleConfigSummary(content), [content]);

  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold">Rule configuration this update sends</h4>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-surface-container-high p-3">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-xs font-medium text-on-surface-variant">{row.label}</dt>
            <dd className="text-sm text-on-surface break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[11px] text-on-surface-variant">
        Edit these on the rule&apos;s production comparison, under Edit library copy. Every other
        setting — trigger mode, suppression, notifications — is left exactly as CrowdStrike has it.
      </p>
    </section>
  );
}
