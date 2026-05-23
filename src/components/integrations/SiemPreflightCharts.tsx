import React from 'react';
import type { PreflightTimeBucket, PreflightEntityBucket } from '../../types';

/**
 * Hits-per-day column chart for a pre-flight backtest.
 * Calm CSS bars on a faint baseline — Material-3 tokens, no saturated palette colors.
 */
export const PreflightTimeChart: React.FC<{ data: PreflightTimeBucket[] }> = ({ data }) => {
  if (data.length === 0) {
    return <p className="text-xs text-on-surface-variant/60">No daily activity to chart.</p>;
  }
  const max = Math.max(...data.map((d) => d.hits), 1);
  return (
    <div
      className="flex items-end gap-[3px] h-20 border-b border-outline-variant"
      role="img"
      aria-label="Matched events per day"
    >
      {data.map((d) => {
        const label = new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return (
          <div
            key={d.date}
            className="group relative flex-1 flex flex-col justify-end h-full"
            title={`${label} — ${d.hits} ${d.hits === 1 ? 'hit' : 'hits'}`}
          >
            <div
              className="w-full rounded-t-sm bg-primary/55 group-hover:bg-primary/85 transition-colors"
              style={{ height: `${d.hits > 0 ? Math.max((d.hits / max) * 100, 6) : 0}%` }}
            />
          </div>
        );
      })}
    </div>
  );
};

/**
 * Top-entities horizontal bar list for a pre-flight backtest.
 */
export const PreflightEntityChart: React.FC<{
  data: PreflightEntityBucket[];
  entityColumn: string | null;
}> = ({ data, entityColumn }) => {
  if (data.length === 0) {
    return (
      <p className="text-xs text-on-surface-variant/60">
        {entityColumn ? 'No entities to chart.' : 'Query exposes no recognised entity column.'}
      </p>
    );
  }
  const max = Math.max(...data.map((d) => d.hits), 1);
  return (
    <ul className="space-y-2" aria-label="Top entities by matched events">
      {data.map((d) => (
        <li key={d.name} className="grid grid-cols-[6.5rem_1fr_2.75rem] items-center gap-2.5">
          <span className="truncate text-[11px] text-on-surface-variant" title={d.name}>
            {d.name}
          </span>
          <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${Math.max((d.hits / max) * 100, 4)}%` }}
            />
          </div>
          <span className="text-right text-[11px] font-medium text-on-surface tabular-nums">
            {d.hits.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
};
