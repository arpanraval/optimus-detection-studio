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

  const techCount = preflight.covered_techniques.length;

  // Compact chip mode: shown after Subject Brief is in.
  if (!active) {
    if (techCount === 0) return null;
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-secondary-container px-3 py-1 text-xs font-medium text-on-secondary-container">
        <Icon name="layers" size={12} />
        <span>{techCount} existing technique{techCount === 1 ? '' : 's'} already in your library</span>
      </div>
    );
  }

  // Full banner mode: shown while Subject Brief is being prepared.
  return (
    <div className="mb-4 rounded-lg border border-outline-variant bg-secondary-container px-4 py-3 text-on-secondary-container">
      <div className="flex items-start gap-3">
        <Icon name="info" size={20} className="mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">Pre-flight: existing coverage</div>
          {techCount > 0 ? (
            <div className="mt-1 text-sm">
              You already have detections covering {techCount} MITRE technique{techCount === 1 ? '' : 's'} related to this input.
              The agents will note overlaps so you can avoid duplicating work.
            </div>
          ) : (
            <div className="mt-1 text-sm">
              No related detections found in your library. The agents will research from scratch.
            </div>
          )}
        </div>
        <Button variant="text" color="surface" size="sm" onClick={onCancel}>
          Cancel — already on it
        </Button>
      </div>
    </div>
  );
}

export default PreflightGapBanner;
