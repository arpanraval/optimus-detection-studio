import React, { useState } from 'react';
import { Icon } from '../../Icon';
import type { ReportCampaign, ReportSoftware } from '../types';

interface Props {
  software: ReportSoftware[];
  campaigns: ReportCampaign[];
  onNavigate: (path: string) => void;
}

type ActiveTab = 'software' | 'campaigns';

const TYPE_BADGE: Record<string, string> = {
  Malware: 'bg-red-500/15 text-red-400',
  Tool: 'bg-blue-500/15 text-blue-400',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function SoftwareTable({
  software,
  onNavigate,
}: {
  software: ReportSoftware[];
  onNavigate: (path: string) => void;
}): React.ReactElement {
  if (software.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant/60">
        <Icon name="code" className="w-8 h-8 mb-2" />
        <p className="text-sm">No software data</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-6">
      <table className="w-full min-w-[600px]">
        <thead>
          <tr className="border-b border-outline-variant/10">
            <th className="px-4 py-3 pl-6 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
              Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
              Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
              Groups Using
            </th>
            <th className="px-4 py-3 pr-6 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
              Techniques
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {software.map((sw) => (
            <tr key={sw.id} className="hover:bg-surface-container/50 transition-colors">
              <td className="px-4 py-3 pl-6">
                <button
                  onClick={() => onNavigate(`/intelligence/software/${sw.mitreId}`)}
                  className="text-sm font-medium text-teal-400 hover:text-teal-300 hover:underline transition-colors text-left"
                >
                  {sw.name}
                </button>
              </td>
              <td className="px-4 py-3">
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_BADGE[sw.type] ?? 'bg-slate-500/15 text-slate-400'}`}>
                  {sw.type}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-on-surface">
                {sw.groupCount}
              </td>
              <td className="px-4 py-3 pr-6 text-sm text-on-surface">
                {sw.techniqueCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CampaignsTable({ campaigns }: { campaigns: ReportCampaign[] }): React.ReactElement {
  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant/60">
        <Icon name="flag" className="w-8 h-8 mb-2" />
        <p className="text-sm">No campaign data</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-6">
      <table className="w-full min-w-[700px]">
        <thead>
          <tr className="border-b border-outline-variant/10">
            <th className="px-4 py-3 pl-6 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
              Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
              Attributed Group
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
              First Seen
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
              Last Seen
            </th>
            <th className="px-4 py-3 pr-6 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
              Techniques
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {campaigns.map((c) => (
            <tr key={c.id} className="hover:bg-surface-container/50 transition-colors">
              <td className="px-4 py-3 pl-6 text-sm font-medium text-on-surface">
                {c.name}
              </td>
              <td className="px-4 py-3 text-sm text-on-surface-variant">
                {c.attributedGroup ?? <span className="italic text-on-surface-variant/60">Unknown</span>}
              </td>
              <td className="px-4 py-3 text-xs text-on-surface-variant/60">
                {formatDate(c.firstSeen)}
              </td>
              <td className="px-4 py-3 text-xs text-on-surface-variant/60">
                {formatDate(c.lastSeen)}
              </td>
              <td className="px-4 py-3 pr-6 text-sm text-on-surface">
                {c.techniqueCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const ArsenalSection: React.FC<Props> = ({ software, campaigns, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('software');

  return (
    <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 space-y-4">
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <Icon name="code" className="w-5 h-5 text-on-surface-variant" />
        <h2 className="text-lg font-semibold text-on-surface">Software & Campaign Arsenal</h2>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-outline-variant/10">
        <button
          onClick={() => setActiveTab('software')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'software'
              ? 'border-primary text-primary'
              : 'border-transparent text-on-surface-variant/60 hover:text-on-surface-variant'
          }`}
        >
          Software
          <span className="ml-2 rounded-full px-2 py-0.5 text-xs bg-surface-container text-on-surface-variant">
            {software.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'campaigns'
              ? 'border-primary text-primary'
              : 'border-transparent text-on-surface-variant/60 hover:text-on-surface-variant'
          }`}
        >
          Campaigns
          <span className="ml-2 rounded-full px-2 py-0.5 text-xs bg-surface-container text-on-surface-variant">
            {campaigns.length}
          </span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'software' ? (
        <SoftwareTable software={software} onNavigate={onNavigate} />
      ) : (
        <CampaignsTable campaigns={campaigns} />
      )}
    </div>
  );
};
