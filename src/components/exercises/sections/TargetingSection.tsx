import React from 'react';
import { Icon } from '../../Icon';
import type { IconName } from '../../Icon';

interface Props {
  sectors: { sector: string; count: number }[];
  countries: { country: string; count: number }[];
}

function BarChart({
  items,
  label,
  barColor,
  icon,
}: {
  items: { name: string; count: number }[];
  label: string;
  barColor: string;
  icon: IconName;
}): React.ReactElement {
  const maxCount = items.length > 0 ? Math.max(...items.map((i) => i.count)) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon name={icon} className="w-4 h-4 text-on-surface-variant/60" />
        <h3 className="text-sm font-medium text-on-surface">{label}</h3>
        <span className="rounded-full px-2 py-0.5 text-xs bg-surface-container text-on-surface-variant">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-on-surface-variant/60 italic py-4 text-center">No data available</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const widthPercent = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
            return (
              <div key={item.name} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-on-surface">{item.name}</span>
                  <span className="text-xs font-mono text-on-surface-variant/60">{item.count}</span>
                </div>
                <div className="h-2 rounded-full bg-surface-container overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor} transition-all duration-300`}
                    style={{ width: `${widthPercent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const TargetingSection: React.FC<Props> = ({ sectors, countries }) => {
  const isEmpty = sectors.length === 0 && countries.length === 0;

  return (
    <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 space-y-4">
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <Icon name="target" className="w-5 h-5 text-on-surface-variant" />
        <h2 className="text-lg font-semibold text-on-surface">Targeting Profile</h2>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant/60">
          <Icon name="target" className="w-8 h-8 mb-2" />
          <p className="text-sm">No targeting data available</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <BarChart
            items={sectors.map((s) => ({ name: s.sector, count: s.count }))}
            label="Target Sectors"
            barColor="bg-primary/60"
            icon="crosshairs"
          />
          <BarChart
            items={countries.map((c) => ({ name: c.country, count: c.count }))}
            label="Target Countries"
            barColor="bg-tertiary/60"
            icon="flag"
          />
        </div>
      )}
    </div>
  );
};
