import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Toggle } from '../ui/Toggle';
import { ModelSelector } from '../ModelSelector';
import { useAutoDigestSettings, CuratedFeedSource } from '../../hooks/useAutoDigestSettings';
import { FeedActivityLog } from '../threatintel/FeedActivityLog';
import { useAppData } from '../../router/AppDataContext';
import { supabase } from '../../lib/supabaseClient';

// =============================================================================
// TYPES & CONSTANTS
// =============================================================================

interface AutoDigestSettingsPageProps {
  onBack?: () => void;
}

type TabId = 'sources' | 'configuration' | 'activity';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'sources', label: 'Sources', icon: 'globe' },
  { id: 'configuration', label: 'Configuration', icon: 'settings' },
  { id: 'activity', label: 'Activity', icon: 'trending-up' },
];

const SCHEDULE_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `${String(i).padStart(2, '0')}:00 UTC`,
}));

const MAX_ARTICLES_OPTIONS = Array.from({ length: 10 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));


const CATEGORY_LABELS: Record<string, string> = {
  threat_research: 'Threat Research',
  government: 'Government & Advisory',
  community: 'Community',
};

const CATEGORY_ORDER = ['threat_research', 'government', 'community'];

// =============================================================================
// FAVICON HELPER
// =============================================================================

function getFaviconUrl(feedUrl: string): string {
  try {
    const domain = new URL(feedUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return '';
  }
}

function getDomain(feedUrl: string): string {
  try {
    return new URL(feedUrl).hostname.replace('www.', '');
  } catch {
    return feedUrl;
  }
}

// =============================================================================
// SOURCE ROW
// =============================================================================

const SourceRow: React.FC<{
  source: CuratedFeedSource;
  isEnabled: boolean;
  onToggle: () => void;
  index: number;
}> = ({ source, isEnabled, onToggle, index }) => {
  const faviconUrl = getFaviconUrl(source.url);
  const domain = getDomain(source.url);

  return (
    <tr
      onClick={onToggle}
      className={`cursor-pointer border-b border-outline-variant/50 transition-colors group
        ${isEnabled ? 'bg-primary/[0.05]' : 'hover:bg-surface-container-highest/50'}`}
      title={source.description || undefined}
    >
      <td className="py-3 pl-5 pr-3 w-12">
        <div className="w-7 h-7 rounded-lg overflow-hidden bg-surface-container-highest flex items-center justify-center">
          {faviconUrl ? (
            <img src={faviconUrl} alt="" className="w-4 h-4" loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <Icon name="globe" className="w-3.5 h-3.5 text-on-surface-variant/50" />
          )}
        </div>
      </td>
      <td className="py-3 pr-4">
        <span className={`text-sm font-medium transition-colors ${
          isEnabled ? 'text-on-surface' : 'text-on-surface-variant group-hover:text-on-surface'
        }`}>{source.name}</span>
      </td>
      <td className="py-3 pr-4">
        <span className="text-xs text-on-surface-variant/50 font-mono">{domain}</span>
      </td>
      <td className="py-3 pr-4 text-right">
        <span className="text-[11px] text-on-surface-variant/40 tabular-nums">~{source.avg_articles_week}/wk</span>
      </td>
      <td className="py-3 pr-5 w-16 text-center">
        <div className={`relative inline-block w-10 h-[22px] rounded-full transition-colors text-left align-middle ${
          isEnabled ? 'bg-primary' : 'bg-outline-variant'
        }`} role="switch" aria-checked={isEnabled}>
          <span className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${
            isEnabled ? 'translate-x-[18px]' : 'translate-x-0'
          }`} />
        </div>
      </td>
    </tr>
  );
};

// =============================================================================
// STAT CARD (compact)
// =============================================================================

const StatCard: React.FC<{ label: string; value: string | number; icon: string }> = ({ label, value, icon }) => (
  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/10">
    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
      <Icon name={icon} className="w-4 h-4 text-primary" />
    </div>
    <div>
      <div className="text-lg font-bold text-on-surface tabular-nums">{value}</div>
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">{label}</div>
    </div>
  </div>
);

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

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>('sources');

  // Local config state (for dirty tracking)
  const [localConfig, setLocalConfig] = useState({
    is_enabled: false,
    schedule_hour_utc: 6,
    max_articles_per_day: 3,
    classification_model: 'gemini-3-flash-preview',
    digest_model: 'gemini-3-flash-preview',
  });

  // Track which sources are locally toggled (dirty state)
  const [pendingToggles, setPendingToggles] = useState<Map<string, boolean>>(new Map());

  // Config dirty tracking
  const [configDirty, setConfigDirty] = useState(false);

  // Sync from loaded settings
  useEffect(() => {
    if (settings) {
      setLocalConfig({
        is_enabled: settings.is_enabled,
        schedule_hour_utc: settings.schedule_hour_utc,
        max_articles_per_day: settings.max_articles_per_day,
        classification_model: settings.classification_model || settings.ai_model || 'gemini-3-flash-preview',
        digest_model: settings.digest_model || settings.ai_model || 'gemini-3-flash-preview',
      });
      setConfigDirty(false);
    }
  }, [settings]);

  // Effective enabled set (DB state + pending toggles)
  const effectiveEnabled = useMemo(() => {
    const set = new Set(enabledSourceIds);
    pendingToggles.forEach((enabled, id) => {
      if (enabled) set.add(id);
      else set.delete(id);
    });
    return set;
  }, [enabledSourceIds, pendingToggles]);

  const hasUnsavedChanges = pendingToggles.size > 0 || configDirty;
  const changeCount = pendingToggles.size + (configDirty ? 1 : 0);

  // Handle source toggle (local only, not persisted until Save)
  const handleToggleSource = useCallback((source: CuratedFeedSource) => {
    const currentlyEnabled = effectiveEnabled.has(source.id);
    setPendingToggles(prev => {
      const next = new Map(prev);
      const dbState = enabledSourceIds.has(source.id);
      if (currentlyEnabled === dbState) {
        // Toggling away from DB state — add to pending
        next.set(source.id, !currentlyEnabled);
      } else {
        // Toggling back to DB state — remove from pending
        next.delete(source.id);
      }
      return next;
    });
  }, [effectiveEnabled, enabledSourceIds]);

  // Handle config change
  const updateConfig = useCallback((key: string, value: any) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
    setConfigDirty(true);
  }, []);

  // Save all changes
  const [isSaving, setIsSaving] = useState(false);
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      // Save config if dirty
      if (configDirty) {
        await saveSettings(localConfig);
      }
      // Apply pending source toggles
      for (const [sourceId, enabled] of pendingToggles) {
        const source = curatedSources.find(s => s.id === sourceId);
        if (source) await toggleSource(source, enabled);
      }
      setPendingToggles(new Map());
      setConfigDirty(false);
    } finally {
      setIsSaving(false);
    }
  }, [configDirty, localConfig, pendingToggles, curatedSources, saveSettings, toggleSource]);

  // Discard changes
  const handleDiscard = useCallback(() => {
    setPendingToggles(new Map());
    if (settings) {
      setLocalConfig({
        is_enabled: settings.is_enabled,
        schedule_hour_utc: settings.schedule_hour_utc,
        max_articles_per_day: settings.max_articles_per_day,
        classification_model: settings.classification_model || settings.ai_model || 'gemini-3-flash-preview',
        digest_model: settings.digest_model || settings.ai_model || 'gemini-3-flash-preview',
      });
    }
    setConfigDirty(false);
  }, [settings]);

  // Group sources by category
  const grouped = useMemo(() => {
    const groups: Record<string, CuratedFeedSource[]> = {};
    for (const source of curatedSources) {
      const cat = source.category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(source);
    }
    return groups;
  }, [curatedSources]);

  // Pipeline stats
  const [stats, setStats] = useState({ digested: 0, reviewed: 0, avgCoverage: 0 });
  useEffect(() => {
    if (!userId) return;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from('threat_intel_reports')
      .select('id, coverage_percent, review_status')
      .eq('source', 'auto')
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo)
      .then(({ data }) => {
        if (!data) return;
        const withCov = data.filter(r => r.coverage_percent != null);
        setStats({
          digested: data.length,
          reviewed: data.filter(r => r.review_status !== 'pending').length,
          avgCoverage: withCov.length > 0
            ? Math.round(withCov.reduce((s, r) => s + (r.coverage_percent ?? 0), 0) / withCov.length)
            : 0,
        });
      });
  }, [userId]);

  // ─────────────────────────────────────────────────────────────
  // LOADING
  // ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 py-4 animate-page-enter">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-on-surface">Auto-Digest Pipeline</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">Automatic threat intelligence ingestion and analysis</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-on-surface-variant">{localConfig.is_enabled ? 'Active' : 'Paused'}</span>
          <Toggle
            size="md"
            checked={localConfig.is_enabled}
            onChange={() => updateConfig('is_enabled', !localConfig.is_enabled)}
            aria-label={localConfig.is_enabled ? 'Pause auto-digest pipeline' : 'Activate auto-digest pipeline'}
          />
        </div>
      </div>

      {/* ───── Underline Tabs ───── */}
      <div className="flex items-center gap-6 border-b border-outline-variant/15 mb-6">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 pb-2.5 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-on-surface'
                : 'text-on-surface-variant/60 hover:text-on-surface-variant'
            }`}
          >
            <Icon name={tab.icon} className="w-3.5 h-3.5" />
            {tab.label}
            {tab.id === 'sources' && effectiveEnabled.size > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold tabular-nums">
                {effectiveEnabled.size}
              </span>
            )}
            {/* Active indicator */}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: SOURCES                                           */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === 'sources' && (
        <div className="space-y-4">
          {/* Counter bar */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-on-surface-variant">
              <span className="font-bold text-on-surface tabular-nums">{effectiveEnabled.size}</span>
              {' '}of {curatedSources.length} sources enabled
            </span>
          </div>

          {/* Source table */}
          <div className="rounded-xl border border-outline-variant overflow-hidden shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-container-high text-left">
                  <th className="py-2.5 pl-5 pr-3 w-12" />
                  <th className="py-2.5 pr-4 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">Source</th>
                  <th className="py-2.5 pr-4 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">Domain</th>
                  <th className="py-2.5 pr-4 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider text-right">Frequency</th>
                  <th className="py-2.5 pr-5 w-16 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider text-center">Active</th>
                </tr>
              </thead>
              {CATEGORY_ORDER.map(cat => {
                const sources = grouped[cat];
                if (!sources?.length) return null;
                return (
                  <tbody key={cat}>
                    <tr className="bg-surface-container">
                      <td colSpan={5} className="px-5 py-1.5 border-y border-outline-variant/50">
                        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                          {CATEGORY_LABELS[cat] ?? cat}
                        </span>
                      </td>
                    </tr>
                    {sources.map((source, i) => (
                      <SourceRow
                        key={source.id}
                        source={source}
                        isEnabled={effectiveEnabled.has(source.id)}
                        onToggle={() => handleToggleSource(source)}
                        index={i}
                      />
                    ))}
                  </tbody>
                );
              })}
            </table>

            {curatedSources.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Icon name="globe" className="w-8 h-8 text-on-surface-variant/20 mb-3" />
                <p className="text-sm text-on-surface-variant/40">No sources available</p>
                <p className="text-xs text-on-surface-variant/25 mt-1">Run the database migration to populate curated sources</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: CONFIGURATION                                     */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === 'configuration' && (
        <div className="space-y-6">
          {/* Pipeline settings */}
          <div className="rounded-xl border border-outline-variant/10">
            <div className="px-5 py-3 border-b border-outline-variant/10 bg-surface-container-high/20">
              <h3 className="text-sm font-semibold text-on-surface">Pipeline Settings</h3>
              <p className="text-xs text-on-surface-variant/60 mt-0.5">
                Controls when and how articles are fetched and processed
              </p>
            </div>
            <div className="p-5 space-y-5">
              {/* Schedule & Limits */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Schedule (UTC)"
                  options={SCHEDULE_OPTIONS}
                  value={String(localConfig.schedule_hour_utc)}
                  onChange={(v) => updateConfig('schedule_hour_utc', Number(v))}
                  size="sm"
                />
                <Select
                  label="Max articles / day"
                  options={MAX_ARTICLES_OPTIONS}
                  value={String(localConfig.max_articles_per_day)}
                  onChange={(v) => updateConfig('max_articles_per_day', Number(v))}
                  size="sm"
                />
              </div>

              {/* Model Selection */}
              <div className="pt-4 border-t border-outline-variant/10 space-y-4">
                <div>
                  <p className="text-xs font-bold text-on-surface-variant/50 uppercase tracking-widest mb-3">AI Models</p>
                </div>

                {/* Classification Model */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-on-surface">Classification Gate</p>
                    <p className="text-xs text-on-surface-variant/60 mt-0.5">
                      Filters noise — reads RSS titles to skip marketing, events, product announcements. Should be fast and cheap.
                    </p>
                  </div>
                  <ModelSelector
                    selectedModelId={localConfig.classification_model}
                    onModelChange={(v) => updateConfig('classification_model', v)}
                    requireCapabilities={{ json: true }}
                  />
                </div>

                {/* Digest Model */}
                <div className="flex items-center justify-between pt-4 border-t border-outline-variant/[0.06]">
                  <div>
                    <p className="text-sm font-medium text-on-surface">Full Digest Analysis</p>
                    <p className="text-xs text-on-surface-variant/60 mt-0.5">
                      Extracts TTPs, rules, IoCs, and MITRE mapping from full articles. Should be capable.
                    </p>
                  </div>
                  <ModelSelector
                    selectedModelId={localConfig.digest_model}
                    onModelChange={(v) => updateConfig('digest_model', v)}
                    requireCapabilities={{ json: true }}
                  />
                </div>
              </div>

              {/* Pipeline features */}
              <div className="pt-4 border-t border-outline-variant/10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-on-surface">Environment Relevance</p>
                    <p className="text-xs text-on-surface-variant/60 mt-0.5">
                      Scores articles by relevance to your industry, platforms, and log sources
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-primary/10 text-primary font-bold uppercase tracking-wider">
                    Auto
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: ACTIVITY                                          */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === 'activity' && (
        <div className="space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Digested (30d)" value={stats.digested} icon="file-text" />
            <StatCard label="Reviewed" value={stats.reviewed} icon="check-circle" />
            <StatCard label="Avg Coverage" value={`${stats.avgCoverage}%`} icon="chart-bar" />
          </div>

          {/* Activity log */}
          {userId ? (
            <FeedActivityLog userId={userId} />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Icon name="activity" className="w-8 h-8 text-on-surface-variant/20 mb-3" />
              <p className="text-sm text-on-surface-variant/40">No activity yet</p>
              <p className="text-xs text-on-surface-variant/25 mt-1">
                Enable auto-digest and select sources to get started
              </p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* FLOATING SAVE BAR                                      */}
      {/* ═══════════════════════════════════════════════════════ */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-page-enter">
          <div className="flex items-center gap-4 px-5 py-3 rounded-2xl bg-surface-container-highest border border-outline-variant/20 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            <span className="text-sm text-on-surface">
              <span className="font-bold tabular-nums">{changeCount}</span>
              {' '}unsaved change{changeCount !== 1 ? 's' : ''}
            </span>
            <button
              onClick={handleDiscard}
              className="text-xs text-on-surface-variant hover:text-on-surface transition-colors px-3 py-1.5 rounded-lg hover:bg-surface-container-high"
            >
              Discard
            </button>
            <Button
              color="primary"
              size="sm"
              loading={isSaving}
              onClick={handleSave}
            >
              Save Changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutoDigestSettingsPage;
