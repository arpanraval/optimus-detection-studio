import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { useAutoDigestEvents, type DigestEvent, type DigestEventType } from '../../hooks/useAutoDigestEvents';
import { routeHelpers } from '../../router/routes';
import type { AutoDigestJob } from '../../hooks/useAutoDigestSettings';

interface JobTranscriptProps {
  job: AutoDigestJob;
}

// =============================================================================
// Stage taxonomy
//
// Group every event type into one of the four orchestrator stages so the user
// can read the run as a pipeline (Harvest → Classify → Rank → Digest) instead
// of a flat timestamp stream. New event types must be added here AND to the
// CHECK constraint in 20260429d_auto_digest_run_events.sql.
// =============================================================================

type StageKey = 'harvest' | 'classify' | 'rank' | 'digest';

const STAGES: { key: StageKey; label: string; subtitle: string }[] = [
  { key: 'harvest',  label: 'Harvest',           subtitle: 'Fetch RSS/Atom feeds, dedupe and store new articles' },
  { key: 'classify', label: 'Classify',          subtitle: 'AI gate: is this actionable threat research?' },
  { key: 'rank',     label: 'Rank & Select',     subtitle: 'Score relevance and apply your daily article cap' },
  { key: 'digest',   label: 'Digest',            subtitle: 'Full extraction: TTPs, IoCs, MITRE, library matches' },
];

const EVENT_STAGE: Record<DigestEventType, StageKey> = {
  feed_fetched:                'harvest',
  feed_failed:                 'harvest',
  article_seen:                'harvest',
  article_classified:          'classify',
  article_classify_failed:     'classify',
  article_skipped_daily_limit: 'rank',
  article_digested:            'digest',
  article_digest_failed:       'digest',
};

// =============================================================================
// Helpers
// =============================================================================

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

// Convert raw network/transport errors from upstream feed fetches into
// user-friendly summaries. We deliberately keep the original text accessible
// via the "Show details" expander — power users debugging a flaky feed
// still need it — but we don't make a casual reader parse "http2 error:
// stream error received: unexpected internal error encountered" to
// understand "the feed is temporarily down".
function humanizeFeedError(raw: string | null | undefined): { headline: string; raw: string | null } {
  const r = (raw || '').trim();
  if (!r) return { headline: 'Unknown error', raw: null };

  // Known transport-layer patterns.
  if (/http2|h2c|stream error|GOAWAY/i.test(r)) {
    return { headline: 'Network error — feed temporarily unreachable (HTTP/2 transport)', raw: r };
  }
  if (/ECONNRESET|connection reset/i.test(r)) {
    return { headline: 'Network error — connection reset by upstream feed', raw: r };
  }
  if (/ETIMEDOUT|timed?\s*out|timeout/i.test(r)) {
    return { headline: 'Timed out — feed did not respond in time', raw: r };
  }
  if (/ENOTFOUND|getaddrinfo|DNS/i.test(r)) {
    return { headline: 'DNS lookup failed — feed host could not be resolved', raw: r };
  }
  if (/HTTP\s*5\d\d/i.test(r)) {
    return { headline: 'Feed responded with a server error (5xx)', raw: r };
  }
  if (/HTTP\s*4\d\d/i.test(r)) {
    return { headline: 'Feed rejected the request (4xx)', raw: r };
  }
  if (/Content too large|exceeds maximum/i.test(r)) {
    return { headline: 'Feed response too large to process', raw: r };
  }

  // Short messages we can show as-is. Long messages we truncate but still
  // expose the full text via the expander.
  if (r.length <= 80) return { headline: r, raw: null };
  return { headline: r.slice(0, 80) + '…', raw: r };
}

const RawErrorDetails: React.FC<{ raw: string }> = ({ raw }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="ml-5 mt-0.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-[10px] uppercase tracking-wider text-on-surface-variant/50 hover:text-on-surface-variant transition-colors"
      >
        {open ? 'Hide details' : 'Show details'}
      </button>
      {open && (
        <pre className="mt-1 text-[10px] text-on-surface-variant/70 whitespace-pre-wrap break-all font-mono leading-relaxed bg-surface-container-lowest/60 rounded p-2">
          {raw}
        </pre>
      )}
    </div>
  );
};

function eventDestinationUrl(e: DigestEvent): string | null {
  if (e.event_type === 'article_digested') {
    const reportId = (e.payload as any)?.report_id;
    if (reportId) return routeHelpers.threatIntelDetail(reportId);
  }
  return e.article_url || null;
}

const isInternal = (url: string | null): boolean => !!url && url.startsWith('/');

const ArticleLink: React.FC<{ event: DigestEvent }> = ({ event }) => {
  const url = eventDestinationUrl(event);
  const text = event.article_title ?? '(untitled)';
  if (!url) return <span className="text-on-surface">{text}</span>;
  if (isInternal(url)) {
    return <Link to={url} className="text-on-surface hover:text-primary underline-offset-2 hover:underline">{text}</Link>;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-on-surface hover:text-primary underline-offset-2 hover:underline">
      {text}
    </a>
  );
};

// =============================================================================
// Stage components
// =============================================================================

const StageShell: React.FC<{
  index: number;
  stageKey: StageKey;
  title: string;
  subtitle: string;
  summary: React.ReactNode;
  detail: React.ReactNode;
  state: 'success' | 'error' | 'mixed' | 'empty' | 'running';
  defaultOpen?: boolean;
}> = ({ index, title, subtitle, summary, detail, state, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);

  // Stronger dot + ring opacities than v1 — at /30 the cards melted into
  // the parent's tint. The ring now reads at a glance and the dot has
  // enough contrast to identify state without staring.
  const tone = {
    success: { dot: 'bg-emerald-500',             ring: 'border-emerald-500/60' },
    error:   { dot: 'bg-red-400',                 ring: 'border-red-400/60' },
    mixed:   { dot: 'bg-amber-400',               ring: 'border-amber-400/60' },
    empty:   { dot: 'bg-on-surface-variant/40',   ring: 'border-outline-variant/40' },
    running: { dot: 'bg-amber-400 animate-pulse', ring: 'border-amber-400/60' },
  }[state];

  return (
    <div className={`relative rounded-lg border ${tone.ring} bg-surface-container-low/80 shadow-sm`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-surface-container-low transition-colors rounded-lg"
      >
        {/* Larger dot (3×3 instead of 2×2) so the tone signal reads from
            across the page, with a subtle ring outline so the dot stays
            visible against the parent rail. */}
        <span className={`relative mt-1.5 w-3 h-3 rounded-full shrink-0 ring-2 ring-surface-container ${tone.dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/70">
              Stage {index}
            </span>
            <span className="text-sm font-semibold text-on-surface">{title}</span>
          </div>
          <div className="text-xs text-on-surface-variant/70 mt-0.5">{subtitle}</div>
          <div className="text-sm text-on-surface mt-1.5">{summary}</div>
        </div>
        <Icon
          name={open ? 'chevron-down' : 'chevron-right'}
          className="w-4 h-4 text-on-surface-variant/60 shrink-0 mt-1"
        />
      </button>
      {open && (
        <div className="border-t border-outline-variant/20 px-4 py-3 text-xs">
          {detail}
        </div>
      )}
    </div>
  );
};

// ─── Stage 1: Harvest ──────────────────────────────────────────────────────

function HarvestStage({ events, jobIsActive }: { events: DigestEvent[]; jobIsActive: boolean }) {
  // NOTE: this is a plain helper function, not a React component. Hooks added
  // here would attach to JobTranscript's hook scope and break the rules of
  // hooks when JobTranscript's early-return branches fire (the "Rendered more
  // hooks than during the previous render" crash). Keep computation inline.
  const feedFetched = events.filter((e) => e.event_type === 'feed_fetched');
  const feedFailed = events.filter((e) => e.event_type === 'feed_failed');
  const articlesSeen = events.filter((e) => e.event_type === 'article_seen');
  const recoveredArticles = articlesSeen.filter((a) => (a.payload as any)?.recovered === true);
  const newArticles = articlesSeen.filter((a) => (a.payload as any)?.recovered !== true);

  const feedMap = new Map<string, { feedName: string; status: 'ok' | 'failed'; error?: string; articles: DigestEvent[] }>();
  for (const fe of feedFetched) {
    const key = fe.feed_id || `name:${fe.feed_name}`;
    feedMap.set(key, { feedName: fe.feed_name || 'Unknown feed', status: 'ok', articles: [] });
  }
  for (const fe of feedFailed) {
    const key = fe.feed_id || `name:${fe.feed_name}`;
    feedMap.set(key, { feedName: fe.feed_name || 'Unknown feed', status: 'failed', error: fe.reason ?? 'Unknown error', articles: [] });
  }
  for (const a of newArticles) {
    const key = a.feed_id || `name:${a.feed_name}`;
    const entry = feedMap.get(key);
    if (entry) entry.articles.push(a);
  }
  const feedsByFeedId = [...feedMap.entries()].map(([id, v]) => ({ id, ...v }));

  const totalNew = newArticles.length;
  const totalRecovered = recoveredArticles.length;
  const totalFeeds = feedsByFeedId.length;
  const okFeeds = feedsByFeedId.filter((f) => f.status === 'ok').length;

  if (events.length === 0) {
    return {
      summary: jobIsActive ? 'Waiting…' : 'No feeds fetched',
      state: 'empty' as const,
      detail: <div className="text-on-surface-variant/60">No feed activity recorded.</div>,
    };
  }

  const state = feedFailed.length > 0
    ? (okFeeds > 0 ? 'mixed' as const : 'error' as const)
    : 'success' as const;

  const summary = (
    <span>
      <span className="font-medium">{okFeeds}</span> of {totalFeeds} feed{totalFeeds === 1 ? '' : 's'} fetched
      {feedFailed.length > 0 && <span className="text-red-400"> · {feedFailed.length} failed</span>}
      <span className="text-on-surface-variant"> · </span>
      <span className="font-medium">{totalNew}</span> new article{totalNew === 1 ? '' : 's'}
      {totalRecovered > 0 && (
        <span className="text-on-surface-variant"> · <span className="font-medium">{totalRecovered}</span> recovered from prior run</span>
      )}
    </span>
  );

  const detail = (
    <ul className="space-y-2">
      {feedsByFeedId.map((f) => (
        <li key={f.id}>
          <div className="flex items-center gap-2">
            <Icon
              name={f.status === 'failed' ? 'alert-triangle' : 'rss'}
              className={`w-3 h-3 shrink-0 ${f.status === 'failed' ? 'text-red-400' : 'text-on-surface-variant/60'}`}
            />
            <span className={`text-xs font-medium ${f.status === 'failed' ? 'text-red-400' : 'text-on-surface'}`}>
              {f.feedName}
            </span>
            <span className="text-[11px] text-on-surface-variant/60">
              {f.status === 'failed' ? 'fetch failed' : `${f.articles.length} new`}
            </span>
          </div>
          {f.error && (() => {
            const humanized = humanizeFeedError(f.error);
            return (
              <>
                <div className="text-[11px] text-red-400/80 ml-5 mt-0.5">{humanized.headline}</div>
                {humanized.raw && <RawErrorDetails raw={humanized.raw} />}
              </>
            );
          })()}
          {f.articles.length > 0 && (
            <ul className="ml-5 mt-1 space-y-0.5">
              {f.articles.map((a) => (
                <li key={a.id} className="text-[11px] truncate">
                  <span className="text-on-surface-variant/40 mr-1.5">·</span>
                  <ArticleLink event={a} />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
      {recoveredArticles.length > 0 && (
        <li className="pt-2 border-t border-outline-variant/15">
          <div className="flex items-center gap-2">
            <Icon name="refresh-cw" className="w-3 h-3 shrink-0 text-amber-400" />
            <span className="text-xs font-medium text-on-surface">Recovered from prior runs</span>
            <span className="text-[11px] text-on-surface-variant/60">{recoveredArticles.length}</span>
          </div>
          <ul className="ml-5 mt-1 space-y-0.5">
            {recoveredArticles.map((a) => (
              <li key={a.id} className="text-[11px] truncate">
                <span className="text-on-surface-variant/40 mr-1.5">·</span>
                <ArticleLink event={a} />
              </li>
            ))}
          </ul>
        </li>
      )}
    </ul>
  );

  return { summary, state, detail };
}

// ─── Stage 2: Classify ─────────────────────────────────────────────────────

function ClassifyStage({ events }: { events: DigestEvent[] }) {
  const passed = events.filter((e) => e.event_type === 'article_classified' && e.passed === true);
  const skipped = events.filter((e) => e.event_type === 'article_classified' && e.passed === false);
  const errored = events.filter((e) => e.event_type === 'article_classify_failed');
  const total = passed.length + skipped.length + errored.length;

  if (total === 0) {
    return {
      summary: 'Nothing to classify',
      state: 'empty' as const,
      detail: <div className="text-on-surface-variant/60">No articles reached the classifier.</div>,
    };
  }

  const state = errored.length > 0
    ? (passed.length > 0 ? 'mixed' as const : 'error' as const)
    : (passed.length > 0 ? 'success' as const : 'mixed' as const);

  // Color semantics: green only when passed > 0. A run that classified
  // every article as "not threat research" is neither failure nor success
  // visually — it's a neutral verdict. "0 passed" rendered emerald sent
  // the wrong signal.
  const passedClass = passed.length > 0 ? 'font-medium text-emerald-500' : 'text-on-surface-variant';

  const summary = (
    <span>
      <span className={passedClass}>{passed.length} passed</span>
      <span className="text-on-surface-variant"> · </span>
      <span className="text-on-surface-variant">{skipped.length} not relevant</span>
      {errored.length > 0 && (
        <>
          <span className="text-on-surface-variant"> · </span>
          <span className="text-red-400 font-medium">{errored.length} error{errored.length === 1 ? '' : 's'}</span>
        </>
      )}
    </span>
  );

  // Per-row tone label. "Skipped" was ambiguous — "Not relevant" reads
  // as the verdict it is. "Error" remains for actual classifier failures.
  // Tags now render as small filled chips so the verdict reads at a
  // glance instead of getting lost as faint uppercase text.
  const detail = (
    <ul className="space-y-2">
      {[...passed, ...skipped, ...errored].map((e) => {
        const isErr = e.event_type === 'article_classify_failed';
        const isPassed = e.passed === true;
        const chipClass = isErr
          ? 'bg-red-500/15 text-red-300 border-red-500/30'
          : isPassed
          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
          : 'bg-amber-500/15 text-amber-300 border-amber-500/30';
        const label = isErr ? 'Error' : (isPassed ? 'Passed' : 'Not relevant');
        return (
          <li key={e.id}>
            <div className="flex items-baseline gap-2">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${chipClass}`}>{label}</span>
              <span className="text-[11px] text-on-surface-variant/50 font-mono tabular-nums shrink-0">{formatTime(e.created_at)}</span>
              <span className="min-w-0 flex-1 truncate"><ArticleLink event={e} /></span>
            </div>
            {e.reason && (
              <div className="text-[11px] text-on-surface-variant ml-[5.25rem] mt-1 leading-snug">{e.reason}</div>
            )}
          </li>
        );
      })}
    </ul>
  );

  return { summary, state, detail };
}

// ─── Stage 3: Rank & Select ────────────────────────────────────────────────

function RankStage({ events, classifyPassed, jobIsActive }: { events: DigestEvent[]; classifyPassed: number; jobIsActive: boolean }) {
  const droppedDailyCap = events.filter((e) => e.event_type === 'article_skipped_daily_limit');
  const totalDropped = droppedDailyCap.length;

  if (classifyPassed === 0) {
    return {
      summary: 'Nothing to rank — no articles passed classification',
      state: 'empty' as const,
      detail: <div className="text-on-surface-variant/60">Nothing to do at this stage.</div>,
    };
  }

  // Selected = classifyPassed - dropped. Orchestrator doesn't emit an explicit
  // "selected" event, the count is implied from what wasn't dropped.
  const selected = Math.max(0, classifyPassed - totalDropped);

  if (events.length === 0 && selected === classifyPassed) {
    return {
      summary: jobIsActive
        ? 'Ranking…'
        : `${selected} of ${classifyPassed} selected for digest`,
      state: jobIsActive ? 'running' as const : 'success' as const,
      detail: <div className="text-on-surface-variant/60">All passing articles fit within the daily cap — nothing dropped.</div>,
    };
  }

  const summary = (
    <span>
      <span className="font-medium">{selected}</span> selected
      {droppedDailyCap.length > 0 && (
        <span className="text-on-surface-variant"> · {droppedDailyCap.length} held back by daily cap</span>
      )}
    </span>
  );

  const detail = (
    <ul className="space-y-2">
      {droppedDailyCap.map((e) => (
        <li key={e.id}>
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-amber-500/15 text-amber-300 border-amber-500/30 shrink-0">
              Daily cap
            </span>
            <span className="text-[11px] text-on-surface-variant/50 font-mono tabular-nums shrink-0">{formatTime(e.created_at)}</span>
            <span className="min-w-0 flex-1 truncate"><ArticleLink event={e} /></span>
          </div>
          {e.reason && <div className="text-[11px] text-on-surface-variant ml-[5.5rem] mt-1 leading-snug">{e.reason}</div>}
        </li>
      ))}
    </ul>
  );

  return { summary, state: 'mixed' as const, detail };
}

// ─── Stage 4: Digest ───────────────────────────────────────────────────────

function DigestStage({ events, jobIsActive }: { events: DigestEvent[]; jobIsActive: boolean }) {
  const digested = events.filter((e) => e.event_type === 'article_digested');
  const failed = events.filter((e) => e.event_type === 'article_digest_failed');
  const total = digested.length + failed.length;

  if (total === 0) {
    return {
      summary: jobIsActive ? 'Waiting for selected articles…' : 'No articles selected — nothing to digest',
      state: 'empty' as const,
      detail: <div className="text-on-surface-variant/60">Nothing to do at this stage.</div>,
    };
  }

  const state = failed.length > 0
    ? (digested.length > 0 ? 'mixed' as const : 'error' as const)
    : 'success' as const;

  const totalDigestMs = digested.reduce((sum, e) => sum + (e.duration_ms ?? 0), 0);

  const summary = (
    <span>
      <span className="font-medium text-emerald-500">{digested.length} digested</span>
      {failed.length > 0 && (
        <>
          <span className="text-on-surface-variant"> · </span>
          <span className="text-red-400 font-medium">{failed.length} failed</span>
        </>
      )}
      {digested.length > 0 && totalDigestMs > 0 && (
        <span className="text-on-surface-variant"> · {formatDuration(totalDigestMs)} total</span>
      )}
    </span>
  );

  const detail = (
    <ul className="space-y-2">
      {[...digested, ...failed].map((e) => {
        const isErr = e.event_type === 'article_digest_failed';
        const chipClass = isErr
          ? 'bg-red-500/15 text-red-300 border-red-500/30'
          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
        const label = isErr ? 'Failed' : 'Digested';
        const payload = e.payload as Record<string, unknown> | null;
        const ttp = (payload?.ttp_count as number | undefined) ?? null;
        const ioc = (payload?.ioc_count as number | undefined) ?? null;
        const rule = (payload?.rule_count as number | undefined) ?? null;
        return (
          <li key={e.id}>
            <div className="flex items-baseline gap-2">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${chipClass}`}>{label}</span>
              <span className="text-[11px] text-on-surface-variant/50 font-mono tabular-nums shrink-0">{formatTime(e.created_at)}</span>
              <span className="min-w-0 flex-1 truncate"><ArticleLink event={e} /></span>
              {e.duration_ms != null && (
                <span className="text-[11px] text-on-surface-variant/60 tabular-nums shrink-0">{formatDuration(e.duration_ms)}</span>
              )}
            </div>
            {!isErr && (ttp != null || ioc != null || rule != null) && (
              <div className="text-[11px] text-on-surface-variant ml-[4.5rem] mt-1">
                {ttp != null && <span>{ttp} TTPs</span>}
                {ttp != null && ioc != null && <span> · </span>}
                {ioc != null && <span>{ioc} IoCs</span>}
                {(ttp != null || ioc != null) && rule != null && <span> · </span>}
                {rule != null && <span>{rule} rules</span>}
              </div>
            )}
            {isErr && e.reason && (
              <div className="text-[11px] text-red-400/80 ml-[4.5rem] mt-1">{e.reason}</div>
            )}
          </li>
        );
      })}
    </ul>
  );

  return { summary, state, detail };
}

// =============================================================================
// Main component
// =============================================================================

export const JobTranscript: React.FC<JobTranscriptProps> = ({ job }) => {
  const isLive = job.status === 'pending' || job.status === 'processing';
  const { events, isLoading } = useAutoDigestEvents(job.id, { live: isLive });

  const byStage = useMemo(() => {
    const groups: Record<StageKey, DigestEvent[]> = { harvest: [], classify: [], rank: [], digest: [] };
    for (const e of events) groups[EVENT_STAGE[e.event_type]].push(e);
    return groups;
  }, [events]);

  if (isLoading && events.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-xs text-on-surface-variant">
        <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        Loading transcript…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-on-surface-variant/60">
        No events recorded for this run yet.
      </div>
    );
  }

  const harvest = HarvestStage({ events: byStage.harvest, jobIsActive: isLive });
  const classifyPassed = byStage.classify.filter((e) => e.event_type === 'article_classified' && e.passed === true).length;
  const classify = ClassifyStage({ events: byStage.classify });
  const rank = RankStage({ events: byStage.rank, classifyPassed, jobIsActive: isLive });
  const digest = DigestStage({ events: byStage.digest, jobIsActive: isLive });

  // Auto-open whichever stage is currently the most-actionable: prefer error > running > most-recent.
  const stages = [
    { ...STAGES[0], ...harvest },
    { ...STAGES[1], ...classify },
    { ...STAGES[2], ...rank },
    { ...STAGES[3], ...digest },
  ];
  // Default-open priority: running first (so the user sees live progress),
  // then the last stage that has data (so the user lands on the most-recent
  // productive step). We deliberately do NOT auto-open the failing stage —
  // each stage's summary line already shows its error count + amber/red
  // tone, so the user can still see at a glance that something went wrong.
  // Auto-opening the bad stage on a mostly-successful run made the page
  // read as a failure when most of the work succeeded.
  const runningIdx = stages.findIndex((s) => s.state === 'running');
  const lastNonEmptyReversed = [...stages].reverse().findIndex((s) => s.state !== 'empty');
  const defaultOpenIdx = runningIdx >= 0
    ? runningIdx
    : lastNonEmptyReversed >= 0
      ? stages.length - 1 - lastNonEmptyReversed
      : -1;

  return (
    <div className="px-4 py-3 bg-surface-container-lowest/30 rounded-b-xl">
      {/* Stages render as a clear sequence using small chevron connectors
          between cards. We tried an absolute-positioned rail through the
          dot column but the card backgrounds occluded it; per-gap chevrons
          are simpler, visible, and don't fight z-stacking. */}
      <div className="space-y-2">
        {stages.map((s, i) => (
          <React.Fragment key={s.key}>
            <StageShell
              index={i + 1}
              stageKey={s.key}
              title={s.label}
              subtitle={s.subtitle}
              summary={s.summary}
              detail={s.detail}
              state={s.state}
              defaultOpen={i === defaultOpenIdx}
            />
            {i < stages.length - 1 && (
              <div className="flex justify-start pl-[22px] py-0.5">
                <Icon name="chevron-down" className="w-3 h-3 text-on-surface-variant/50" />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
