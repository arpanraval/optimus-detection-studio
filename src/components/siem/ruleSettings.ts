import type { RuleContent } from '@/services/nativeSiemService';
import { schedulingFields } from '../../../supabase/functions/_shared/siem-rule-editing';

/**
 * A rule's settings as labelled rows, for comparing two sides of it.
 *
 * The comparison used to print the configuration as raw JSON, so the one field the user most needs
 * — whether the rule is running — was a line of free text above a scrolling block, and every other
 * setting was buried in punctuation. Two columns of the same labels make a difference visible
 * without reading either side closely.
 */

export interface SettingRow {
  label: string;
  value: string;
}

const ABSENT = '—';

function nested(config: Record<string, unknown>, ...path: string[]): unknown {
  return path.reduce<unknown>((value, key) =>
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, config);
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === '') return ABSENT;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function ruleSettingRows(content: RuleContent): SettingRow[] {
  const config = (content.config ?? {}) as Record<string, unknown>;
  const fields = schedulingFields(content);
  return [
    // An unknown state is not "off", and saying so matters: this is the field that decides whether
    // the rule is running in production at all.
    {
      label: 'Status',
      value: content.enabled === null || content.enabled === undefined
        ? 'Unknown' : content.enabled ? 'Active' : 'Inactive',
    },
    { label: 'Severity', value: text(content.severity) },
    ...(fields.outcomeEditable ? [{ label: 'Outcome', value: text(fields.outcome) }] : []),
    ...(fields.lookbackEditable ? [{ label: 'Search window', value: text(fields.lookback) }] : []),
    { label: 'Schedule', value: config.continuous === true ? 'Continuous' : text(fields.schedule || config.interval || config.cron_schedule) },
    { label: 'ATT&CK tactic', value: text(config.tactic ?? config.tactics ?? nested(config, 'alertTemplate', 'category')) },
    { label: 'ATT&CK technique', value: text(config.technique ?? config.techniques ?? config.mitreTechniques) },
  ];
}
