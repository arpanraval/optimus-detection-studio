import type { Json, RuleContent } from './native-siem-model.ts';

export function defenderFrequency(value: unknown): string {
  const text = String(value ?? '').toUpperCase();
  const periods: Record<string, string> = { '1H': 'PT1H', '3H': 'PT3H', '12H': 'PT12H', '24H': 'P1D', 'PT24H': 'P1D' };
  if (periods[text]) return periods[text];
  if (/^P(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+S)?)?$/.test(text) && text !== 'P' && text !== 'PT') return text;
  throw new Error('A supported ISO 8601 schedule frequency is required');
}

export function defenderCreateSchedule(value: unknown): Record<string, string> {
  // Graph documents continuous creation only as period=0. Preserve this existing path until
  // the replacement frequency is verified; scheduled rules use the current frequency field.
  // https://learn.microsoft.com/graph/api/resources/security-ruleschedule?view=graph-rest-beta
  return String(value) === '0' ? { period: '0' } : { frequency: defenderFrequency(value) };
}

/** Preserve existing response actions and entity mappings when updating an imported rule. */
export function defenderUpdate(raw: Record<string, Json>, desired: RuleContent): Record<string, Json> {
  if (!['High', 'Medium', 'Low', 'Informational'].includes(desired.severity)) {
    throw new Error('Defender requires High, Medium, Low or Informational severity');
  }
  const action = (raw.detectionAction ?? {}) as Record<string, Json>;
  const template = (action.alertTemplate ?? {}) as Record<string, Json>;
  const payload: Record<string, Json> = {
    displayName: desired.name, description: desired.description,
    queryCondition: { ...((raw.queryCondition ?? {}) as Record<string, Json>), queryText: desired.query },
    detectionAction: { ...action, alertTemplate: { ...template, severity: desired.severity.toLowerCase() } },
  };
  const enabled = raw.status === 'enabled' ? true : ['disabled', 'autoDisabled'].includes(String(raw.status))
    ? false : typeof raw.isEnabled === 'boolean' ? raw.isEnabled : null;
  if (desired.enabled !== null && desired.enabled !== enabled) payload.status = desired.enabled ? 'enabled' : 'disabled';
  // Continuous rules retain their schedule when its replacement representation is unknown.
  if (desired.config.continuous !== true) payload.schedule = { frequency: defenderFrequency(desired.config.frequency) };
  return payload;
}

export function sentinelUpdate(raw: Record<string, Json>, desired: RuleContent): Record<string, Json> {
  if (!['High', 'Medium', 'Low', 'Informational'].includes(desired.severity)) {
    throw new Error('Sentinel requires High, Medium, Low or Informational severity');
  }
  if (raw.kind !== 'Scheduled' && raw.kind !== 'NRT') throw new Error('Only Scheduled and NRT rules can be updated');
  const properties = Object.fromEntries(Object.entries((raw.properties ?? {}) as Record<string, Json>)
    .filter(([key]) => !['lastModifiedUtc', 'createdTimeUtc', 'lastModifiedTimeUtc'].includes(key)));
  Object.assign(properties, { displayName: desired.name, description: desired.description,
    query: desired.query, severity: desired.severity });
  if (desired.enabled !== null) properties.enabled = desired.enabled;
  if (raw.kind === 'Scheduled') {
    properties.queryFrequency = desired.config.queryFrequency;
    properties.queryPeriod = desired.config.queryPeriod;
  }
  return { kind: raw.kind, properties, ...(raw.etag ? { etag: raw.etag } : {}) };
}

/** Normalize older snapshots too; dropping runtime fields must not manufacture drift. */
export function semanticContent(provider: string, content: RuleContent): RuleContent {
  if (!['defender_xdr', 'sentinel', 'elastic', 'chronicle', 'splunk'].includes(provider)) return content;
  const config = { ...content.config };
  const excluded: Record<string, string[]> = {
    defender_xdr: ['lastRunDetails', 'statusSource', 'scheduleSource', 'autoDisabled', 'status', 'unmappedFields'],
    sentinel: ['armId', 'unmappedFields', 'lastModifiedUtc', 'displayName', 'description', 'query', 'enabled', 'severity'],
    elastic: ['revision', 'version', 'objectId', 'unmappedFields'],
    chronicle: ['revisionId', 'revisionCreateTime', 'compilationState', 'compilationError', 'unmappedFields'],
    splunk: ['next_scheduled_time', 'qualifiedSearch', 'dispatchState', 'triggered_alert_count', 'is_visible',
      'disabled', 'search', 'description'],
  };
  for (const key of excluded[provider]) delete config[key];
  if (provider === 'defender_xdr') {
    if (config.frequency && config.continuous !== true) config.frequency = defenderFrequency(config.frequency);
    if (config.alertTemplate && typeof config.alertTemplate === 'object') {
      const template = { ...(config.alertTemplate as Record<string, Json>) };
      delete template.severity;
      config.alertTemplate = template;
    }
  }
  const severity = String(content.severity);
  return { ...content, severity: severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase(), config };
}
