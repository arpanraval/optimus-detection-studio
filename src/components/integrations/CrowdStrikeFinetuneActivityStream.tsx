import React from 'react';
import { Icon } from '../Icon';
import { InlineMarkdown } from '../ui/InlineMarkdown';
import type { CrowdStrikeFinetuneTimelineEvent } from '../../types/crowdstrikeFinetune';

type QueryTimelineEvent = Extract<CrowdStrikeFinetuneTimelineEvent, { kind: 'query' }>;

function QueryEvent({ event }: { event: QueryTimelineEvent }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-high/40 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Icon name="search" className="h-3.5 w-3.5 text-on-surface-variant" />
        <span className="flex-1 text-xs text-on-surface">{event.purpose}</span>
        {event.status === 'pending' ? (
          <Icon name="loader" className="h-3.5 w-3.5 animate-spin text-on-surface-variant" />
        ) : event.isError ? (
          <span className="text-[11px] font-medium text-error">failed</span>
        ) : (
          <span className="text-[11px] tabular-nums text-on-surface-variant">
            {event.rowCount == null ? 'done' : `${event.rowCount.toLocaleString()} rows`}
          </span>
        )}
      </div>
      <details className="group mt-1.5">
        <summary className="cursor-pointer text-[10px] text-on-surface-variant/60">Show CQL</summary>
        <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-surface-container px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-on-surface-variant">
          {event.cql}
        </pre>
      </details>
    </div>
  );
}

export function CrowdStrikeFinetuneActivityStream({
  timeline,
  running,
  queryCount,
  queryBudget,
}: {
  timeline: CrowdStrikeFinetuneTimelineEvent[];
  running: boolean;
  queryCount: number;
  queryBudget: number;
}) {
  return (
    <div className="space-y-2">
      {timeline.map((event) => {
        if (event.kind === 'message') {
          return (
            <InlineMarkdown
              key={event.id}
              text={event.text}
              className="block px-0.5 text-xs leading-relaxed text-on-surface"
            />
          );
        }
        if (event.kind === 'thinking') {
          return (
            <details key={event.id} className="px-0.5">
              <summary className="cursor-pointer text-[11px] italic text-on-surface-variant/60">
                Reasoning
              </summary>
              <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-on-surface-variant/80">
                {event.text}
              </p>
            </details>
          );
        }
        if (event.kind === 'query') return <QueryEvent key={event.id} event={event} />;
        if (event.kind === 'submit') {
          return (
            <p key={event.id} className="px-0.5 text-xs font-medium text-on-surface-variant">
              Assembling the CQL refinement ladder...
            </p>
          );
        }
        return null;
      })}
      {running && (
        <div className="flex items-center gap-2 px-0.5 pt-1 text-[11px] text-on-surface-variant">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Investigating NGSIEM - {queryCount} / {queryBudget} queries
        </div>
      )}
    </div>
  );
}
