import type { Json, RuleContent } from './native-siem-model.ts';

/** Editable scheduling fields are inferred from the stored provider configuration, never defaults. */
export function schedulingFields(content: RuleContent) {
  const c = content.config ?? {};
  if (content.language === 'CQL') return {
    schedule: String((c.operation as { schedule?: { definition?: string } })?.schedule?.definition ?? ''),
    lookback: String((c.search as { lookback?: string })?.lookback ?? ''),
    outcome: String((c.search as { outcome?: string })?.outcome ?? ''),
    scheduleEditable: true, lookbackEditable: true, outcomeEditable: true,
  };
  if (c.kind === 'Scheduled' || c.kind === 'NRT') return {
    schedule: String(c.queryFrequency ?? ''), lookback: String(c.queryPeriod ?? ''), outcome: '',
    scheduleEditable: c.kind === 'Scheduled', lookbackEditable: c.kind === 'Scheduled', outcomeEditable: false,
  };
  if ('frequency' in c) return {
    schedule: String(c.frequency ?? ''), lookback: '', outcome: '',
    scheduleEditable: c.continuous !== true, lookbackEditable: false, outcomeEditable: false,
  };
  return { schedule: '', lookback: '', outcome: '', scheduleEditable: false, lookbackEditable: false, outcomeEditable: false };
}

export function applySchedule(content: RuleContent, changes: { schedule?: string; lookback?: string; outcome?: string }): Record<string, Json> {
  const c = content.config ?? {};
  const fields = schedulingFields(content);
  if (content.language === 'CQL') return { ...c,
    search: { ...(c.search as Record<string, Json>),
      ...(changes.lookback === undefined ? {} : { lookback: changes.lookback }),
      ...(changes.outcome === undefined ? {} : { outcome: changes.outcome }) },
    operation: { ...(c.operation as Record<string, Json>),
      ...(changes.schedule === undefined ? {} : { schedule: {
        ...((c.operation as { schedule?: Record<string, Json> })?.schedule ?? {}), definition: changes.schedule,
      } }) },
  };
  if (c.kind === 'Scheduled') return { ...c,
    ...(changes.schedule === undefined ? {} : { queryFrequency: changes.schedule }),
    ...(changes.lookback === undefined ? {} : { queryPeriod: changes.lookback }),
  };
  if (fields.scheduleEditable && changes.schedule !== undefined) return { ...c, frequency: changes.schedule };
  return { ...c };
}
