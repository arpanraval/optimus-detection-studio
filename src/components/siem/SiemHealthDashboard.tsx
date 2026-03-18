import React, { useState } from 'react';
import { Icon } from '../Icon';
import { SiemOverviewTab } from './SiemOverviewTab';
import { SiemDriftTab } from './SiemDriftTab';
import { SiemDeployQueueTab } from './SiemDeployQueueTab';
import { SiemHistoryTab } from './SiemHistoryTab';

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'activity' },
  { id: 'drift', label: 'Drift & Sync', icon: 'refresh-cw' },
  { id: 'queue', label: 'Deploy Queue', icon: 'upload-cloud' },
  { id: 'history', label: 'History', icon: 'clock' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function SiemHealthDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  return (
    <div className="space-y-6">
      {/* Tab Bar */}
      <div className="flex gap-1 p-1 bg-surface-container rounded-xl">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
              ${activeTab === tab.id
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }
            `}
          >
            <Icon name={tab.icon} className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <SiemOverviewTab />}
      {activeTab === 'drift' && <SiemDriftTab />}
      {activeTab === 'queue' && <SiemDeployQueueTab />}
      {activeTab === 'history' && <SiemHistoryTab />}
    </div>
  );
}
