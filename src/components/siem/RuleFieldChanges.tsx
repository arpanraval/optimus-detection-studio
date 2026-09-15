import React from 'react';
import type { RuleContent } from '@/services/nativeSiemService';

/**
 * Everything an update would write that is NOT the query.
 *
 * The query diff only tells the whole truth if the query is all the update sends, and it is not:
 * the mutation serializes the library's name, description and severity beside it, plus the enabled
 * state and the stored rule configuration the binding holds. A rename, a severity drop or a
 * changed lookback would otherwise be invisible on the one screen that authorises the write.
 *
 * Direction matches the diff: `from` is what production has now, `to` is what pressing Update
 * would leave there.
 */

export interface FieldChange {
  label: string;
  from: string;
  to: string;
}

const ABSENT = '—';

function enabledLabel(value: boolean | null): string {
  if (value === null) return 'unknown';
  return value ? 'enabled' : 'disabled';
}

/** Config is nested and provider-shaped; naming the leaf that differs beats dumping JSON. */
function flatten(value: unknown, prefix: string, into: Record<string, string>): Record<string, string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, into);
    }
    return into;
  }
  into[prefix] = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
  return into;
}

export function ruleFieldChanges(local: RuleContent, remote: RuleContent): FieldChange[] {
  const changes: FieldChange[] = [];
  const scalar: Array<[string, string, string]> = [
    ['Name', remote.name, local.name],
    ['Description', remote.description, local.description],
    ['Severity', remote.severity, local.severity],
    ['State', enabledLabel(remote.enabled), enabledLabel(local.enabled)],
  ];
  for (const [label, from, to] of scalar) {
    if (from !== to) changes.push({ label, from, to });
  }

  const localConfig = flatten(local.config, '', {});
  const remoteConfig = flatten(remote.config, '', {});
  for (const key of [...new Set([...Object.keys(remoteConfig), ...Object.keys(localConfig)])].sort()) {
    const from = remoteConfig[key] ?? ABSENT;
    const to = localConfig[key] ?? ABSENT;
    if (from !== to) changes.push({ label: key, from, to });
  }
  return changes;
}

export function RuleFieldChanges({
  local,
  remote,
  remoteTitle,
}: {
  local: RuleContent;
  remote: RuleContent;
  remoteTitle: string;
}): React.JSX.Element {
  const changes = React.useMemo(() => ruleFieldChanges(local, remote), [local, remote]);

  if (changes.length === 0) {
    return (
      <p className="text-xs text-on-surface-variant" role="note">
        Nothing outside the query would change: name, description, severity, state and rule
        configuration already match {remoteTitle}.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-on-surface-variant" role="note">
        Updating would also change {changes.length} setting{changes.length === 1 ? '' : 's'} in{' '}
        {remoteTitle}:
      </p>
      <ul className="space-y-1 text-xs rounded-xl bg-surface-container-high p-3">
        {changes.map((change) => (
          <li key={change.label} className="break-words">
            <span className="font-semibold">{change.label}</span>
            {': '}
            <span className="text-error">{change.from || ABSENT}</span>
            {' → '}
            <span className="text-tertiary">{change.to || ABSENT}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
