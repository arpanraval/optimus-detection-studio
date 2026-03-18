import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FeedManager } from '../../components/threatintel/FeedManager';
import { FeedEntries } from '../../components/threatintel/FeedEntries';
import { useThreatIntelFeeds } from '../../hooks/useThreatIntelFeeds';
import { useAppData } from '../AppDataContext';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES } from '../routes';

const ThreatIntelFeedsPageInner: React.FC = () => {
  const { user } = useAppData();
  const feedsHook = useThreatIntelFeeds(user!.id);
  const [activeTab, setActiveTab] = useState<'manager' | 'entries'>('manager');

  const tabClass = (tab: string) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      activeTab === tab
        ? 'bg-primary-container text-on-primary-container'
        : 'text-on-surface-variant hover:bg-surface-container-high/50 hover:text-on-surface'
    }`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button className={tabClass('manager')} onClick={() => setActiveTab('manager')}>
          Feed Manager
        </button>
        <button className={tabClass('entries')} onClick={() => setActiveTab('entries')}>
          Feed Entries
        </button>
      </div>
      {activeTab === 'manager' ? (
        <FeedManager {...feedsHook} />
      ) : (
        <FeedEntries {...feedsHook} />
      )}
    </div>
  );
};

export const ThreatIntelFeedsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageErrorBoundary pageName="Threat Intel Feeds" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <ThreatIntelFeedsPageInner />
    </PageErrorBoundary>
  );
};

export default ThreatIntelFeedsPage;
