import React from 'react';
import { Icon } from '../Icon';
import { InlineMarkdown } from '../ui/InlineMarkdown';
import type { FinetuneTimelineEvent } from '../../types/finetune';

interface FinetuneActivityStreamProps {
  timeline: FinetuneTimelineEvent[];
  running: boolean;
  queryCount: number;
  queryBudget: number;
}

/** One executed hunting query — its purpose, outcome, and (collapsed) KQL. */
const QueryStep: React.FC<{ ev: Extract<FinetuneTimelineEvent, { kind: 'query' }> }> = ({ ev }) => (
  <div className="rounded-xl border border-outline-variant bg-surface-container-high/40 px-3 py-2.5">
    <div className="flex items-center gap-2">
      <Icon name="search" className="h-3.5 w-3.5 flex-shrink-0 text-on-surface-variant" />
      <span className="flex-1 text-xs text-on-surface">{ev.purpose}</span>
      {ev.status === 'pending' ? (
        <Icon name="loader" className="h-3.5 w-3.5 animate-spin text-on-surface-variant" />
      ) : ev.isError ? (
        <span className="text-[11px] font-medium text-error">failed</span>
      ) : (
        <span className="text-[11px] tabular-nums text-on-surface-variant">
          {ev.rowCount == null ? 'done' : `${ev.rowCount.toLocaleString()} rows`}
        </span>
      )}
    </div>
    <details className="group mt-1.5">
      <summary className="cursor-pointer text-[10px] text-on-surface-variant/60 hover:text-on-surface-variant">
        Show query
      </summary>
      <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-surface-container px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-on-surface-variant">
        {ev.kql}
      </pre>
    </details>
  </div>
);

/** The live "watch the agent work" timeline — agent notes and the queries it ran. */
export const FinetuneActivityStream: React.FC<FinetuneActivityStreamProps> = ({
  timeline, running, queryCount, queryBudget,
}) => (
  <div className="space-y-2">
    {timeline.map((ev) => {
      if (ev.kind === 'message') {
        return (
          <InlineMarkdown
            key={ev.id}
            text={ev.text}
            className="block px-0.5 text-xs leading-relaxed text-on-surface"
          />
        );
      }
      if (ev.kind === 'thinking') {
        return (
          <details key={ev.id} className="px-0.5">
            <summary className="cursor-pointer text-[11px] italic text-on-surface-variant/60">
              Reasoning
            </summary>
            <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-on-surface-variant/80">
              {ev.text}
            </p>
          </details>
        );
      }
      if (ev.kind === 'query') return <QueryStep key={ev.id} ev={ev} />;
      if (ev.kind === 'submit') {
        return (
          <p key={ev.id} className="px-0.5 text-xs font-medium text-on-surface-variant">
            Assembling the refinement ladder…
          </p>
        );
      }
      return null;
    })}

    {running && (
      <div className="flex items-center gap-2 px-0.5 pt-1 text-[11px] text-on-surface-variant">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        Investigating &middot; {queryCount} / {queryBudget} queries
      </div>
    )}
  </div>
);
