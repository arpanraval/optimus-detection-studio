import React, { useMemo, useState } from 'react';
import { Icon } from '../../Icon';
import type { StateSponsoredGroup } from '../types';

interface Props {
  groups: StateSponsoredGroup[];
  onNavigate: (path: string) => void;
}

type SortKey = 'name' | 'techniqueCount' | 'coveragePercent' | 'taw' | 'lastModified';

const ACTIVITY_BADGE: Record<string, string> = {
  Espionage: 'bg-blue-500/15 text-blue-400',
  Sabotage: 'bg-red-500/15 text-red-400',
  'Financially motivated': 'bg-amber-500/15 text-amber-400',
};

function tawColor(taw: number): string {
  if (taw > 0.7) return 'text-red-400';
  if (taw > 0.5) return 'text-orange-400';
  if (taw > 0.3) return 'text-amber-400';
  return 'text-emerald-400';
}

function coverageBarColor(percent: number): string {
  if (percent >= 76) return 'bg-emerald-500';
  if (percent >= 51) return 'bg-amber-500';
  if (percent >= 26) return 'bg-orange-500';
  return 'bg-red-500';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onClick,
  className = '',
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: 'asc' | 'desc';
  onClick: (key: SortKey) => void;
  className?: string;
}): React.ReactElement {
  const isActive = activeKey === sortKey;
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider
        text-on-surface-variant/60 cursor-pointer select-none hover:text-on-surface-variant ${className}`}
      onClick={() => onClick(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (
          <Icon
            name={direction === 'asc' ? 'chevron-up' : 'chevron-down'}
            className="w-3 h-3"
          />
        )}
      </span>
    </th>
  );
}

export const ThreatGroupsTable: React.FC<Props> = ({ groups, onNavigate }) => {
  const [sortKey, setSortKey] = useState<SortKey>('taw');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function handleSort(key: SortKey): void {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = useMemo(() => {
    const copy = [...groups];
    const dir = sortDir === 'asc' ? 1 : -1;

    copy.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return dir * a.name.localeCompare(b.name);
        case 'techniqueCount':
          return dir * (a.techniqueCount - b.techniqueCount);
        case 'coveragePercent':
          return dir * (a.coveragePercent - b.coveragePercent);
        case 'taw':
          return dir * (a.taw - b.taw);
        case 'lastModified':
          return dir * (new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime());
        default:
          return 0;
      }
    });

    return copy;
  }, [groups, sortKey, sortDir]);

  return (
    <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 space-y-4">
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <Icon name="users" className="w-5 h-5 text-on-surface-variant" />
        <h2 className="text-lg font-semibold text-on-surface">Threat Groups</h2>
        <span className="rounded-full px-3 py-0.5 text-xs font-medium bg-primary/15 text-primary">
          {groups.length}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-6">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-outline-variant/10">
              <SortableHeader
                label="Name"
                sortKey="name"
                activeKey={sortKey}
                direction={sortDir}
                onClick={handleSort}
                className="pl-6"
              />
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
                Vendor Aliases
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
                Activity
              </th>
              <SortableHeader
                label="Techniques"
                sortKey="techniqueCount"
                activeKey={sortKey}
                direction={sortDir}
                onClick={handleSort}
              />
              <SortableHeader
                label="Coverage"
                sortKey="coveragePercent"
                activeKey={sortKey}
                direction={sortDir}
                onClick={handleSort}
              />
              <SortableHeader
                label="TAW"
                sortKey="taw"
                activeKey={sortKey}
                direction={sortDir}
                onClick={handleSort}
              />
              <SortableHeader
                label="Last Modified"
                sortKey="lastModified"
                activeKey={sortKey}
                direction={sortDir}
                onClick={handleSort}
                className="pr-6"
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {sorted.map((group) => (
              <tr
                key={group.id}
                className="hover:bg-surface-container/50 transition-colors"
              >
                {/* Name */}
                <td className="px-4 py-3 pl-6">
                  <button
                    onClick={() => onNavigate(`/intelligence/groups/${group.mitreId}`)}
                    className="text-sm font-medium text-teal-400 hover:text-teal-300 hover:underline transition-colors text-left"
                  >
                    {group.name}
                  </button>
                </td>

                {/* Vendor Aliases */}
                <td className="px-4 py-3">
                  <div className="flex flex-col text-xs text-on-surface-variant/60">
                    {group.vendorNames.microsoft && (
                      <span>{group.vendorNames.microsoft}</span>
                    )}
                    {group.vendorNames.crowdstrike && (
                      <span>{group.vendorNames.crowdstrike}</span>
                    )}
                    {!group.vendorNames.microsoft && !group.vendorNames.crowdstrike && (
                      <span className="italic">None</span>
                    )}
                  </div>
                </td>

                {/* Activity Type */}
                <td className="px-4 py-3">
                  {group.activityType ? (
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                        ACTIVITY_BADGE[group.activityType] ?? 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      {group.activityType}
                    </span>
                  ) : (
                    <span className="text-xs text-on-surface-variant/60 italic">Unknown</span>
                  )}
                </td>

                {/* Techniques */}
                <td className="px-4 py-3 text-sm text-on-surface">
                  {group.techniqueCount}
                </td>

                {/* Coverage */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <div className="flex-1 h-1.5 rounded-full bg-surface-container-low overflow-hidden">
                      <div
                        className={`h-full rounded-full ${coverageBarColor(group.coveragePercent)} transition-all duration-300`}
                        style={{ width: `${Math.round(group.coveragePercent)}%` }}
                      />
                    </div>
                    <span className="text-xs text-on-surface-variant w-9 text-right">
                      {Math.round(group.coveragePercent)}%
                    </span>
                  </div>
                </td>

                {/* TAW */}
                <td className="px-4 py-3">
                  <span className={`text-sm font-mono font-medium ${tawColor(group.taw)}`}>
                    {group.taw.toFixed(2)}
                  </span>
                </td>

                {/* Last Modified */}
                <td className="px-4 py-3 pr-6 text-xs text-on-surface-variant/60">
                  {formatDate(group.lastModified)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
