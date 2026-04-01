import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { useAutoDigestSettings, CuratedFeedSource } from '../../hooks/useAutoDigestSettings';
import { FeedActivityLog } from '../threatintel/FeedActivityLog';
import { useAppData } from '../../router/AppDataContext';
import { supabase } from '../../lib/supabaseClient';

// =============================================================================
// TYPES
// =============================================================================

interface AutoDigestSettingsPageProps {
  onBack?: () => void;
}

type TabId = 'sources' | 'configuration' | 'activity';

interface TabDef {
  id: TabId;
  label: string;
  icon: string;
  badge?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const SCHEDULE_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `${String(i).padStart(2, '0')}:00 UTC`,
}));

const MAX_ARTICLES_OPTIONS = Array.from({ length: 10 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

const AI_MODEL_OPTIONS = [
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
];

const CATEGORY_LABELS: Record<string, string> = {
  threat_research: 'Threat Research Blogs',
  government: 'Government & Advisory',
  community: 'Community',
};

const CATEGORY_ORDER: string[] = ['threat_research', 'government', 'community'];

// =============================================================================
// HELPERS
// =============================================================================

function groupByCategory(sources: CuratedFeedSource[]): Record<string, CuratedFeedSource[]> {
  const groups: Record<string, CuratedFeedSource[]> = {};
  for (const source of sources) {
    const cat = source.category;
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(source);
  }
  return groups;
}

function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace('www.', '');
  } catch {
    return url;
  }
}

// =============================================================================
// STAT CARD
// =============================================================================

const StatCard: React.FC<{ label: string; value: string | number; icon: string }> = ({
  label,
  value,
  icon,
}) => (
  <div className="flex items-center gap-4 p-5 rounded-2xl bg-surface-container border border-outline-variant/10">
    <div className="w-11 h-11 rounded-xl bg-primary-container/40 flex items-center justify-center flex-shrink-0">
      <Icon name={icon} className="w-5 h-5 text-primary" />
    </div>
    <div>
      <p className="text-2xl font-bold text-on-surface">{value}</p>
      <p className="text-xs text-on-surface-variant">{label}</p>
    </div>
  </div>
);

// =============================================================================
// SELECTION CARD
// =============================================================================

const SelectionCard: React.FC<{
  source: CuratedFeedSource;
  selected: boolean;
  index: number;
  onToggle: (source: CuratedFeedSource, enabled: boolean) => void;
}> = ({ source, selected, index, onToggle }) => {
  const domain = extractDomain(source.url);

  return (
    <button
      onClick={() => onToggle(source, !selected)}
      className={`relative text-left p-4 rounded-xl border transition-all duration-200 group ${
        selected
          ? 'ring-2 ring-primary bg-primary/5 border-primary/50'
          : 'border-outline-variant/20 hover:border-outline-variant/60 hover:scale-[1.02] hover:shadow-[0_4px_20px_rgba(0,0,0,0.15)]'
      }`}
      style={{ animation: `slideUp 400ms cubic-bezier(0.05, 0.7, 0.1, 1.0) ${index * 40}ms both` }}
    >
      {selected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
          <Icon name="check" className="w-3 h-3 text-on-primary" />
        </div>
      )}
      <div className="flex items-start gap-3">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            selected ? 'bg-primary/15' : 'bg-surface-container-high'
          }`}
        >
          <Icon
            name="globe"
            className={`w-5 h-5 ${selected ? 'text-primary' : 'text-on-surface-variant'}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={`text-sm font-medium ${
              selected ? 'text-on-surface' : 'text-on-surface-variant'
            }`}
          >
            {source.name}
          </div>
          <div className="text-[11px] text-on-surface-variant/50 font-mono mt-0.5">{domain}</div>
          {source.description && (
            <div className="text-xs text-on-surface-variant/60 mt-1 line-clamp-2">
              {source.description}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-outline-variant/10">
        <span className="text-[10px] text-on-surface-variant/40 uppercase tracking-wider font-bold">
          {source.category === 'government' ? 'Government' : 'Research'}
        </span>
        <span className="text-[10px] text-on-surface-variant/40">
          ~{source.avg_articles_week}/wk
        </span>
      </div>
    </button>
  );
};

// =============================================================================
// TAB: SOURCES
// =============================================================================

const SourcesTab: React.FC<{
  curatedSources: CuratedFeedSource[];
  enabledSourceIds: Set<string>;
  toggleSource: (source: CuratedFeedSource, enabled: boolean) => void;
}> = ({ curatedSources, enabledSourceIds, toggleSource }) => {
  const grouped = useMemo(() => groupByCategory(curatedSources), [curatedSources]);
  const enabledCount = enabledSourceIds.size;
  const totalCount = curatedSources.length;
  const allSelected = totalCount > 0 && enabledCount === totalCount;

  const handleSelectAll = () => {
    for (const source of curatedSources) {
      if (!enabledSourceIds.has(source.id)) {
        toggleSource(source, true);
      }
    }
  };

  const handleDeselectAll = () => {
    for (const source of curatedSources) {
      if (enabledSourceIds.has(source.id)) {
        toggleSource(source, false);
      }
    }
  };

  if (curatedSources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-surface-container-high flex items-center justify-center mb-4">
          <Icon name="globe" className="w-7 h-7 text-on-surface-variant/40" />
        </div>
        <p className="text-sm text-on-surface-variant">
          No curated sources available. Run the database seed to populate sources.
        </p>
      </div>
    );
  }

  // Track a global index across categories for stagger animation
  let globalIndex = 0;

  return (
    <div className="space-y-6">
      {/* Toolbar: Select All / Deselect All + count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={allSelected ? handleDeselectAll : handleSelectAll}
            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            {enabledCount} of {totalCount} sources selected
          </span>
        </div>
      </div>

      {/* Category groups */}
      {CATEGORY_ORDER.map((cat) => {
        const sources = grouped[cat];
        if (!sources || sources.length === 0) return null;
        return (
          <div key={cat}>
            <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
              {CATEGORY_LABELS[cat] ?? cat}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sources.map((source) => {
                const idx = globalIndex++;
                return (
                  <SelectionCard
                    key={source.id}
                    source={source}
                    selected={enabledSourceIds.has(source.id)}
                    index={idx}
                    onToggle={toggleSource}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// =============================================================================
// TAB: CONFIGURATION
// =============================================================================

const ConfigurationTab: React.FC<{
  settings: {
    is_enabled: boolean;
    schedule_hour_utc: number;
    max_articles_per_day: number;
    ai_model: string;
  } | null;
  saveSettings: (updates: Record<string, unknown>) => Promise<void>;
}> = ({ settings, saveSettings }) => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [scheduleHour, setScheduleHour] = useState('0');
  const [maxArticles, setMaxArticles] = useState('5');
  const [aiModel, setAiModel] = useState('gemini-3-flash-preview');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setIsEnabled(settings.is_enabled);
      setScheduleHour(String(settings.schedule_hour_utc));
      setMaxArticles(String(settings.max_articles_per_day));
      setAiModel(settings.ai_model);
    }
  }, [settings]);

  const handleToggle = () => {
    const newValue = !isEnabled;
    setIsEnabled(newValue);
    saveSettings({ is_enabled: newValue });
  };

  const handleSave = async () => {
    setIsSaving(true);
    await saveSettings({
      is_enabled: isEnabled,
      schedule_hour_utc: Number(scheduleHour),
      max_articles_per_day: Number(maxArticles),
      ai_model: aiModel,
    });
    setIsSaving(false);
  };

  return (
    <div className="rounded-2xl bg-surface-container border border-outline-variant/10 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-outline-variant/10">
        <h3 className="text-sm font-semibold text-on-surface">Auto-Digest Configuration</h3>
      </div>

      {/* Body */}
      <div className="p-5 space-y-5">
        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-on-surface">Enable Auto-Digest</p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Automatically fetch, classify, and digest vendor reports on a schedule
            </p>
          </div>
          <button
            onClick={handleToggle}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
              isEnabled ? 'bg-primary' : 'bg-outline-variant/30'
            }`}
            role="switch"
            aria-checked={isEnabled}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                isEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Schedule + Max Articles + AI Model */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select
            label="Schedule (UTC)"
            options={SCHEDULE_OPTIONS}
            value={scheduleHour}
            onChange={setScheduleHour}
            size="sm"
          />
          <Select
            label="Max articles / day"
            options={MAX_ARTICLES_OPTIONS}
            value={maxArticles}
            onChange={setMaxArticles}
            size="sm"
          />
          <Select
            label="AI Model"
            options={AI_MODEL_OPTIONS}
            value={aiModel}
            onChange={setAiModel}
            size="sm"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3.5 border-t border-outline-variant/10 flex justify-end">
        <Button
          color="primary"
          size="sm"
          leadingIcon="save"
          loading={isSaving}
          onClick={handleSave}
        >
          Save Configuration
        </Button>
      </div>
    </div>
  );
};

// =============================================================================
// TAB: ACTIVITY
// =============================================================================

const ActivityTab: React.FC<{ userId: string }> = ({ userId }) => {
  const [digestedCount, setDigestedCount] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [avgCoverage, setAvgCoverage] = useState(0);
  const [hasActivity, setHasActivity] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId) return;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const fetchStats = async () => {
      const { data, error } = await supabase
        .from('threat_intel_reports')
        .select('id, coverage_percent, review_status')
        .eq('source', 'auto')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo);

      if (error || !data) {
        setHasActivity(false);
        return;
      }

      setDigestedCount(data.length);
      setReviewedCount(data.filter((r) => r.review_status !== 'pending').length);

      const withCoverage = data.filter((r) => r.coverage_percent != null);
      setAvgCoverage(
        withCoverage.length > 0
          ? Math.round(
              withCoverage.reduce((sum, r) => sum + (r.coverage_percent ?? 0), 0) /
                withCoverage.length,
            )
          : 0,
      );
      setHasActivity(data.length > 0);
    };

    fetchStats();
  }, [userId]);

  if (hasActivity === false) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-surface-container-high flex items-center justify-center mb-4">
          <Icon name="activity" className="w-7 h-7 text-on-surface-variant/40" />
        </div>
        <p className="text-sm text-on-surface-variant max-w-xs">
          No auto-digest activity yet. Enable auto-digest and select sources to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Digested reports" value={digestedCount} icon="file-text" />
        <StatCard label="Reports reviewed" value={reviewedCount} icon="check-circle" />
        <StatCard label="Avg coverage" value={`${avgCoverage}%`} icon="chart-bar" />
      </div>

      {/* Feed Activity Log */}
      <FeedActivityLog userId={userId} />
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const AutoDigestSettingsPage: React.FC<AutoDigestSettingsPageProps> = ({ onBack }) => {
  const { user } = useAppData();
  const userId = user?.id ?? '';

  const {
    settings,
    curatedSources,
    enabledSourceIds,
    isLoading,
    saveSettings,
    toggleSource,
  } = useAutoDigestSettings(userId);

  const [activeTab, setActiveTab] = useState<TabId>('sources');

  const tabs: TabDef[] = useMemo(
    () => [
      {
        id: 'sources',
        label: 'Sources',
        icon: 'globe',
        badge: enabledSourceIds.size > 0 ? String(enabledSourceIds.size) : undefined,
      },
      { id: 'configuration', label: 'Configuration', icon: 'settings' },
      { id: 'activity', label: 'Activity', icon: 'activity' },
    ],
    [enabledSourceIds.size],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-on-surface-variant">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high/50 transition-colors"
          >
            <Icon name="arrow-left" className="w-5 h-5" />
          </button>
        )}
        <div>
          <h1 className="text-xl font-bold text-on-surface">Intelligence Sources</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Configure automatic threat intelligence ingestion and processing
          </p>
        </div>
      </div>

      {/* Pill Tab Bar */}
      <div className="flex gap-1 p-1 bg-surface-container rounded-xl">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-primary text-on-primary shadow-sm rounded-lg'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface rounded-lg'
            }`}
          >
            <Icon name={tab.icon} className="w-4 h-4" />
            {tab.label}
            {tab.badge && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-on-primary/20">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'sources' && (
        <SourcesTab
          curatedSources={curatedSources}
          enabledSourceIds={enabledSourceIds}
          toggleSource={toggleSource}
        />
      )}

      {activeTab === 'configuration' && (
        <ConfigurationTab settings={settings} saveSettings={saveSettings} />
      )}

      {activeTab === 'activity' && userId && <ActivityTab userId={userId} />}
    </div>
  );
};

export default AutoDigestSettingsPage;
