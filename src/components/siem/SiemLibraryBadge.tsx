import React from 'react';
import type { Detection } from '@/types';

export function SiemLibraryBadge({ detection }: { detection: Detection }) {
  if (!detection.native_provenance) return null;
  const observations = detection.siem_observations || [];
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
    <span title={`Imported from ${detection.native_provenance.connection_name}. ${details}. Status reflects the last fetch.`}
      className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary whitespace-nowrap">
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${state === 'Enabled' ? 'bg-emerald-600' : 'bg-current'}`} />
      CrowdStrike · {state}
    </span>
  );
}
