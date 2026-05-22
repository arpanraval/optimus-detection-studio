import React, { useState } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import type { FinetuneRefinement } from '../../types/finetune';
import { useToast } from '../../hooks/useToast';

interface FinetuneLadderCardProps {
  refinement: FinetuneRefinement;
  baselineHitCount: number;
  onApply: (refinement: FinetuneRefinement) => void;
}

// Level -> Material-3 extended status token family.
const LEVEL_TONE: Record<number, { ring: string; chipBg: string; chipText: string; accent: string }> = {
  1: { ring: 'border-ext-green/30',  chipBg: 'bg-ext-green-container',  chipText: 'text-on-ext-green-container',  accent: 'text-ext-green' },
  2: { ring: 'border-ext-blue/30',   chipBg: 'bg-ext-blue-container',   chipText: 'text-on-ext-blue-container',   accent: 'text-ext-blue' },
  3: { ring: 'border-ext-amber/30',  chipBg: 'bg-ext-amber-container',  chipText: 'text-on-ext-amber-container',  accent: 'text-ext-amber' },
};

export const FinetuneLadderCard: React.FC<FinetuneLadderCardProps> = ({
  refinement, baselineHitCount, onApply,
}) => {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const tone = LEVEL_TONE[refinement.level] ?? LEVEL_TONE[2];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(refinement.kql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast('error', 'Copy failed', 'Clipboard access denied');
    }
  };

  return (
    <div className={`rounded-2xl border ${tone.ring} bg-surface-container-high/50 p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${tone.chipBg} ${tone.chipText}`}>
            Level {refinement.level}
          </span>
          <h4 className="text-sm font-semibold text-on-surface">{refinement.title}</h4>
        </div>
        <span className="rounded-md bg-surface-container px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-on-surface-variant">
          {refinement.confidence} confidence
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-3">
        <span className={`font-brand text-3xl font-semibold leading-none tabular-nums ${tone.accent}`}>
          −{Math.round(refinement.noise_reduction_pct)}%
        </span>
        <span className="text-xs text-on-surface-variant">
          {baselineHitCount.toLocaleString()} → {refinement.measured_hit_count.toLocaleString()} events
        </span>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-on-surface">{refinement.reasoning}</p>

      <div className="mt-3 flex items-start gap-2 rounded-xl bg-ext-amber-container/40 px-3 py-2">
        <Icon name="alert-triangle" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ext-amber" />
        <p className="text-[11px] leading-relaxed text-on-ext-amber-container">
          <span className="font-medium">Coverage tradeoff: </span>{refinement.coverage_tradeoff}
        </p>
      </div>

      <details className="group mt-3 rounded-xl border border-outline-variant/30">
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[11px] font-medium text-on-surface-variant hover:text-on-surface">
          <Icon name="code" className="h-3.5 w-3.5" />
          Refined query
          <Icon name="chevron-down" className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <pre className="max-h-52 overflow-auto border-t border-outline-variant/20 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-on-surface-variant">
          {refinement.kql}
        </pre>
      </details>

      <div className="mt-3 flex gap-2">
        <Button variant="outlined" color="primary" leadingIcon={copied ? 'check' : 'copy'} onClick={copy}>
          {copied ? 'Copied' : 'Copy query'}
        </Button>
        <Button variant="filled" color="primary" leadingIcon="arrowRight" onClick={() => onApply(refinement)}>
          Apply to detection
        </Button>
      </div>
    </div>
  );
};
