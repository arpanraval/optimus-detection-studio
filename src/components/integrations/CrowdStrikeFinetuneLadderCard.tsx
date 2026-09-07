import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { BulletList } from '../ui/BulletList';
import { Icon } from '../Icon';
import { useToast } from '../../hooks/useToast';
import type { CrowdStrikeFinetuneRefinement } from '../../types/crowdstrikeFinetune';

const LEVEL_LABEL: Record<number, string> = {
  1: 'Conservative',
  2: 'Balanced',
  3: 'Aggressive',
};

export function CrowdStrikeFinetuneLadderCard({
  refinement,
  baselineHitCount,
  onApply,
}: {
  refinement: CrowdStrikeFinetuneRefinement;
  baselineHitCount: number;
  onApply: (refinement: CrowdStrikeFinetuneRefinement) => void;
}) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(refinement.cql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast('error', 'Copy failed', 'Clipboard access denied');
    }
  };

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-high/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-on-surface-variant/70">
          Level {refinement.level} - {LEVEL_LABEL[refinement.level] ?? 'Refinement'}
        </span>
        <span className="text-[11px] text-on-surface-variant">
          {refinement.confidence} confidence
        </span>
      </div>
      <h4 className="mt-1 text-sm font-semibold text-on-surface">{refinement.title}</h4>
      <div className="mt-3 flex items-baseline gap-2.5">
        <span className="font-brand text-[2rem] font-semibold leading-none tabular-nums text-on-surface">
          &minus;{Math.round(refinement.noise_reduction_pct)}%
        </span>
        <span className="text-xs text-on-surface-variant">
          noise - {baselineHitCount.toLocaleString()} to {refinement.measured_hit_count.toLocaleString()} events
        </span>
      </div>
      <details className="group mt-3 rounded-xl border border-outline-variant">
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[11px] font-medium text-on-surface-variant">
          <Icon name="info" className="h-3.5 w-3.5" />
          Why &amp; tradeoff
        </summary>
        <div className="space-y-2.5 border-t border-outline-variant px-3 py-2.5">
          <BulletList text={refinement.reasoning} className="text-xs leading-relaxed text-on-surface" />
          <BulletList
            text={refinement.coverage_tradeoff}
            className="text-[11px] leading-relaxed text-on-surface-variant"
          />
        </div>
      </details>
      <details className="group mt-3 rounded-xl border border-outline-variant">
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[11px] font-medium text-on-surface-variant">
          <Icon name="code" className="h-3.5 w-3.5" />
          Refined CrowdStrike CQL
        </summary>
        <pre className="max-h-52 overflow-auto border-t border-outline-variant px-3 py-2.5 font-mono text-[11px] leading-relaxed text-on-surface-variant">
          {refinement.cql}
        </pre>
      </details>
      <div className="mt-3 flex gap-2">
        <Button variant="outlined" color="primary" leadingIcon={copied ? 'check' : 'copy'} onClick={copy}>
          {copied ? 'Copied' : 'Copy CQL'}
        </Button>
        <Button variant="filled" color="primary" leadingIcon="arrowRight" onClick={() => onApply(refinement)}>
          Apply to detection
        </Button>
      </div>
    </div>
  );
}
