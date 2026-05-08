import React from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import type { PreflightSummary } from '../../types/threatResearch';

interface Props {
  preflight: PreflightSummary | null;
  /** True when the run has started but the Subject Brief hasn't appeared yet — show full banner. */
  active: boolean;
  /** Cancel handler — invokes the orchestrator's cancel action. */
  onCancel: () => void;
}

export function PreflightGapBanner({ preflight, active, onCancel }: Props) {
  if (!preflight) return null;

  const hits = preflight.library_hits;
  const techCount = preflight.techniques_seen_in_hits.length;

  // Compact pill — shown after Subject Brief is in.
  if (!active) {
    if (hits === 0) return null;
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface px-3 py-1 text-xs text-on-surface-variant">
        <Icon name="layers" size={12} className="text-on-surface-variant" />
        <span>
          <span className="font-medium text-on-surface">{hits}</span> similar in library · {techCount} technique{techCount === 1 ? '' : 's'} mentioned
        </span>
      </div>
    );
  }

  // Full card — shown while Subject Brief is being prepared.
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container px-5 py-4 text-on-surface">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
          <Icon name="info" size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Pre-flight library scan</div>
          {hits > 0 ? (
            <div className="mt-1 text-sm text-on-surface-variant">
              <span className="font-medium text-on-surface">{hits}</span> detection{hits === 1 ? '' : 's'} in your library {hits === 1 ? 'is' : 'are'} similar to this input,
              mentioning <span className="font-medium text-on-surface">{techCount}</span> MITRE technique{techCount === 1 ? '' : 's'} between them.
              Not a coverage claim — agents will look at each behaviour individually and flag overlaps.
            </div>
          ) : (
            <div className="mt-1 text-sm text-on-surface-variant">
              No similar detections found in your library. The agents will research from scratch.
            </div>
          )}
        </div>
        <Button variant="text" color="surface" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default PreflightGapBanner;
