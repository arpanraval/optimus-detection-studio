import React from 'react';
import type { Detection } from '@/types';

export function SiemLibraryBadge({ detection }: { detection: Detection }) {
  // A binding, not provenance, is what makes a rule tracked in a SIEM. A rule authored in the
  // library and later linked to a CrowdStrike rule keeps its original provenance on purpose, and
  // used to show no SIEM identity at all.
  const observations = detection.siem_observations || [];
  // Either kind of evidence is enough. Provenance alone still earns a badge reading Unknown:
  // under RLS a shared-library viewer may not see the binding rows, and a blank badge would
  // read as "not in a SIEM" rather than "we cannot see".
  if (!detection.native_provenance && !observations.length) return null;
  const labels = observations.map(observation =>
    observation.binding_status !== 'active' ? 'Untracked' :
    observation.availability === 'missing' ? 'Missing' :
    observation.availability !== 'present' || observation.observed_enabled === null ? 'Unknown' :
    observation.observed_enabled ? 'Enabled' : 'Disabled',
  );
  const state = !labels.length ? 'Unknown' : new Set(labels).size === 1 ? labels[0] : 'Mixed';
  const details = observations.map(observation =>
    `Last fetched ${new Date(observation.last_seen_at).toLocaleString()}`,
  ).join('; ') || 'SIEM state unavailable. Open the connection to check.';
  return (
    <span title={`${detection.native_provenance
      ? `Imported from ${detection.native_provenance.connection_name}`
      : 'Linked to a CrowdStrike rule'}. ${details}. Status reflects the last fetch.`}
      className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary whitespace-nowrap">
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${state === 'Enabled' ? 'bg-emerald-600' : 'bg-current'}`} />
      CrowdStrike · {state}
    </span>
  );
}
