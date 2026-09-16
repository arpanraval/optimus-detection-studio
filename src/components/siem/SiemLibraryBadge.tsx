import React from 'react';
import type { Detection } from '@/types';
import { getProviderMeta } from '@/lib/providerMeta';
import type { IntegrationProvider } from '@/types';

/** Per-binding state, worded to the spec's row-state vocabulary rather than a bare adjective:
 *  "Unknown" is never conflated with "Disabled", and a binding this viewer cannot see the
 *  detail of reads as "State unavailable", never as "no binding exists" (G33). */
function bindingStateLabel(observation: NonNullable<Detection['siem_observations']>[number]): string {
  if (observation.binding_status !== 'active') return 'Untracked';
  if (observation.availability === 'missing') return 'Missing';
  if (observation.availability !== 'present' || observation.observed_enabled === null) return 'State unavailable';
  return observation.observed_enabled ? 'Enabled' : 'Disabled';
}

function providerNameFor(observation: NonNullable<Detection['siem_observations']>[number] | undefined, fallbackProvider?: string | null): string {
  const providerId = (observation?.provider ?? fallbackProvider) as IntegrationProvider | null | undefined;
  const meta = providerId ? getProviderMeta(providerId) : undefined;
  return observation?.integrations?.name || meta?.name || 'Connected SIEM';
}

/** Single binding (or provenance-only) badge: `{Provider} · {State}`. Never says "Enabled" for a
 *  binding this viewer cannot actually see the detail of. */
function SingleBadge({
  providerName,
  state,
  title,
}: {
  providerName: string;
  state: string;
  title: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary whitespace-nowrap h-5"
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${state === 'Enabled' ? 'bg-emerald-600' : 'bg-current'}`} />
      {providerName} · {state}
    </span>
  );
}

/** Multiple bindings compress into "SIEM ×N" with an accessible popover listing each target,
 *  state, and last-checked time. Mixed states never flatten into a single green "Enabled"
 *  claim — the compact badge itself never claims a single state at all. */
function MultiBadge({ observations }: { observations: NonNullable<Detection['siem_observations']> }) {
  const [open, setOpen] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <span className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary whitespace-nowrap h-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
        {`SIEM ×${observations.length}`}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="SIEM bindings"
          className="absolute z-20 mt-1 min-w-56 rounded-lg border border-outline-variant/30 bg-surface-container-low p-2 shadow-lg text-xs"
        >
          <ul className="space-y-1.5">
            {observations.map((observation) => (
              <li key={observation.id} className="flex items-center justify-between gap-3">
                <span className="text-on-surface">
                  {providerNameFor(observation)} · {bindingStateLabel(observation)}
                </span>
                <span className="text-on-surface-variant whitespace-nowrap">
                  {new Date(observation.last_seen_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}

export function SiemLibraryBadge({ detection }: { detection: Detection }) {
  // A binding, not provenance, is what makes a rule tracked in a SIEM. A rule authored in the
  // library and later linked to a remote rule keeps its original provenance on purpose, and used
  // to show no SIEM identity at all.
  const observations = detection.siem_observations || [];
  // Either kind of evidence is enough. Provenance alone still earns a badge: under RLS a
  // shared-library viewer may not see the binding rows, and a blank badge would read as "not in
  // a SIEM" rather than "we cannot see" (G33).
  if (!detection.native_provenance && !observations.length) return null;

  if (observations.length > 1) {
    return <MultiBadge observations={observations} />;
  }

  const observation = observations[0];
  const providerName = providerNameFor(observation, detection.native_provenance?.provider);
  const state = observation ? bindingStateLabel(observation) : 'State unavailable';
  const details = observation
    ? `Last fetched ${new Date(observation.last_seen_at).toLocaleString()}`
    : 'SIEM state unavailable. Open the connection to check.';
  const title = `${detection.native_provenance
    ? `Imported from ${detection.native_provenance.connection_name}`
    : `Linked to a ${providerName} rule`}. ${details}. Status reflects the last fetch.`;

  return <SingleBadge providerName={providerName} state={state} title={title} />;
}
