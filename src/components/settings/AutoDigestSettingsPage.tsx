import React, { useState, useEffect } from 'react';
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

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
// SOURCE ROW
// =============================================================================

const SourceRow: React.FC<{
  source: CuratedFeedSource;
  isEnabled: boolean;
  onToggle: (source: CuratedFeedSource, enabled: boolean) => void;
}> = ({ source, isEnabled, onToggle }) => {
  // Extract display domain from URL
  const displayUrl = (() => {
    try {
      const u = new URL(source.url);
      return u.hostname.replace('www.', '');
    } catch { return source.url; }
  })();

  return (
    <label className="flex items-start gap-3 px-3 py-3 rounded-xl hover:bg-surface-container-high/40 transition-colors cursor-pointer group">
      <input
        type="checkbox"
        checked={isEnabled}
        onChange={(e) => onToggle(source, e.target.checked)}
        className="w-4 h-4 mt-0.5 rounded border-outline-variant/40 text-primary focus:ring-primary/30 bg-surface-container"
      />
      <span
        className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${isEnabled ? 'bg-emerald-400' : 'bg-outline-variant/30'}`}
        title={isEnabled ? 'Healthy' : 'Inactive'}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-on-surface group-hover:text-on-surface font-medium">
            {source.name}
          </span>
          <span className="text-[10px] text-on-surface-variant/40 font-mono truncate">
            {displayUrl}
          </span>
        </div>
        {source.description && (
          <p className="text-xs text-on-surface-variant/60 mt-0.5 line-clamp-1">
            {source.description}
          </p>
        )}
      </div>
      <span className="text-xs text-on-surface-variant/60 flex-shrink-0 mt-0.5">
        ~{source.avg_articles_week}/wk
      </span>
    </label>
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

  // Local form state
  const [isEnabled, setIsEnabled] = useState(false);
  const [scheduleHour, setScheduleHour] = useState('0');
  const [maxArticles, setMaxArticles] = useState('5');
  const [aiModel, setAiModel] = useState('gemini-3-flash-preview');
  const [isSaving, setIsSaving] = useState(false);

  // Sync from loaded settings
  useEffect(() => {
    if (settings) {
      setIsEnabled(settings.is_enabled);
      setScheduleHour(String(settings.schedule_hour_utc));
      setMaxArticles(String(settings.max_articles_per_day));
      setAiModel(settings.ai_model);
    }
  }, [settings]);

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

  // Pipeline stats — real data from threat_intel_reports (last 30 days)
  const [digestedCount, setDigestedCount] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [avgCoverage, setAvgCoverage] = useState(0);

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

      if (error || !data) return;

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
    };

    fetchStats();
  }, [userId]);

  const grouped = groupByCategory(curatedSources);

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
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
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

      {/* ================================================================== */}
      {/* Section 1: Configuration */}
      {/* ================================================================== */}
      <section className="rounded-2xl bg-surface-container border border-outline-variant/10 p-6 space-y-5">
        <h2 className="text-base font-semibold text-on-surface">Auto-Digest Configuration</h2>

        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-on-surface">Enable Auto-Digest</p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Automatically fetch, classify, and digest vendor reports on a schedule
            </p>
          </div>
          <button
            onClick={() => {
              const newValue = !isEnabled;
              setIsEnabled(newValue);
              saveSettings({ is_enabled: newValue });
            }}
            className={`
              relative inline-flex h-7 w-12 items-center rounded-full transition-colors
              ${isEnabled ? 'bg-primary' : 'bg-outline-variant/30'}
            `}
            role="switch"
            aria-checked={isEnabled}
          >
            <span
              className={`
                inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform
                ${isEnabled ? 'translate-x-6' : 'translate-x-1'}
              `}
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

        {/* Save */}
        <div className="flex justify-end">
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
      </section>

      {/* ================================================================== */}
      {/* Section 2: Vendor Sources */}
      {/* ================================================================== */}
      <section className="rounded-2xl bg-surface-container border border-outline-variant/10 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-on-surface">Vendor Sources</h2>
          <Button color="secondary" variant="outlined" size="sm" leadingIcon="plus" disabled title="Custom feeds — coming in a future update">
            Add Custom Feed
          </Button>
        </div>

        {CATEGORY_ORDER.map((cat) => {
          const sources = grouped[cat];
          if (!sources || sources.length === 0) return null;
          return (
            <div key={cat} className="space-y-1">
              <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider px-1 mb-2">
                {CATEGORY_LABELS[cat] ?? cat}
              </h3>
              <div className="space-y-0.5">
                {sources.map((source) => (
                  <SourceRow
                    key={source.id}
                    source={source}
                    isEnabled={enabledSourceIds.has(source.id)}
                    onToggle={toggleSource}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {curatedSources.length === 0 && (
          <p className="text-sm text-on-surface-variant text-center py-6">
            No curated sources available. Run the database seed to populate sources.
          </p>
        )}
      </section>

      {/* ================================================================== */}
      {/* Section 3: Pipeline Stats (last 30 days) */}
      {/* ================================================================== */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-on-surface">Pipeline Stats (last 30 days)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Digested reports" value={digestedCount} icon="file-text" />
          <StatCard label="Reports reviewed" value={reviewedCount} icon="check-circle" />
          <StatCard label="Avg coverage" value={`${avgCoverage}%`} icon="bar-chart" />
        </div>
      </section>

      {/* ================================================================== */}
      {/* Section 4: Feed Activity Log */}
      {/* ================================================================== */}
      {userId && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-on-surface">Feed Activity Log</h2>
          <FeedActivityLog userId={userId} />
        </section>
      )}
    </div>
  );
};

export default AutoDigestSettingsPage;
