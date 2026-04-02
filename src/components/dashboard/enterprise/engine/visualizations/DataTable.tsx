import React, { useState } from 'react';
import type { WidgetDataResult, EngineWidgetConfig } from '../types';

interface Props {
  data: WidgetDataResult;
  config: EngineWidgetConfig;
}

export const DataTable: React.FC<Props> = ({ data }) => {
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const items = [...data.values].sort((a, b) => sortDir === 'desc' ? b.value - a.value : a.value - b.value);

  if (items.length === 0) {
    return <div className="flex items-center justify-center h-full text-[11px] text-on-surface-variant">No data</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <table className="w-full" aria-label="Data metrics">
        <thead>
          <tr className="border-b border-outline-variant/10">
            <th scope="col" className="text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-wider py-2 px-2">Label</th>
            <th
              scope="col"
              aria-sort={sortDir === 'desc' ? 'descending' : 'ascending'}
              className="text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-wider py-2 px-2 cursor-pointer select-none"
              onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
            >
              Value {sortDir === 'desc' ? '\u2193' : '\u2191'}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.label} className={i % 2 === 0 ? 'bg-surface-container-lowest/50' : ''}>
              <td className="text-[11px] text-on-surface py-1.5 px-2">{item.label}</td>
              <td className="text-[11px] font-bold text-on-surface text-right py-1.5 px-2">{item.value.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
