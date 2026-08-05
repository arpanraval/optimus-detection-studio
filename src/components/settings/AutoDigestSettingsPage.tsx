import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Toggle } from '../ui/Toggle';
import { ModelSelector } from '../ModelSelector';
import { useAutoDigestSettings, CuratedFeedSource, FeedHealth, CustomFeed } from '../../hooks/useAutoDigestSettings';
import { FeedActivityLog, countSystemErrors, countFeedErrors } from '../threatintel/FeedActivityLog';
import { useAppData } from '../../router/AppDataContext';
import { useToast } from '../../hooks/useToast';

// =============================================================================
// TYPES & CONSTANTS
// =============================================================================

interface AutoDigestSettingsPageProps {
  onBack?: () => void;
}

type TabId = 'activity' | 'sources' | 'configuration';

// Activity is intentionally first — established users land here to check
// "did the last run work?" far more often than they tweak Sources or
// Config. Tab labels render plain text (no leading icons) — the icons
// read as toy-like for an enterprise pipeline tool and added visual
// noise without information.
const TABS: { id: TabId; label: string }[] = [
  { id: 'activity', label: 'Activity' },
  { id: 'sources', label: 'Sources' },
  { id: 'configuration', label: 'Configuration' },
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
  const date = new Date(ts);
  const ms = Date.now() - date.getTime();
  if (Number.isNaN(ms) || ms < 0) return '—';
  const min = Math.round(ms / 60000);
  if (min < 1)  return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24)  return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7)  return `${day}d ago`;
  // Include year when the date is from a previous calendar year so
  // "Apr 28" doesn't read as recent when it's actually 12 months old.
  // Same year stays compact (Apr 28); cross-year shows the year too
  // (Apr 28, 2024).
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-US', sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
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

  // Whole row is the click target. We keep the visual spacing of a TR but
  // make it keyboard-activatable: focusable via tabIndex, switchable via
  // Space/Enter, and the role moves to the row (not the visual switch
  // shape, which is decorative). Without this, screen-reader users had no
  // path to toggle a source — the only working interaction was a sighted
  // mouse click on the row.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onToggle();
    }
  };
  return (
    <tr
      onClick={onToggle}
      onKeyDown={handleKeyDown}
      role="switch"
      aria-checked={isEnabled}
      aria-label={`Toggle ${source.name} source`}
      tabIndex={0}
      className={`cursor-pointer border-b border-outline-variant/30 last:border-b-0 transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
        ${isEnabled ? '' : 'opacity-60 hover:opacity-100 hover:bg-surface-container'}`}
      title={source.description || undefined}
    >
      <td className="py-2 pl-4 pr-2 w-10">
        <div className="w-6 h-6 rounded-md overflow-hidden bg-surface-container flex items-center justify-center">
          {faviconUrl ? (
            <img src={faviconUrl} alt="" className="w-4 h-4" loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <Icon name="globe" className="w-3.5 h-3.5 text-on-surface-variant/50" />
          )}
        </div>
      </td>
      <td className="py-2 pr-3">
        <span className={`text-sm font-medium transition-colors ${
          isEnabled ? 'text-on-surface' : 'text-on-surface-variant group-hover:text-on-surface'
        }`}>{source.name}</span>
      </td>
      <td className="py-2 pr-3">
        <span className="text-xs text-on-surface-variant/60 font-mono">{domain}</span>
      </td>
      <td className="py-2 pr-3">
        <span className="text-xs tabular-nums" title={healthTitle}>{healthLabel}</span>
      </td>
      <td className="py-2 pr-3 text-right">
        <span className="text-xs text-on-surface-variant/60 tabular-nums">~{source.avg_articles_week}/wk</span>
      </td>
      <td className="py-2 pr-4 w-16 text-center">
        {/* Decorative switch shape — actual toggle behaviour lives on
            the row. aria-hidden so SR users only hear the row's switch. */}
        <div
          aria-hidden="true"
          className={`relative inline-block w-10 h-[22px] rounded-full transition-colors text-left align-middle ${
            isEnabled ? 'bg-primary' : 'bg-outline-variant'
          }`}
        >
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
    <tr className={`border-b border-outline-variant/30 last:border-b-0 transition-colors group ${
      feed.is_enabled ? '' : 'opacity-60 hover:opacity-100 hover:bg-surface-container'
    }`}>
      <td className="py-2 pl-4 pr-2 w-10">
        <div className="w-6 h-6 rounded-md overflow-hidden bg-surface-container flex items-center justify-center">
          <Icon name="rss" className="w-3.5 h-3.5 text-on-surface-variant/50" />
        </div>
      </td>
      <td className="py-2 pr-3">
        <span className={`text-sm font-medium ${feed.is_enabled ? 'text-on-surface' : 'text-on-surface-variant'}`}>
          {feed.name}
        </span>
      </td>
      <td className="py-2 pr-3">
        <span className="text-xs text-on-surface-variant/60 font-mono">{domain}</span>
      </td>
      <td className="py-2 pr-3">
        <span className="text-xs tabular-nums" title={healthTitle}>{healthLabel}</span>
      </td>
      <td className="py-2 pr-3 text-right">
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-on-surface-variant/60 hover:text-error transition-colors"
          title="Remove this source"
        >
          Remove
        </button>
      </td>
      <td className="py-2 pr-4 w-16 text-center">
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
  const { showToast } = useToast();

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
    classification_model: 'gemini-3.6-flash',
    digest_model: 'gemini-3.6-flash',
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
        classification_model: settings.classification_model || settings.ai_model || 'gemini-3.6-flash',
        digest_model: settings.digest_model || settings.ai_model || 'gemini-3.6-flash',
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

  // Save all changes. Each step (config save + per-source toggle) is
  // tracked individually so a mid-loop failure leaves the rest of the
  // pending state intact for retry. Without this, if toggleSource for
  // source #5 of 10 threw, the first 4 toggles AND the config were
  // already committed but the user-visible "Save Changes" pill stayed
  // dirty for ALL 10 — hiding which 4 already landed.
  const handleSave = useCallback(async () => {
    if (isSaving) return false;
    if (isSaving) return; // re-entrancy guard — Save button shouldn't fire twice
    setIsSaving(true);
    const failedToggleIds: string[] = [];
    let configCommitted = true;
    try {
      if (configDirty) {
        configCommitted = await saveSettings(localConfig);
        // saveSettings determines whether configuration was committed.
      } else {
        configCommitted = true;
      }
      const succeeded = new Set<string>();
      for (const [sourceId, enabled] of pendingToggles) {
        const source = curatedSources.find(s => s.id === sourceId);
        if (!source) {
          // Source disappeared from curated list mid-flight; treat as failed.
          failedToggleIds.push(sourceId);
          continue;
        }
        // toggleSource returns boolean — true on success, false on the
        // RLS/insert/update error paths (it shows its own per-source toast
        // for the failure detail). We aggregate the boolean here.
        const ok = await toggleSource(source, enabled);
        if (ok) succeeded.add(sourceId);
        else failedToggleIds.push(sourceId);
      }
      // Drop succeeded toggles from pending; keep failures so the user
      // can retry just the ones that didn't land.
      if (succeeded.size > 0) {
        setPendingToggles(prev => {
          const next = new Map(prev);
          for (const id of succeeded) next.delete(id);
          return next;
        });
      }
      if (configCommitted) setConfigDirty(false);
      if (failedToggleIds.length > 0) {
        showToast(
          'error',
          `Saved config + ${succeeded.size} source toggle${succeeded.size === 1 ? '' : 's'}; ${failedToggleIds.length} source toggle${failedToggleIds.length === 1 ? '' : 's'} failed — retry available`,
        );
      }
    } catch (e) {
      // saveSettings threw — config didn't commit. Source toggles weren't
      // attempted. Pending state intact so the user can retry the whole
      // save. Surface a clean error.
      showToast('error', e instanceof Error ? e.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
    return configCommitted && failedToggleIds.length === 0;
  }, [isSaving, configDirty, localConfig, pendingToggles, curatedSources, saveSettings, toggleSource, showToast]);

  // Discard changes
  const handleSaveAndRun = useCallback(async () => {
    if (hasUnsavedChanges) {
      const saved = await handleSave();
      if (!saved) {
        showToast('error', 'Save failed; digest was not started');
        return;
      }
    }
    await handleRunNow();
  }, [hasUnsavedChanges, handleSave, handleRunNow, showToast]);
  const handleDiscard = useCallback(() => {
    setPendingToggles(new Map());
    if (settings) {
      setLocalConfig({
        is_enabled: settings.is_enabled,
        schedule_hour_utc: settings.schedule_hour_utc,
        max_articles_per_day: settings.max_articles_per_day,
        classification_model: settings.classification_model || settings.ai_model || 'gemini-3.6-flash',
        digest_model: settings.digest_model || settings.ai_model || 'gemini-3.6-flash',
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

  // Live "next auto-run in 17h 42m" countdown. Refreshes every 60s
  // (lower bound of useful resolution for a daily schedule) so the
  // user sees the wait-time decreasing without having to refresh.
  // The static "06:00 UTC" alone read as configuration; pairing it
  // with a relative figure makes the page feel like it knows the time.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!localConfig.is_enabled) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [localConfig.is_enabled]);

  const nextScheduledLabel = useMemo(() => {
    if (!localConfig.is_enabled) return 'Auto-run paused';
    const hour = localConfig.schedule_hour_utc;
    const next = new Date(now);
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(hour);
    if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1);
    const diffMs = next.getTime() - now;
    const totalMin = Math.max(0, Math.round(diffMs / 60_000));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const rel =
      h > 0 && m > 0 ? `${h}h ${m}m` :
      h > 0 ? `${h}h` :
      `${m}m`;
    return `Next auto-run in ${rel} (${String(hour).padStart(2, '0')}:00 UTC)`;
  }, [localConfig.is_enabled, localConfig.schedule_hour_utc, now]);

  const lastRunLabel = useMemo(() => {
    if (!lastRun) return 'No runs yet — click Run Now to start one';
    const summary = lastRun.result_summary as Record<string, any> | null;
    const errors: string[] = Array.isArray(summary?.errors) ? summary!.errors : [];
    const sysErrors = countSystemErrors(summary);
    const feedErrs = countFeedErrors(summary);
    const digested = summary?.digested ?? summary?.articles_digested ?? 0;
    const skipped = summary?.skipped ?? summary?.articles_skipped ?? 0;
    const harvested = summary?.articles_harvested ?? 0;
    // HH:MM:SS so it lines up with the per-event timestamps in the
    // Activity transcript — mixing HH:MM with HH:MM:SS within one
    // viewport read as a formatting bug.
    const time = new Date(lastRun.started_at || lastRun.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    if (lastRun.status === 'pending' || lastRun.status === 'processing') return `Running since ${time}`;
    if (lastRun.status === 'failed') {
      // Surface the failure reason inline instead of just "failed". Most
      // helpful piece is the orchestrator's `error` field (set by the
      // watchdog) or the first entry in errors[]. Falls back to "no
      // reason captured" when both are empty (job died too fast to log).
      const reason = lastRun.error
        || (errors[0] ? String(errors[0]).slice(0, 80) : 'no reason captured');
      return `Last run ${time} — failed: ${reason}`;
    }
    // Surface system errors prominently; feed-transport blips render as
    // a soft "(N feed unreachable)" parenthetical so the user knows
    // upstream had a hiccup without thinking the pipeline broke.
    const errorPart = sysErrors > 0 ? ` · ${sysErrors} error${sysErrors === 1 ? '' : 's'}` : '';
    const feedNote = feedErrs > 0 ? ` (${feedErrs} feed${feedErrs === 1 ? '' : 's'} unreachable)` : '';
    if (digested === 0 && sysErrors === 0 && skipped > 0) {
      return `Last run ${time} · 0 relevant articles · ${skipped} filtered out as noise${feedNote}`;
    }
    if (digested === 0 && sysErrors === 0 && harvested === 0) {
      return `Last run ${time} · no new articles published in your sources${feedNote}`;
    }
    return `Last run ${time} · ${digested} digested${errorPart}${feedNote}`;
  }, [lastRun]);

  // Last-run tone for the prominent status pill in the header. Mirrors
  // the FeedActivityLog tone math so a user sees the same color signal
  // here that they'd see if they scrolled to the matching job card.
  // Hook must live above the early-return below (Rules of Hooks).
  // 'neutral' is used for "completed cleanly but produced nothing" — a
  // run with 0 errors AND 0 digested is operationally healthy but
  // shouldn't read as success-green at a glance. Mapping to a muted
  // colour distinguishes "the pipeline ran and nothing was relevant"
  // from "the pipeline ran and produced 5 reports".
  const lastRunTone: 'success' | 'partial' | 'failure' | 'running' | 'pending' | 'neutral' | 'idle' = useMemo(() => {
    if (!lastRun) return 'idle';
    const summary = lastRun.result_summary as Record<string, any> | null;
    const sysErrors = countSystemErrors(summary);
    const digested = summary?.digested ?? summary?.articles_digested ?? 0;
    if (lastRun.status === 'pending') return 'pending';
    if (lastRun.status === 'processing') return 'running';
    if (lastRun.status === 'failed') return 'failure';
    // Only system errors flip the tone to amber. Feed-transport blips
    // (counted by countFeedErrors) are routine flakiness and the run
    // can still be "success" if it produced reports.
    if (sysErrors > 0) return 'partial';
    if (digested > 0) return 'success';
    return 'neutral';
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

  // Map last-run tone to a single CSS color class. Brand tokens only —
  // no Tailwind emerald/amber/red. The dot is a small status glyph,
  // not a chip; the user's eye lands on the text next to it.
  const lastRunDot =
    lastRunTone === 'success' ? 'bg-secondary'
    : lastRunTone === 'partial' ? 'bg-ext-amber'
    : lastRunTone === 'failure' ? 'bg-error'
    : lastRunTone === 'running' ? 'bg-ext-amber animate-pulse'
    : lastRunTone === 'neutral' ? 'bg-on-surface-variant/60'
    : 'bg-outline-variant';

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 animate-page-enter">
      {/* Page header — title + supporting subtitle + primary action.
          The previous version started straight with status text which
          read as a notification, not a page. Title gives the page an
          anchor; subtitle explains what the pipeline does. The auto-
          run toggle was previously crammed into this header but is a
          configuration preference (not an action), so it now lives at
          the top of the Configuration tab. */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-on-surface">Auto-Digest Pipeline</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Daily intelligence harvest — fetch, classify, rank and digest threat-research articles into your library.
          </p>
        </div>
        <Button
          size="md"
          color="primary"
          leadingIcon="play"
          loading={isRunning || isJobActive}
          onClick={handleSaveAndRun}
          title={isJobActive ? 'A digest job is already in progress' : 'Run the pipeline now instead of waiting for the next scheduled slot'}
        >
          {isJobActive ? 'Running…' : 'Run Now'}
        </Button>
      </div>

      {/* Status banner — a rounded info card, not a pill. Holds the
          one-line "what just happened" summary plus the next-run
          countdown. Sits between the page title and the tabs so the
          eye answers "is the pipeline OK?" before drilling in. */}
      <div className="mb-6 rounded-lg border border-outline-variant/40 bg-surface-container-low px-4 py-3 flex items-center gap-4 flex-wrap">
        <span className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full shrink-0 ${lastRunDot}`} />
          <span className="text-sm text-on-surface font-medium">{lastRunLabel}</span>
        </span>
        <span className="w-px h-4 bg-outline-variant/60" />
        <span className="text-sm text-on-surface-variant">{nextScheduledLabel}</span>
      </div>

      {/* Underline tabs — flat, no leading icons. Active tab has a
          2px brand-primary underline so the row sits in the page
          chrome rather than competing with content. */}
      <div className="flex items-center gap-1 mb-6 border-b border-outline-variant/40">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-sm transition-colors -mb-px ${
                isActive
                  ? 'text-on-surface font-semibold border-b-2 border-primary'
                  : 'text-on-surface-variant hover:text-on-surface border-b-2 border-transparent'
              }`}
            >
              {tab.label}
              {tab.id === 'sources' && curatedSources.length > 0 && (
                <span className="text-xs tabular-nums text-on-surface-variant">
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
      {/* Sources tab — no duplicate "Sources" panel title (the active
          tab + page title already carry that). Just an inline count
          summary on the same row as the action button so the table
          starts immediately. */}
      {activeTab === 'sources' && (
        <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap border-b border-outline-variant/30">
            <p className="text-sm text-on-surface-variant">
              <span className="font-medium text-on-surface tabular-nums">{effectiveEnabled.size}</span>
              {' '}of {curatedSources.length} enabled
              {customFeeds.length > 0 && (
                <>
                  {' · '}
                  <span className="font-medium text-on-surface tabular-nums">{customFeeds.length}</span>
                  {' '}custom
                </>
              )}
            </p>
            <Button
              size="sm"
              color="primary"
              leadingIcon="plus"
              onClick={() => setAddCustomOpen(true)}
            >
              Add Custom Source
            </Button>
          </div>

          <div>
            <table className="w-full">
              {/* Compact column header — no heavy bg fill, just a thin
                  border under it. Smaller font + lighter weight so it
                  reads as a label row, not a section title. */}
              <thead>
                <tr className="text-left border-b border-outline-variant/30">
                  <th className="py-2 pl-4 pr-2 w-10" />
                  <th className="py-2 pr-3 text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider">Source</th>
                  <th className="py-2 pr-3 text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider">Domain</th>
                  <th className="py-2 pr-3 text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider">Health</th>
                  <th className="py-2 pr-3 text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider text-right">Frequency</th>
                  <th className="py-2 pr-4 w-16 text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider text-center">Active</th>
                </tr>
              </thead>
              {/* All curated sources rendered flat — no per-category
                  divider rows. With only one populated category
                  ("Threat Research") plus a one-off (CISA), the
                  category dividers added chrome without information.
                  Custom (user-added) feeds still get their own divider
                  since they're a different class of row. */}
              <tbody>
                {CATEGORY_ORDER.flatMap((cat) => grouped[cat] ?? []).map((source, i) => (
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
              {customFeeds.length > 0 && (
                <tbody>
                  <tr>
                    <td colSpan={6} className="px-4 py-1.5 border-y border-outline-variant/40">
                      <span className="text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider">
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
        // Each settings group is a real container — rounded-lg border +
        // surface-container-low background — so the eye reads them as
        // discrete cards, not floating form fields. Headings carry
        // visual weight (text-base font-semibold) instead of being
        // tiny uppercase labels.
        <div className="space-y-6">
          <section className="rounded-xl border border-outline-variant/40 bg-surface-container-low overflow-hidden">
            <div className="px-6 pt-5 pb-3 border-b border-outline-variant/30">
              <h3 className="text-base font-semibold text-on-surface">Pipeline Settings</h3>
              <p className="text-sm text-on-surface-variant/80 mt-0.5">
                Controls when and how articles are fetched and processed
              </p>
            </div>
            <div className="p-6 space-y-5">
              {/* Auto-run schedule switch — moved here from the page
                  header. It's a preference (governs the cron), not a
                  runtime action, so its natural home is Configuration.
                  Kept at the top of Pipeline Settings since it's the
                  most-toggled setting. */}
              <div className="flex items-start justify-between gap-4 pb-5 border-b border-outline-variant/30">
                <div>
                  <p className="text-sm font-medium text-on-surface">Auto-run on schedule</p>
                  <p className="text-xs text-on-surface-variant/80 mt-0.5">
                    When enabled, the pipeline runs automatically at the time below. Run Now still works either way.
                  </p>
                </div>
                <Toggle
                  size="md"
                  checked={localConfig.is_enabled}
                  onChange={() => updateConfig('is_enabled', !localConfig.is_enabled)}
                  aria-label={localConfig.is_enabled ? 'Disable auto-digest schedule' : 'Enable auto-digest schedule'}
                />
              </div>
            <div className="space-y-5">
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
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] text-on-surface-variant/70">Automatic</span>
                    <Link
                      to="/settings/environment"
                      className="text-xs text-primary hover:underline font-medium"
                      title="Edit your Environment Profile to change relevance scoring"
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </section>

          {/* Pipeline Health — same container shape as Pipeline Settings.
              Headline metric (reports produced) is the only stat the
              eye should land on first; the four-tile sub-row is
              supporting context. */}
          {recentJobs.length === 0 && (
            <section className="rounded-xl border border-outline-variant/40 bg-surface-container-low overflow-hidden">
              <div className="px-6 pt-5 pb-3 border-b border-outline-variant/30">
                <h3 className="text-base font-semibold text-on-surface">Pipeline Health</h3>
                <p className="text-sm text-on-surface-variant/80 mt-0.5">
                  Runs your pipeline has executed will roll up here once you have one
                </p>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                  {(['Reports', 'Not relevant', 'System errors', 'Success rate'] as const).map((label) => (
                    <div key={label}>
                      <div className="text-3xl font-semibold text-on-surface-variant/30 tabular-nums">—</div>
                      <div className="text-xs uppercase tracking-wider text-on-surface-variant/70 font-medium mt-1">{label}</div>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-on-surface-variant/80 mt-5">
                  Click <span className="font-medium text-on-surface">Run Now</span> at the top of the page or wait for the next scheduled run to populate this panel.
                </p>
              </div>
            </section>
          )}
          {recentJobs.length > 0 && (() => {
            const totals = recentJobs.reduce(
              (acc, j) => {
                const s = j.result_summary as Record<string, any> | null;
                const sys = countSystemErrors(s);
                const feed = countFeedErrors(s);
                acc.digested += s?.digested ?? s?.articles_digested ?? 0;
                acc.skipped  += s?.skipped  ?? s?.articles_skipped  ?? 0;
                acc.sysErrors  += sys;
                acc.feedErrors += feed;
                if (j.status === 'completed' && sys === 0) acc.cleanRuns += 1;
                acc.runsProducedReports += (s?.digested ?? s?.articles_digested ?? 0) > 0 ? 1 : 0;
                return acc;
              },
              { digested: 0, skipped: 0, sysErrors: 0, feedErrors: 0, cleanRuns: 0, runsProducedReports: 0 },
            );
            const successRate = recentJobs.length > 0
              ? Math.round((totals.cleanRuns / recentJobs.length) * 100)
              : 0;
            // One dot per recent run, filled when the run produced
            // ≥1 report. Lets the eye answer "am I getting reports?"
            // without parsing four equally-weighted stat tiles.
            const runDots = recentJobs.map((j) => {
              const s = j.result_summary as Record<string, any> | null;
              const sys = countSystemErrors(s);
              const dig = s?.digested ?? s?.articles_digested ?? 0;
              if (j.status === 'failed' || sys > 0) return 'error' as const;
              if (dig > 0) return 'produced' as const;
              return 'empty' as const;
            }).reverse(); // oldest → newest, left → right
            return (
              <section className="rounded-xl border border-outline-variant/40 bg-surface-container-low overflow-hidden">
                <div className="px-6 pt-5 pb-3 border-b border-outline-variant/30">
                  <h3 className="text-base font-semibold text-on-surface">Pipeline Health</h3>
                  <p className="text-sm text-on-surface-variant/80 mt-0.5">
                    Last {recentJobs.length} run{recentJobs.length === 1 ? '' : 's'} — reports produced is the headline metric
                  </p>
                </div>
                <div className="p-6">
                  {/* Hero metric + supporting sentence on the same line so
                      the user can answer "am I getting reports?" with
                      one read. */}
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-5xl font-semibold text-on-surface tabular-nums leading-none">{totals.digested}</span>
                    <span className="text-base text-on-surface-variant">
                      report{totals.digested === 1 ? '' : 's'} from your last {recentJobs.length} run{recentJobs.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-4 flex-wrap">
                    <span className="text-xs uppercase tracking-wider text-on-surface-variant/70 font-medium">Run history</span>
                    <span className="flex items-center gap-1.5">
                      {runDots.map((d, i) => (
                        <span
                          key={i}
                          className={`w-2.5 h-2.5 rounded-full ${
                            d === 'produced' ? 'bg-secondary'
                            : d === 'error' ? 'bg-error'
                            : 'border border-outline-variant'
                          }`}
                          aria-label={d === 'produced' ? 'Produced reports' : d === 'error' ? 'System error' : 'No reports'}
                        />
                      ))}
                    </span>
                    <span className="text-sm tabular-nums text-on-surface-variant">
                      {totals.runsProducedReports} of {recentJobs.length} produced reports
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-6 pt-5 border-t border-outline-variant/30">
                    <div>
                      <div className="text-2xl font-semibold text-on-surface tabular-nums">{totals.skipped}</div>
                      <div className="text-xs uppercase tracking-wider text-on-surface-variant/70 font-medium mt-1">Not relevant</div>
                    </div>
                    <div title="Real pipeline failures (orchestrator, AI, db). Feed transport blips are excluded.">
                      <div className={`text-2xl font-semibold tabular-nums ${totals.sysErrors > 0 ? 'text-ext-amber' : 'text-on-surface'}`}>{totals.sysErrors}</div>
                      <div className="text-xs uppercase tracking-wider text-on-surface-variant/70 font-medium mt-1">System errors</div>
                    </div>
                    <div title="Upstream RSS feeds that returned a network error. Routine flakiness.">
                      <div className="text-2xl font-semibold text-on-surface-variant tabular-nums">{totals.feedErrors}</div>
                      <div className="text-xs uppercase tracking-wider text-on-surface-variant/70 font-medium mt-1">Feed blips</div>
                    </div>
                    <div>
                      <div className={`text-2xl font-semibold tabular-nums ${successRate >= 80 ? 'text-secondary' : successRate >= 50 ? 'text-ext-amber' : 'text-error'}`}>{successRate}%</div>
                      <div className="text-xs uppercase tracking-wider text-on-surface-variant/70 font-medium mt-1">Success rate</div>
                    </div>
                  </div>
                </div>
              </section>
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
            <div className="rounded-lg border border-ext-amber/40 bg-ext-amber-container/20 px-5 py-4 flex items-start gap-3">
              <Icon name="alert-triangle" className="w-5 h-5 text-ext-amber mt-0.5 shrink-0" />
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
                color="primary"
                leadingIcon="play"
                loading={isRunning || isJobActive}
                onClick={handleSaveAndRun}
                title="Trigger a digest now to seed the prompt cache"
              >
                {isJobActive ? 'Running…' : 'Run Now'}
              </Button>
            </div>
          )}

          {userId ? (
            <FeedActivityLog userId={userId} liveJobs={recentJobs} />
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
