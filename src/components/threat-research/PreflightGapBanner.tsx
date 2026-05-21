import React from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import type { PreflightSummary, ResearchSubject } from '../../types/threatResearch';

interface Props {
  preflight: PreflightSummary | null;
  /** Preflight now seeds tree.subject with classification + canonical_name
   *  via the input classifier (no more library scan). The banner pulls the
   *  display fields from there. Passed as a separate prop so the banner can
   *  render even before research has populated the rest of the subject. */
  subject: ResearchSubject | null;
  /** True when the run has started but the Subject Brief hasn't appeared yet — show full banner. */
  active: boolean;
  /** Cancel handler — invokes the orchestrator's cancel action. */
  onCancel: () => void;
}

const CLASSIFICATION_LABEL: Record<string, string> = {
  cve:       'CVE',
  group:     'Threat Actor',
  campaign:  'Campaign',
  technique: 'MITRE Technique',
  concept:   'Concept / Pattern',
};

const CLASSIFICATION_DESCRIPTION: Record<string, string> = {
  cve:       'Exploit-mechanics workflow — focuses on the vulnerability primitive, prerequisites, and confirmed post-exploitation only.',
  group:     'Full 14-tactic walk across the kill chain for this threat actor.',
  campaign:  'Full 14-tactic walk for this named campaign.',
  technique: 'Implementation-variant workflow — enumerates sub-techniques and tooling variants.',
  concept:   'Bounded-landscape workflow — covers how this concept manifests in real incidents.',
};

/** Banner replaces the old library-scan output. Pre-PR2 the banner showed
 *  "X similar in library · Y techniques" from a hybrid_search against the
 *  raw input — that signal was misleading (no minimum-similarity floor)
 *  and is no longer collected. The banner now surfaces the classifier's
 *  decision so users see immediately which workflow lane the run is on
 *  and can spot a misclassification before paying for a full run. */
export function PreflightGapBanner({ preflight, subject, active, onCancel }: Props) {
  if (!preflight) return null;
  if (!subject?.classification) return null;

  const cls = subject.classification;
  const label = CLASSIFICATION_LABEL[cls] ?? cls;
  const description = CLASSIFICATION_DESCRIPTION[cls] ?? '';
  const canonical = subject.subject;

  // Compact pill — shown after Subject Brief is in.
  if (!active) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface px-3 py-1 text-xs text-on-surface-variant">
        <Icon name="layers" size={12} className="text-on-surface-variant" />
        <span>
          Workflow: <span className="font-medium text-on-surface">{label}</span>
          {canonical ? <> · <span className="font-medium text-on-surface">{canonical}</span></> : null}
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
          <div className="text-sm font-semibold">
            Classified as <span className="text-primary">{label}</span>
            {canonical ? <>: <span className="text-on-surface">{canonical}</span></> : null}
          </div>
          {description && (
            <div className="mt-1 text-sm text-on-surface-variant">{description}</div>
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
