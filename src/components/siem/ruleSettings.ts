import type { RuleContent } from '@/services/nativeSiemService';

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
  return [
    // An unknown state is not "off", and saying so matters: this is the field that decides whether
    // the rule is running in production at all.
    {
      label: 'Status',
      value: content.enabled === null || content.enabled === undefined
        ? 'Unknown' : content.enabled ? 'Active' : 'Inactive',
    },
    { label: 'Severity', value: text(content.severity) },
    { label: 'Outcome', value: text(nested(config, 'search', 'outcome')) },
    { label: 'Search window', value: text(nested(config, 'search', 'lookback')) },
    { label: 'Schedule', value: text(nested(config, 'operation', 'schedule', 'definition')) },
    { label: 'ATT&CK tactic', value: text(config.tactic) },
    { label: 'ATT&CK technique', value: text(config.technique) },
  ];
}
