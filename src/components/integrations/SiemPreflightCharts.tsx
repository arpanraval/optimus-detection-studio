import React from 'react';
import type { PreflightTimeBucket, PreflightEntityBucket } from '../../types';

/** Hits-per-day vertical bar chart (CSS bars — dashboard visual language). */
export const PreflightTimeChart: React.FC<{ data: PreflightTimeBucket[] }> = ({ data }) => {
  if (data.length === 0) {
    return <p className="text-xs text-on-surface-variant/60">No time-series data available.</p>;
  }
  const max = Math.max(...data.map((d) => d.hits), 1);
  return (
    <div className="flex items-end gap-0.5 h-24" role="img" aria-label="Hits per day">
      {data.map((d) => (
        <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full" title={`${new Date(d.date).toLocaleDateString()}: ${d.hits} hits`}>
          <div
            className="w-full rounded-sm bg-primary/70 min-h-[2px]"
            style={{ height: `${(d.hits / max) * 100}%` }}
          />
        </div>
      ))}
    </div>
  );
};

/** Top-entities horizontal bar list. */
export const PreflightEntityChart: React.FC<{
  data: PreflightEntityBucket[];
  entityColumn: string | null;
}> = ({ data, entityColumn }) => {
  if (data.length === 0) {
    return (
      <p className="text-xs text-on-surface-variant/60">
        No entity breakdown available{entityColumn ? '' : ' — query exposes no recognized entity column'}.
      </p>
    );
  }
  const max = Math.max(...data.map((d) => d.hits), 1);
  return (
    <div className="space-y-1.5" role="img" aria-label="Top entities by hit count">
      {data.map((d) => (
        <div key={d.name} className="flex items-center gap-2">
          <span className="text-[11px] text-on-surface-variant w-32 truncate" title={d.name}>
            {d.name}
          </span>
          <div className="flex-1 h-3 rounded-sm bg-surface-container-highest overflow-hidden">
            <div className="h-full rounded-sm bg-primary/70" style={{ width: `${(d.hits / max) * 100}%` }} />
          </div>
          <span className="text-[11px] font-medium text-on-surface w-10 text-right">{d.hits}</span>
        </div>
      ))}
    </div>
  );
};
