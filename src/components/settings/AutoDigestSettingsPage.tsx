import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Toggle } from '../ui/Toggle';
import { ModelSelector } from '../ModelSelector';
import { useAutoDigestSettings, CuratedFeedSource, FeedHealth, CustomFeed } from '../../hooks/useAutoDigestSettings';
import { FeedActivityLog } from '../threatintel/FeedActivityLog';
import { useAppData } from '../../router/AppDataContext';

// =============================================================================
// TYPES & CONSTANTS
// =============================================================================

interface AutoDigestSettingsPageProps {
  onBack?: () => void;
}

type TabId = 'activity' | 'sources' | 'configuration';

// Activity is intentionally first — established users land here to check
// "did the last run work?" far more often than they tweak Sources or Config.
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'activity', label: 'Activity', icon: 'trending-up' },
  { id: 'sources', label: 'Sources', icon: 'globe' },
  { id: 'configuration', label: 'Configuration', icon: 'settings' },
];

const VALID_TAB_IDS: TabId[] = ['activity', 'sources', 'configuration'];

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

// Compact relative-time formatter for the Sources health column. We don't
// need full precision here — "5m ago" / "3h ago" / "2d ago" / "Apr 28" is
// enough to answer "is this feed alive?".
function formatRelativeShort(ts: string | null): string {
  if (!ts) return '—';
  const ms = Date.now() - new Date(ts).getTime();
  if (Number.isNaN(ms) || ms < 0) return '—';
  const min = Math.round(ms / 60000);
  if (min < 1)  return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24)  return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7)  return `${day}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const SourceRow: React.FC<{
  source: CuratedFeedSource;
  isEnabled: boolean;
  health: FeedHealth | undefined;
  onToggle: () => void;
  index: number;
}> = ({ source, isEnabled, health, onToggle, index }) => {
  const faviconUrl = getFaviconUrl(source.url);
  const domain = getDomain(source.url);

  // Status pill state for the Health column. "—" for sources that aren't
  // enabled yet (no threat_intel_feeds row, no fetch attempts), "Failed"
  // (red) when last_error is set, "Fetched <relative>" (muted) otherwise.
  // The full last_error text lives in a tooltip so the row stays compact.
  let healthLabel: React.ReactNode = <span className="text-on-surface-variant/30">—</span>;
  let healthTitle: string | undefined;
  if (isEnabled) {
    if (health?.last_error) {
      // Only append the relative time when we actually have one — otherwise
      // "Failed · —" reads as a malformed sentence with a trailing em-dash.
      healthLabel = health.last_fetched_at
        ? <span className="text-red-400">Failed · last fetched {formatRelativeShort(health.last_fetched_at)}</span>
        : <span className="text-red-400">Failed</span>;
      healthTitle = health.last_error;
    } else if (health?.last_fetched_at) {
      healthLabel = <span className="text-on-surface-variant">Fetched {formatRelativeShort(health.last_fetched_at)}</span>;
    } else {
      healthLabel = <span className="text-on-surface-variant/50">Awaiting first fetch</span>;
    }
  }

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
      <td className="py-3 pr-4">
        <span className="text-[11px] tabular-nums" title={healthTitle}>{healthLabel}</span>
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
// CUSTOM SOURCE ROW (user-added feed)
// =============================================================================

const CustomSourceRow: React.FC<{
  feed: CustomFeed;
  onToggle: () => void;
  onRemove: () => void;
}> = ({ feed, onToggle, onRemove }) => {
  const domain = getDomain(feed.url);

  // Same health-pill rules as curated rows: red if last_error, otherwise
  // a relative timestamp, otherwise "Awaiting first fetch".
  let healthLabel: React.ReactNode = <span className="text-on-surface-variant/40">Awaiting first fetch</span>;
  let healthTitle: string | undefined;
  if (feed.is_enabled) {
    if (feed.last_error) {
      healthLabel = feed.last_fetched_at
        ? <span className="text-red-400">Failed · last fetched {formatRelativeShort(feed.last_fetched_at)}</span>
        : <span className="text-red-400">Failed</span>;
      healthTitle = feed.last_error;
    } else if (feed.last_fetched_at) {
      healthLabel = <span className="text-on-surface-variant">Fetched {formatRelativeShort(feed.last_fetched_at)}</span>;
    }
  } else {
    healthLabel = <span className="text-on-surface-variant/30">—</span>;
  }

  return (
    <tr className={`border-b border-outline-variant/50 transition-colors group ${
      feed.is_enabled ? 'bg-primary/[0.05]' : 'hover:bg-surface-container-highest/50'
    }`}>
      <td className="py-3 pl-5 pr-3 w-12">
        <div className="w-7 h-7 rounded-lg overflow-hidden bg-surface-container-highest flex items-center justify-center">
          <Icon name="rss" className="w-3.5 h-3.5 text-on-surface-variant/50" />
        </div>
      </td>
      <td className="py-3 pr-4">
        <span className={`text-sm font-medium ${feed.is_enabled ? 'text-on-surface' : 'text-on-surface-variant'}`}>
          {feed.name}
        </span>
      </td>
      <td className="py-3 pr-4">
        <span className="text-xs text-on-surface-variant/50 font-mono">{domain}</span>
      </td>
      <td className="py-3 pr-4">
        <span className="text-[11px] tabular-nums" title={healthTitle}>{healthLabel}</span>
      </td>
      <td className="py-3 pr-4 text-right">
        <button
          type="button"
          onClick={onRemove}
          className="text-[11px] text-on-surface-variant/40 hover:text-red-400 transition-colors"
          title="Remove this source"
        >
          Remove
        </button>
      </td>
      <td className="py-3 pr-5 w-16 text-center">
        <button
          type="button"
          onClick={onToggle}
          className={`relative inline-block w-10 h-[22px] rounded-full transition-colors text-left align-middle ${
            feed.is_enabled ? 'bg-primary' : 'bg-outline-variant'
          }`}
          role="switch"
          aria-checked={feed.is_enabled}
        >
          <span className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${
            feed.is_enabled ? 'translate-x-[18px]' : 'translate-x-0'
          }`} />
        </button>
      </td>
    </tr>
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
    feedHealth,
    customFeeds,
    recentJobs,
    isLoading,
    saveSettings,
    toggleSource,
    addCustomFeed,
    removeCustomFeed,
    toggleCustomFeed,
    triggerManualRun,
  } = useAutoDigestSettings(userId);

  // Add Custom Source modal state
  const [addCustomOpen, setAddCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customSubmitting, setCustomSubmitting] = useState(false);
  const handleAddCustom = useCallback(async () => {
    if (customSubmitting) return;
    setCustomSubmitting(true);
    const ok = await addCustomFeed({ name: customName, url: customUrl, feedType: 'rss' });
    setCustomSubmitting(false);
    if (ok) {
      setCustomName('');
      setCustomUrl('');
      setAddCustomOpen(false);
    }
  }, [addCustomFeed, customName, customUrl, customSubmitting]);

  // Tab state lives in the URL (?tab=...) so refresh, browser back/forward,
  // and external deep-links all behave naturally. Default tab is Activity —
  // most repeat visits are "did the last run work?", not "let me reconfigure".
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabId | null;
  const activeTab: TabId = tabFromUrl && VALID_TAB_IDS.includes(tabFromUrl) ? tabFromUrl : 'activity';
  const setActiveTab = useCallback((tab: TabId) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    }, { replace: false });
  }, [setSearchParams]);

  // Local config state (for dirty tracking)
  const [localConfig, setLocalConfig] = useState({
    is_enabled: false,
    schedule_hour_utc: 6,
    max_articles_per_day: 3,
    classification_model: 'gemini-3-flash-preview',
    digest_model: 'gemini-3-flash-preview',
  });

  // Manual run state
  const [isRunning, setIsRunning] = useState(false);
  const isJobActive = recentJobs.some(j => j.status === 'pending' || j.status === 'processing');

  const handleRunNow = useCallback(async () => {
    setIsRunning(true);
    try {
      await triggerManualRun();
    } finally {
      setIsRunning(false);
    }
  }, [triggerManualRun]);

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

  // Track save inflight up here so handleToggleSource can ignore clicks
  // while a save is in progress. Without this guard, a user rapid-clicking
  // a feed row while Save is mid-flight could desync the optimistic
  // pendingToggles state from what the DB ends up with — possibly leading
  // to duplicate threat_intel_feeds rows.
  const [isSaving, setIsSaving] = useState(false);

  // Handle source toggle (local only, not persisted until Save)
  const handleToggleSource = useCallback((source: CuratedFeedSource) => {
    if (isSaving) return; // ignore clicks while a save is committing
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
  }, [effectiveEnabled, enabledSourceIds, isSaving]);

  // Handle config change
  const updateConfig = useCallback((key: string, value: any) => {
    if (isSaving) return;
    setLocalConfig(prev => ({ ...prev, [key]: value }));
    setConfigDirty(true);
  }, [isSaving]);

  // Save all changes
  const handleSave = useCallback(async () => {
    if (isSaving) return; // re-entrancy guard — Save button shouldn't fire twice
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
  }, [isSaving, configDirty, localConfig, pendingToggles, curatedSources, saveSettings, toggleSource]);

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

  // Header status-line computations. Must live above the `if (isLoading)`
  // early-return so the hook count is stable across renders (Rules of Hooks).
  const lastRun = recentJobs[0];
  const nextScheduledLabel = useMemo(() => {
    if (!localConfig.is_enabled) return 'Auto-run paused';
    const hour = localConfig.schedule_hour_utc;
    return `Next auto-run ${String(hour).padStart(2, '0')}:00 UTC`;
  }, [localConfig.is_enabled, localConfig.schedule_hour_utc]);

  const lastRunLabel = useMemo(() => {
    if (!lastRun) return 'No runs yet — click Run Now to start one';
    const summary = lastRun.result_summary as Record<string, any> | null;
    const errors: string[] = Array.isArray(summary?.errors) ? summary!.errors : [];
    const digested = summary?.digested ?? summary?.articles_digested ?? 0;
    const time = new Date(lastRun.started_at || lastRun.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (lastRun.status === 'pending' || lastRun.status === 'processing') return `Running since ${time}`;
    if (lastRun.status === 'failed') return `Last run ${time} — failed`;
    const errorPart = errors.length > 0 ? ` · ${errors.length} error${errors.length === 1 ? '' : 's'}` : '';
    return `Last run ${time} · ${digested} digested${errorPart}`;
  }, [lastRun]);

  // Last-run tone for the prominent status pill in the header. Mirrors
  // the FeedActivityLog tone math so a user sees the same color signal
  // here that they'd see if they scrolled to the matching job card.
  // Hook must live above the early-return below (Rules of Hooks).
  const lastRunTone: 'success' | 'partial' | 'failure' | 'running' | 'pending' | 'idle' = useMemo(() => {
    if (!lastRun) return 'idle';
    const summary = lastRun.result_summary as Record<string, any> | null;
    const errors: string[] = Array.isArray(summary?.errors) ? summary!.errors : [];
    const digested = summary?.digested ?? summary?.articles_digested ?? 0;
    if (lastRun.status === 'pending') return 'pending';
    if (lastRun.status === 'processing') return 'running';
    if (lastRun.status === 'failed') return 'failure';
    if (digested > 0 && errors.length === 0) return 'success';
    if (errors.length > 0) return 'partial';
    return 'success';
  }, [lastRun]);

  // ─────────────────────────────────────────────────────────────
  // LOADING (after all hooks — Rules of Hooks)
  // ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-4 animate-page-enter">
      {/* Page header — name + run controls on row 1, status pill on row 2.
          The first version put the entire status line in faint subtitle text
          which made the most-important "what just happened" info nearly
          invisible. Promoting it to its own row at the same vertical
          weight as the title fixes that. */}
      <div className="flex items-start justify-between mb-3 gap-4 flex-wrap">
        <h2 className="text-lg font-bold text-on-surface">Auto-Digest</h2>
        <div className="flex items-center gap-3 shrink-0">
          <Button
            size="sm"
            color="secondary"
            leadingIcon="play"
            loading={isRunning || isJobActive}
            onClick={handleRunNow}
            title={isJobActive ? 'A digest job is already in progress' : 'Run the pipeline now instead of waiting for the next scheduled slot'}
          >
            {isJobActive ? 'Running…' : 'Run Now'}
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-on-surface-variant whitespace-nowrap">
              Auto-run: <span className={localConfig.is_enabled ? 'text-emerald-500 font-medium' : 'text-on-surface-variant/70 font-medium'}>{localConfig.is_enabled ? 'ON' : 'OFF'}</span>
            </span>
            <Toggle
              size="md"
              checked={localConfig.is_enabled}
              onChange={() => updateConfig('is_enabled', !localConfig.is_enabled)}
              aria-label={localConfig.is_enabled ? 'Disable auto-digest schedule' : 'Enable auto-digest schedule'}
            />
          </div>
        </div>
      </div>

      {/* Status pill row — the page's primary signal. The dot color matches
          the last-run job-card tone so this reads as a one-line summary of
          "what's the pipeline's state right now". */}
      <div className="mb-6 flex items-center gap-3 flex-wrap text-sm">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-low border border-outline-variant/30">
          <span className={`w-2 h-2 rounded-full shrink-0 ${
            lastRunTone === 'success' ? 'bg-emerald-500'
            : lastRunTone === 'partial' ? 'bg-amber-400'
            : lastRunTone === 'failure' ? 'bg-red-400'
            : lastRunTone === 'running' ? 'bg-amber-400 animate-pulse'
            : 'bg-on-surface-variant/40'
          }`} />
          <span className="text-on-surface font-medium">{lastRunLabel}</span>
        </span>
        <span className="text-on-surface-variant text-xs">{nextScheduledLabel}</span>
      </div>

      {/* Segmented tab strip. The previous underline-only tabs read as
          loose floating text on the page canvas — you couldn't tell they
          were tabs until clicking. This is a proper M3-style segmented
          control with an enclosing container, hover state, and a clearly
          "raised" active button using the surface token a level above
          the strip background. */}
      <div className="inline-flex items-center bg-surface-container-low rounded-xl p-1 mb-5 border border-outline-variant/15 gap-1">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-surface-container-highest text-on-surface shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <Icon name={tab.icon} className="w-3.5 h-3.5" />
              {tab.label}
              {/* Sources badge: enabled/total to match the body counter
                  ("12/13"). Slightly more prominent in the active tab. */}
              {tab.id === 'sources' && curatedSources.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold tabular-nums ${
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'bg-on-surface-variant/10 text-on-surface-variant'
                }`}>
                  {effectiveEnabled.size}/{curatedSources.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: SOURCES                                           */}
      {/* ═══════════════════════════════════════════════════════ */}
      {/* Wrapped in the same canonical container shape used by Activity
          (FeedActivityLog) and Configuration. Was a bare table on the
          page background which read as a different visual language than
          the other two tabs. */}
      {activeTab === 'sources' && (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
          {/* Header bar — matches the "Activity Log" header in
              FeedActivityLog and the "Pipeline Settings" header in
              Configuration. Now includes an Add Custom Source button so
              the page stops looking like a walled garden. */}
          <div className="px-6 pt-5 pb-3 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-base font-semibold text-on-surface">Sources</h3>
              <p className="text-xs text-on-surface-variant/70 mt-0.5">
                <span className="font-medium text-on-surface tabular-nums">{effectiveEnabled.size}</span>
                {' '}of {curatedSources.length} curated enabled
                {customFeeds.length > 0 && (
                  <>
                    {' · '}
                    <span className="font-medium text-on-surface tabular-nums">{customFeeds.length}</span>
                    {' '}custom
                  </>
                )}
              </p>
            </div>
            <Button
              size="sm"
              color="secondary"
              leadingIcon="plus"
              onClick={() => setAddCustomOpen(true)}
            >
              Add Custom Source
            </Button>
          </div>

          {/* Source table — now lives inside the page-level container so
              it doesn't have its own competing border/shadow. */}
          <div className="border-t border-outline-variant/15">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-container-high/50 text-left">
                  <th className="py-2.5 pl-5 pr-3 w-12" />
                  <th className="py-2.5 pr-4 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">Source</th>
                  <th className="py-2.5 pr-4 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">Domain</th>
                  <th className="py-2.5 pr-4 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">Health</th>
                  <th className="py-2.5 pr-4 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider text-right">Frequency</th>
                  <th className="py-2.5 pr-5 w-16 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider text-center">Active</th>
                </tr>
              </thead>
              {/* Category rendering: when a category has only 1 source we
                  fold it into the previous block (no orphan section
                  heading), so "Government & Advisory" with one row no
                  longer looks like a half-finished section. Headings only
                  render for categories with 2+ rows. */}
              {CATEGORY_ORDER.map((cat) => {
                const sources = grouped[cat];
                if (!sources?.length) return null;
                const showHeading = sources.length >= 2;
                return (
                  <tbody key={cat}>
                    {showHeading && (
                      <tr className="bg-surface-container">
                        <td colSpan={6} className="px-5 py-1.5 border-y border-outline-variant/50">
                          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                            {CATEGORY_LABELS[cat] ?? cat}
                          </span>
                        </td>
                      </tr>
                    )}
                    {sources.map((source, i) => (
                      <SourceRow
                        key={source.id}
                        source={source}
                        isEnabled={effectiveEnabled.has(source.id)}
                        health={feedHealth.get(source.id)}
                        onToggle={() => handleToggleSource(source)}
                        index={i}
                      />
                    ))}
                  </tbody>
                );
              })}
              {/* Custom (user-added) feeds. Same table, separate tbody +
                  category heading so visually they read as a distinct
                  collection. Toggle here flips is_enabled directly (no
                  "save changes" buffering — user-added feeds are simpler:
                  any change is committed immediately). The trash icon
                  removes the row entirely. */}
              {customFeeds.length > 0 && (
                <tbody>
                  <tr className="bg-surface-container">
                    <td colSpan={6} className="px-5 py-1.5 border-y border-outline-variant/50">
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                        Custom Sources
                      </span>
                    </td>
                  </tr>
                  {customFeeds.map((feed) => (
                    <CustomSourceRow
                      key={feed.id}
                      feed={feed}
                      onToggle={() => toggleCustomFeed(feed.id, !feed.is_enabled)}
                      onRemove={() => {
                        if (window.confirm(`Remove "${feed.name}" from your sources?`)) {
                          removeCustomFeed(feed.id);
                        }
                      }}
                    />
                  ))}
                </tbody>
              )}
            </table>

            {curatedSources.length === 0 && customFeeds.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Icon name="globe" className="w-8 h-8 text-on-surface-variant/20 mb-3" />
                <p className="text-sm text-on-surface-variant/40">No sources available</p>
                <p className="text-xs text-on-surface-variant/25 mt-1">Add a custom source above, or run the curated-sources migration</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Custom Source modal — minimalist inline modal so we don't
          drag in another dependency for a one-shot dialog. Validates
          inside the hook (URL parse, http/https only). */}
      {addCustomOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => !customSubmitting && setAddCustomOpen(false)}
        >
          <div
            className="bg-surface-container rounded-2xl border border-outline-variant/20 max-w-md w-full p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-on-surface mb-1">Add Custom Source</h3>
            <p className="text-xs text-on-surface-variant mb-5">
              Add an RSS or Atom feed that isn't on the curated list. The orchestrator
              will harvest it on the same schedule as your other sources.
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5 block">
                  Source name
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Internal Threat Intel Blog"
                  className="w-full px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/30 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary"
                  disabled={customSubmitting}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5 block">
                  Feed URL
                </label>
                <input
                  type="url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://example.com/feed.xml"
                  className="w-full px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/30 text-sm text-on-surface placeholder:text-on-surface-variant/40 font-mono focus:outline-none focus:border-primary"
                  disabled={customSubmitting}
                />
                <p className="text-[11px] text-on-surface-variant/60 mt-1.5">
                  RSS or Atom XML feed. Must be http:// or https://.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setAddCustomOpen(false)}
                disabled={customSubmitting}
                className="px-4 py-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors rounded-lg disabled:opacity-50"
              >
                Cancel
              </button>
              <Button
                size="sm"
                color="primary"
                onClick={handleAddCustom}
                loading={customSubmitting}
              >
                Add Source
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: CONFIGURATION                                     */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === 'configuration' && (
        // Two panels in series, both using the canonical
        // bg-surface-container rounded-2xl shape that Activity Log and
        // Sources also use. Header bars are matched (px-6 pt-5 pb-3
        // text-base font-semibold) so all three tabs feel like the
        // same component family.
        <div className="space-y-4">
          {/* Pipeline settings */}
          <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
            <div className="px-6 pt-5 pb-3 border-b border-outline-variant/15">
              <h3 className="text-base font-semibold text-on-surface">Pipeline Settings</h3>
              <p className="text-xs text-on-surface-variant/70 mt-0.5">
                Controls when and how articles are fetched and processed
              </p>
            </div>
            <div className="p-6 space-y-5">
              {/* Schedule & Limits */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Select
                    label="Schedule (UTC)"
                    options={SCHEDULE_OPTIONS}
                    value={String(localConfig.schedule_hour_utc)}
                    onChange={(v) => updateConfig('schedule_hour_utc', Number(v))}
                    size="sm"
                  />
                  {/* Local-time hint. The dropdown stores UTC because the
                      cron schedule lives in UTC, but a user in PT shouldn't
                      have to mentally convert "06:00 UTC" to "11:00 PM" the
                      previous day. Compute via Intl on render. */}
                  <p className="text-[11px] text-on-surface-variant/60 mt-1.5">
                    {(() => {
                      const local = new Date();
                      local.setUTCHours(localConfig.schedule_hour_utc, 0, 0, 0);
                      const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
                      const localStr = local.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      });
                      return `${localStr} in your timezone (${tzName})`;
                    })()}
                  </p>
                </div>
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
                      Scored automatically against your{' '}
                      <Link to="/settings/environment" className="text-primary hover:underline">
                        Environment Profile
                      </Link>
                      {' '}— industry, platforms, and log sources.
                    </p>
                  </div>
                  {/* The AUTO badge is now a Link too, so users can edit
                      behavior in one click rather than reading a tooltip
                      and having to navigate manually. */}
                  <Link
                    to="/settings/environment"
                    className="text-[10px] px-2 py-1 rounded-full bg-primary/10 text-primary font-bold uppercase tracking-wider hover:bg-primary/20 transition-colors"
                    title="Edit your Environment Profile to change relevance scoring"
                  >
                    Auto · Edit
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Pipeline stats panel — replaces the dead empty space below
              the small settings group. Mirrors of the most important
              cumulative numbers so this tab feels populated and gives
              the user a quick health snapshot without bouncing to
              Activity. Counts come straight from recentJobs (last 7
              runs from the hook) so we don't pay for an extra query. */}
          {recentJobs.length > 0 && (() => {
            // Success rate counts only error-free completed runs as "clean".
            // The previous version counted any 'completed' status, which
            // gave 100% even when every run shipped with errors — useless
            // signal. Now: clean = status==='completed' AND errors.length===0.
            const totals = recentJobs.reduce(
              (acc, j) => {
                const s = j.result_summary as Record<string, any> | null;
                const errs = Array.isArray(s?.errors) ? s!.errors.length : 0;
                acc.digested += s?.digested ?? s?.articles_digested ?? 0;
                acc.skipped  += s?.skipped  ?? s?.articles_skipped  ?? 0;
                acc.errors   += errs;
                if (j.status === 'completed' && errs === 0) acc.cleanRuns += 1;
                return acc;
              },
              { digested: 0, skipped: 0, errors: 0, cleanRuns: 0 },
            );
            const successRate = recentJobs.length > 0
              ? Math.round((totals.cleanRuns / recentJobs.length) * 100)
              : 0;
            return (
              <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
                <div className="px-6 pt-5 pb-3 border-b border-outline-variant/15">
                  <h3 className="text-base font-semibold text-on-surface">Pipeline Health</h3>
                  <p className="text-xs text-on-surface-variant/70 mt-0.5">
                    Last {recentJobs.length} run{recentJobs.length === 1 ? '' : 's'} · Success rate counts error-free completions only
                  </p>
                </div>
                <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <div className="text-lg font-bold text-on-surface tabular-nums">{totals.digested}</div>
                    <div className="text-[10px] uppercase tracking-wider text-on-surface-variant/60 font-bold mt-0.5">Digested</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-on-surface-variant tabular-nums">{totals.skipped}</div>
                    <div className="text-[10px] uppercase tracking-wider text-on-surface-variant/60 font-bold mt-0.5">Not relevant</div>
                  </div>
                  <div>
                    <div className={`text-lg font-bold tabular-nums ${totals.errors > 0 ? 'text-amber-400' : 'text-on-surface-variant'}`}>{totals.errors}</div>
                    <div className="text-[10px] uppercase tracking-wider text-on-surface-variant/60 font-bold mt-0.5">Errors</div>
                  </div>
                  <div>
                    <div className={`text-lg font-bold tabular-nums ${successRate >= 80 ? 'text-emerald-500' : successRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{successRate}%</div>
                    <div className="text-[10px] uppercase tracking-wider text-on-surface-variant/60 font-bold mt-0.5">Success rate</div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: ACTIVITY                                          */}
      {/* ═══════════════════════════════════════════════════════ */}
      {/* Three big zero stat-cards (Digested 30d / Reviewed / Avg
          Coverage) used to live here. They were the worst-case empty
          state for a brand-new pipeline — three giant zeros with no
          guidance. The status line in the header above already
          surfaces "last run / next run" in one place; we don't need
          to repeat trailing-30d stats on the Activity tab. The Sources
          tab (and a future Configuration tab pipeline-stats panel)
          are the right home for cumulative numbers if/when we want
          them again. */}
      {activeTab === 'activity' && (
        <div className="space-y-4">
          {/* Bootstrap banner — shown when Auto-run is ON but the user
              has never triggered a manual run, so prompt_templates is
              still null. The orchestrator can't digest anything until
              prompts are seeded; without this banner a brand-new user
              would see scheduled cron runs land as "completed with N
              errors" with no obvious explanation. One click on Run Now
              fixes it permanently. */}
          {settings && settings.is_enabled && !settings.prompt_templates && (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 px-5 py-4 flex items-start gap-3">
              <Icon name="alert-triangle" className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-on-surface">Trigger a manual run to enable scheduled digests</p>
                <p className="text-xs text-on-surface-variant/80 mt-1 leading-relaxed">
                  Auto-run is ON but the background orchestrator hasn't received your AI prompt
                  templates yet. The next scheduled run will fail until you click <span className="font-medium text-on-surface">Run Now</span> at
                  least once — that one manual run seeds the templates so all future cron-triggered
                  runs work too.
                </p>
              </div>
              <Button
                size="sm"
                color="secondary"
                leadingIcon="play"
                loading={isRunning || isJobActive}
                onClick={handleRunNow}
                title="Trigger a digest now to seed the prompt cache"
              >
                {isJobActive ? 'Running…' : 'Run Now'}
              </Button>
            </div>
          )}

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
