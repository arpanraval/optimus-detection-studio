import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { useAutoDigestEvents, type DigestEvent, type DigestEventType } from '../../hooks/useAutoDigestEvents';
import { routeHelpers } from '../../router/routes';
import type { AutoDigestJob } from '../../hooks/useAutoDigestSettings';

interface JobTranscriptProps {
  job: AutoDigestJob;
}

// Stage taxonomy — every event type maps to one of the four orchestrator
// stages. Adding a new event type requires both updating EVENT_STAGE here
// and the CHECK constraint in 20260429d_auto_digest_run_events.sql.

type StageKey = 'harvest' | 'classify' | 'rank' | 'digest' | 'link';

const EVENT_STAGE: Record<DigestEventType, StageKey> = {
  feed_fetched:                'harvest',
  feed_failed:                 'harvest',
  article_seen:                'harvest',
  article_classified:          'classify',
  article_classify_failed:     'classify',
  article_skipped_daily_limit: 'rank',
  article_ranked:              'rank',
  article_digested:            'digest',
  article_digest_failed:       'digest',
  campaign_link_evaluated:     'link',
  campaign_link_skipped:       'link',
  campaign_link_ambiguous:     'link',
  campaign_created:            'link',
  campaign_updated:            'link',
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

// One-line user summary for raw network/transport errors. Full original
// is preserved behind a "Show details" expander for ops debugging.
function humanizeFeedError(raw: string | null | undefined): { headline: string; raw: string | null } {
  const r = (raw || '').trim();
  if (!r) return { headline: 'Unknown error', raw: null };
  if (/http2|h2c|stream error|GOAWAY/i.test(r)) return { headline: 'Network error — feed temporarily unreachable (HTTP/2 transport)', raw: r };
  if (/ECONNRESET|connection reset/i.test(r))   return { headline: 'Network error — connection reset by upstream feed', raw: r };
  if (/ETIMEDOUT|timed?\s*out|timeout/i.test(r)) return { headline: 'Timed out — feed did not respond in time', raw: r };
  if (/ENOTFOUND|getaddrinfo|DNS/i.test(r))     return { headline: 'DNS lookup failed — feed host could not be resolved', raw: r };
  if (/HTTP\s*5\d\d/i.test(r))                   return { headline: 'Feed responded with a server error (5xx)', raw: r };
  if (/HTTP\s*4\d\d/i.test(r))                   return { headline: 'Feed rejected the request (4xx)', raw: r };
  if (/Content too large|exceeds maximum/i.test(r)) return { headline: 'Feed response too large to process', raw: r };
  if (r.length <= 80) return { headline: r, raw: null };
  return { headline: r.slice(0, 80) + '…', raw: r };
}

const RawErrorDetails: React.FC<{ raw: string }> = ({ raw }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-on-surface-variant hover:text-on-surface transition-colors"
      >
        {open ? 'Hide details' : 'Show details'}
      </button>
      {open && (
        <pre className="mt-2 text-xs text-on-surface-variant whitespace-pre-wrap break-all font-mono leading-relaxed bg-surface-container-low rounded-md p-3 border border-outline-variant/30">
          {raw}
        </pre>
      )}
    </>
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
  if (isInternal(url)) return <Link to={url} className="text-on-surface hover:text-primary">{text}</Link>;
  return <a href={url} target="_blank" rel="noopener noreferrer" className="text-on-surface hover:text-primary">{text}</a>;
};

// =============================================================================
// Visual primitives
// =============================================================================

type StatusTone = 'ok' | 'warn' | 'err' | 'idle';

const TONE_DOT: Record<StatusTone, string> = {
  ok:   'bg-secondary',
  warn: 'bg-ext-amber',
  err:  'bg-error',
  idle: 'bg-outline-variant',
};

const TONE_TEXT: Record<StatusTone, string> = {
  ok:   'text-secondary',
  warn: 'text-ext-amber',
  err:  'text-error',
  idle: 'text-on-surface-variant',
};

const StatusDot: React.FC<{ tone: StatusTone; pulse?: boolean }> = ({ tone, pulse }) => (
  <span className={`inline-block w-1.5 h-1.5 rounded-full ${TONE_DOT[tone]} ${pulse ? 'animate-pulse' : ''}`} />
);

// Verdict label — inline text instead of a chip. Different decision
// types share the same visual treatment so the eye doesn't perceive
// "five different colours" — the dot carries the tone, the label
// carries the verb, the row carries the data.
const Verdict: React.FC<{ tone: StatusTone; label: string }> = ({ tone, label }) => (
  <span className={`text-xs font-semibold uppercase tracking-wider ${TONE_TEXT[tone]} shrink-0 w-[100px]`}>
    {label}
  </span>
);

// Stage section — collapsible block for one orchestrator stage. No
// rounded box around it; just a header line + thin divider rule
// underneath when expanded. Reads as a section header in a document,
// not as another nested card. The user gets the full transcript
// without a stack of bordered containers.
const StageSection: React.FC<{
  index: number;
  title: string;
  subtitle: string;
  tone: StatusTone;
  summary: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ index, title, subtitle, tone, summary, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-baseline gap-3 py-2.5 text-left hover:bg-surface-container-low/40 transition-colors -mx-3 px-3 rounded"
      >
        <span className="text-xs font-bold text-on-surface-variant/60 tabular-nums w-4 shrink-0">{index}</span>
        <StatusDot tone={tone} />
        <span className="flex items-baseline gap-2 flex-wrap min-w-0 flex-1">
          <span className="text-sm font-semibold text-on-surface">{title}</span>
          <span className="text-xs text-on-surface-variant/70 truncate">{subtitle}</span>
        </span>
        <span className="text-sm text-on-surface shrink-0">{summary}</span>
        <Icon
          name={open ? 'chevron-down' : 'chevron-right'}
          className="w-4 h-4 text-on-surface-variant/60 shrink-0"
        />
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
};

// =============================================================================
// Stage 1 — Harvest detail
// =============================================================================

const HarvestDetail: React.FC<{
  feedFetched: DigestEvent[];
  feedFailed: DigestEvent[];
  articlesSeen: DigestEvent[];
}> = ({ feedFetched, feedFailed, articlesSeen }) => {
  // Group articles by feed for nesting under the feed row.
  const articlesByFeed = useMemo(() => {
    const map = new Map<string, DigestEvent[]>();
    for (const a of articlesSeen) {
      const key = a.feed_id || `name:${a.feed_name}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [articlesSeen]);

  // Build a unified per-feed list — successful + failed feeds together,
  // sorted by status (failed first, since that's where the user's
  // attention is needed) then by name.
  const feeds = useMemo(() => {
    const rows: { id: string; name: string; status: 'ok' | 'failed'; error?: string; articles: DigestEvent[] }[] = [];
    for (const fe of feedFetched) {
      const key = fe.feed_id || `name:${fe.feed_name}`;
      rows.push({
        id: key,
        name: fe.feed_name || 'Unknown feed',
        status: 'ok',
        articles: articlesByFeed.get(key) || [],
      });
    }
    for (const fe of feedFailed) {
      const key = fe.feed_id || `name:${fe.feed_name}`;
      rows.push({
        id: key,
        name: fe.feed_name || 'Unknown feed',
        status: 'failed',
        error: fe.reason ?? 'Unknown error',
        articles: [],
      });
    }
    rows.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'failed' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [feedFetched, feedFailed, articlesByFeed]);

  if (feeds.length === 0) {
    return <div className="py-2 text-sm text-on-surface-variant">No feed activity recorded.</div>;
  }

  return (
    <ul className="space-y-1">
      {feeds.map((f) => (
        <li key={f.id} className="py-1.5">
          <div className="flex items-baseline gap-3">
            <StatusDot tone={f.status === 'failed' ? 'warn' : 'ok'} />
            <span className="text-sm font-medium text-on-surface">{f.name}</span>
            <span className="text-xs text-on-surface-variant tabular-nums">
              {f.status === 'failed' ? 'fetch failed' : `${f.articles.length} article${f.articles.length === 1 ? '' : 's'}`}
            </span>
          </div>
          {f.error && (() => {
            const h = humanizeFeedError(f.error);
            return (
              <div className="mt-1 ml-[18px] text-xs">
                <div className="text-on-surface-variant">{h.headline}</div>
                {h.raw && <div className="mt-1"><RawErrorDetails raw={h.raw} /></div>}
              </div>
            );
          })()}
          {f.articles.length > 0 && (
            <ul className="mt-1.5 ml-[18px] space-y-1">
              {f.articles.map((a) => {
                const isRecovered = (a.payload as any)?.recovered === true;
                return (
                  <li key={a.id} className="grid grid-cols-[auto_1fr] gap-x-3 items-baseline text-sm">
                    <span className="text-xs font-mono tabular-nums text-on-surface-variant/70">{formatTime(a.created_at)}</span>
                    <span className="min-w-0 truncate">
                      <ArticleLink event={a} />
                      {isRecovered && (
                        <span className="ml-2 text-xs text-on-surface-variant">(recovered from earlier run)</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
};

// =============================================================================
// Stage 2 — Classify detail
// =============================================================================

const ClassifyDetail: React.FC<{
  passed: DigestEvent[];
  skipped: DigestEvent[];
  errored: DigestEvent[];
}> = ({ passed, skipped, errored }) => {
  const all = [...passed, ...skipped, ...errored].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  if (all.length === 0) {
    return <div className="py-2 text-sm text-on-surface-variant">No articles reached the classifier.</div>;
  }
  return (
    <ul className="space-y-1">
      {all.map((e) => {
        const isErr = e.event_type === 'article_classify_failed';
        const isPassed = e.passed === true;
        const tone: StatusTone = isErr ? 'err' : isPassed ? 'ok' : 'idle';
        const label = isErr ? 'Error' : isPassed ? 'Passed' : 'Not relevant';
        const confidence = (e.payload as Record<string, unknown> | null)?.confidence as number | undefined;
        return (
          <li key={e.id} className="py-1.5">
            <div className="grid grid-cols-[auto_auto_1fr_auto] gap-x-3 items-baseline">
              <span className="text-xs font-mono tabular-nums text-on-surface-variant/70">{formatTime(e.created_at)}</span>
              <Verdict tone={tone} label={label} />
              <span className="min-w-0 truncate text-sm"><ArticleLink event={e} /></span>
              {confidence != null && (
                <span className="text-xs tabular-nums text-on-surface-variant">conf {confidence.toFixed(2)}</span>
              )}
            </div>
            {e.reason && (
              <div className="mt-1 ml-[calc(2.75rem+100px+0.75rem)] text-xs text-on-surface-variant leading-snug">{e.reason}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

// =============================================================================
// Stage 3 — Rank & Select detail
// =============================================================================

const RankDetail: React.FC<{
  ranked: DigestEvent[];
  droppedDailyCap: DigestEvent[];
  droppedFloor: DigestEvent[];
}> = ({ ranked, droppedDailyCap, droppedFloor }) => {
  const all = [
    ...ranked.map((e) => ({ e, kind: 'selected' as const })),
    ...droppedDailyCap.map((e) => ({ e, kind: 'cap' as const })),
    ...droppedFloor.map((e) => ({ e, kind: 'floor' as const })),
  ].sort((a, b) => new Date(a.e.created_at).getTime() - new Date(b.e.created_at).getTime());

  if (all.length === 0) {
    return <div className="py-2 text-sm text-on-surface-variant">Nothing to rank in this run.</div>;
  }

  return (
    <ul className="space-y-1">
      {all.map(({ e, kind }) => {
        const tone: StatusTone = kind === 'selected' ? 'ok' : 'warn';
        const label = kind === 'selected' ? 'Selected' : kind === 'cap' ? 'Daily cap' : 'Below floor';
        const score = (e.payload as Record<string, unknown> | null)?.score as number | undefined
          ?? (e.payload as Record<string, unknown> | null)?.relevance_score as number | undefined;
        return (
          <li key={e.id} className="py-1.5">
            <div className="grid grid-cols-[auto_auto_1fr_auto] gap-x-3 items-baseline">
              <span className="text-xs font-mono tabular-nums text-on-surface-variant/70">{formatTime(e.created_at)}</span>
              <Verdict tone={tone} label={label} />
              <span className="min-w-0 truncate text-sm"><ArticleLink event={e} /></span>
              {score != null && (
                <span className="text-xs tabular-nums text-on-surface-variant">score {score.toFixed(2)}</span>
              )}
            </div>
            {e.reason && (
              <div className="mt-1 ml-[calc(2.75rem+100px+0.75rem)] text-xs text-on-surface-variant leading-snug">{e.reason}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

// =============================================================================
// Stage 4 — Digest detail
// =============================================================================

const DigestDetail: React.FC<{
  digested: DigestEvent[];
  failed: DigestEvent[];
}> = ({ digested, failed }) => {
  const all = [...digested, ...failed].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  if (all.length === 0) {
    return <div className="py-2 text-sm text-on-surface-variant">No articles reached the digest stage.</div>;
  }
  return (
    <ul className="space-y-1">
      {all.map((e) => {
        const isErr = e.event_type === 'article_digest_failed';
        const tone: StatusTone = isErr ? 'err' : 'ok';
        const label = isErr ? 'Failed' : 'Digested';
        const payload = e.payload as Record<string, unknown> | null;
        const ttp = payload?.ttp_count as number | undefined;
        const ioc = payload?.ioc_count as number | undefined;
        const rule = payload?.rule_count as number | undefined;
        const counts: string[] = [];
        if (ttp != null && ttp > 0)   counts.push(`${ttp} TTP${ttp === 1 ? '' : 's'}`);
        if (ioc != null && ioc > 0)   counts.push(`${ioc} IoC${ioc === 1 ? '' : 's'}`);
        if (rule != null && rule > 0) counts.push(`${rule} rule${rule === 1 ? '' : 's'}`);
        return (
          <li key={e.id} className="py-1.5">
            <div className="grid grid-cols-[auto_auto_1fr_auto] gap-x-3 items-baseline">
              <span className="text-xs font-mono tabular-nums text-on-surface-variant/70">{formatTime(e.created_at)}</span>
              <Verdict tone={tone} label={label} />
              <span className="min-w-0 truncate text-sm"><ArticleLink event={e} /></span>
              {e.duration_ms != null && (
                <span className="text-xs tabular-nums text-on-surface-variant">{formatDuration(e.duration_ms)}</span>
              )}
            </div>
            {!isErr && counts.length > 0 && (
              <div className="mt-1 ml-[calc(2.75rem+100px+0.75rem)] text-xs text-on-surface-variant">{counts.join(' · ')}</div>
            )}
            {isErr && e.reason && (
              <div className="mt-1 ml-[calc(2.75rem+100px+0.75rem)] text-xs text-on-surface-variant leading-snug">{e.reason}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

// =============================================================================
// Stage 5 — Link to Story detail
// =============================================================================
//
// One row per linker decision (per digested article). The AI subject-equivalence
// call may return: no matches (standalone), a single existing campaign to join,
// or multiple campaigns (ambiguous — joined the largest). We render the
// rationale verbatim so users can audit the call.

const LinkDetail: React.FC<{
  evaluated: DigestEvent[];
  skipped: DigestEvent[];
  ambiguous: DigestEvent[];
  created: DigestEvent[];
  updated: DigestEvent[];
}> = ({ evaluated, skipped, ambiguous, created, updated }) => {
  // We collapse evaluated rows that have a paired created/updated/skipped row
  // for the same article. The terminal event carries the actionable verdict;
  // the evaluated row is mostly an audit trace and would just duplicate.
  const terminalByArticle = useMemo(() => {
    const map = new Map<string, DigestEvent>();
    for (const e of [...created, ...updated, ...ambiguous, ...skipped]) {
      if (e.article_id) map.set(e.article_id, e);
    }
    return map;
  }, [created, updated, ambiguous, skipped]);

  const visibleEvaluated = evaluated.filter(
    (e) => !e.article_id || !terminalByArticle.has(e.article_id),
  );

  const all = [
    ...created.map((e) => ({ e, kind: 'created' as const })),
    ...updated.map((e) => ({ e, kind: 'updated' as const })),
    ...ambiguous.map((e) => ({ e, kind: 'ambiguous' as const })),
    ...skipped.map((e) => ({ e, kind: 'skipped' as const })),
    ...visibleEvaluated.map((e) => ({ e, kind: 'evaluated' as const })),
  ].sort((a, b) => new Date(a.e.created_at).getTime() - new Date(b.e.created_at).getTime());

  if (all.length === 0) {
    return <div className="py-2 text-sm text-on-surface-variant">No articles reached the linker.</div>;
  }

  const LABELS: Record<typeof all[number]['kind'], { label: string; tone: StatusTone }> = {
    created:   { label: 'New story',      tone: 'ok'   },
    updated:   { label: 'Joined story',   tone: 'ok'   },
    ambiguous: { label: 'Ambiguous',      tone: 'warn' },
    skipped:   { label: 'Standalone',     tone: 'idle' },
    evaluated: { label: 'Evaluated',      tone: 'idle' },
  };

  return (
    <ul className="space-y-1">
      {all.map(({ e, kind }) => {
        const { label, tone } = LABELS[kind];
        const payload = (e.payload as Record<string, unknown> | null) ?? {};
        const subject = typeof payload.proposed_subject === 'string'
          ? payload.proposed_subject
          : typeof payload.subject === 'string' ? payload.subject : null;
        return (
          <li key={e.id} className="py-1.5">
            <div className="grid grid-cols-[auto_auto_1fr_auto] gap-x-3 items-baseline">
              <span className="text-xs font-mono tabular-nums text-on-surface-variant/70">{formatTime(e.created_at)}</span>
              <Verdict tone={tone} label={label} />
              <span className="min-w-0 truncate text-sm"><ArticleLink event={e} /></span>
              {subject && (
                <span className="text-xs text-on-surface-variant truncate max-w-[240px]" title={subject}>
                  {subject}
                </span>
              )}
            </div>
            {e.reason && (
              <div className="mt-1 ml-[calc(2.75rem+100px+0.75rem)] text-xs text-on-surface-variant leading-snug">{e.reason}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

// =============================================================================
// Main component — assembles 5 stage panels (collapsible)
// =============================================================================

export const JobTranscript: React.FC<JobTranscriptProps> = ({ job }) => {
  const isLive = job.status === 'pending' || job.status === 'processing';
  const { events, isLoading } = useAutoDigestEvents(job.id, { live: isLive });

  const byStage = useMemo(() => {
    const groups: Record<StageKey, DigestEvent[]> = { harvest: [], classify: [], rank: [], digest: [], link: [] };
    for (const e of events) groups[EVENT_STAGE[e.event_type]].push(e);
    return groups;
  }, [events]);

  if (isLoading && events.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-on-surface-variant">
        <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        Loading transcript…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-on-surface-variant">
        No events recorded for this run yet.
      </div>
    );
  }

  // ── HARVEST ──
  const feedFetched = byStage.harvest.filter((e) => e.event_type === 'feed_fetched');
  const feedFailed = byStage.harvest.filter((e) => e.event_type === 'feed_failed');
  const articlesSeen = byStage.harvest.filter((e) => e.event_type === 'article_seen');
  const newArticleCount = articlesSeen.filter((a) => (a.payload as any)?.recovered !== true).length;
  const recoveredCount = articlesSeen.length - newArticleCount;

  // ── CLASSIFY ──
  const passed = byStage.classify.filter((e) => e.event_type === 'article_classified' && e.passed === true);
  const skipped = byStage.classify.filter((e) => e.event_type === 'article_classified' && e.passed === false);
  const classifyErr = byStage.classify.filter((e) => e.event_type === 'article_classify_failed');

  // ── RANK ──
  const ranked = byStage.rank.filter((e) => e.event_type === 'article_ranked');
  const droppedDailyCap = byStage.rank.filter(
    (e) => e.event_type === 'article_skipped_daily_limit' &&
      (e.payload as Record<string, unknown> | null)?.dropped_reason !== 'below_floor',
  );
  const droppedFloor = byStage.rank.filter(
    (e) => e.event_type === 'article_skipped_daily_limit' &&
      (e.payload as Record<string, unknown> | null)?.dropped_reason === 'below_floor',
  );

  // ── DIGEST ──
  const digested = byStage.digest.filter((e) => e.event_type === 'article_digested');
  const digestFailed = byStage.digest.filter((e) => e.event_type === 'article_digest_failed');
  const totalDigestMs = digested.reduce((sum, e) => sum + (e.duration_ms ?? 0), 0);

  // ── LINK ──
  const linkEvaluated = byStage.link.filter((e) => e.event_type === 'campaign_link_evaluated');
  const linkSkipped   = byStage.link.filter((e) => e.event_type === 'campaign_link_skipped');
  const linkAmbiguous = byStage.link.filter((e) => e.event_type === 'campaign_link_ambiguous');
  const linkCreated   = byStage.link.filter((e) => e.event_type === 'campaign_created');
  const linkUpdated   = byStage.link.filter((e) => e.event_type === 'campaign_updated');

  // Per-stage tone — feed-transport blips never flip a stage.
  const harvestTone: StatusTone = feedFailed.length > 0 && feedFetched.length === 0
    ? 'err'
    : feedFetched.length === 0 ? 'idle' : 'ok';
  const classifyTone: StatusTone = classifyErr.length > 0
    ? (passed.length > 0 || skipped.length > 0 ? 'warn' : 'err')
    : (passed.length + skipped.length === 0 ? 'idle' : 'ok');
  const rankTone: StatusTone = ranked.length === 0 ? 'idle' : 'ok';
  const digestTone: StatusTone = digestFailed.length > 0
    ? (digested.length > 0 ? 'warn' : 'err')
    : (digested.length === 0 ? 'idle' : 'ok');
  const linkActivity = linkEvaluated.length + linkSkipped.length + linkAmbiguous.length
                     + linkCreated.length + linkUpdated.length;
  const linkTone: StatusTone = linkActivity === 0
    ? 'idle'
    : (linkAmbiguous.length > 0 ? 'warn' : 'ok');

  return (
    <div className="px-3 py-2 bg-surface-container-low/30 border-t border-outline-variant/30 divide-y divide-outline-variant/30">
      <StageSection
        index={1}
        title="Harvest"
        subtitle="Fetch RSS/Atom feeds, dedupe and store new articles"
        tone={harvestTone}
        summary={
          <span className="text-on-surface-variant">
            <span className="text-on-surface font-medium tabular-nums">{feedFetched.length}</span> feed{feedFetched.length === 1 ? '' : 's'} fetched
            {feedFailed.length > 0 && <> · <span className="text-on-surface tabular-nums">{feedFailed.length}</span> unreachable</>}
            {' · '}
            <span className="text-on-surface tabular-nums">{newArticleCount}</span> new article{newArticleCount === 1 ? '' : 's'}
            {recoveredCount > 0 && <> · <span className="text-on-surface tabular-nums">{recoveredCount}</span> recovered</>}
          </span>
        }
      >
        <HarvestDetail feedFetched={feedFetched} feedFailed={feedFailed} articlesSeen={articlesSeen} />
      </StageSection>

      <StageSection
        index={2}
        title="Classify"
        subtitle="AI gate — is this actionable threat research?"
        tone={classifyTone}
        summary={
          <span className="text-on-surface-variant">
            <span className="text-on-surface font-medium tabular-nums">{passed.length}</span> passed
            {' · '}
            <span className="text-on-surface tabular-nums">{skipped.length}</span> not relevant
            {classifyErr.length > 0 && <> · <span className="text-error tabular-nums">{classifyErr.length}</span> error{classifyErr.length === 1 ? '' : 's'}</>}
          </span>
        }
      >
        <ClassifyDetail passed={passed} skipped={skipped} errored={classifyErr} />
      </StageSection>

      <StageSection
        index={3}
        title="Rank & Select"
        subtitle="Score relevance and apply your daily article cap"
        tone={rankTone}
        summary={
          <span className="text-on-surface-variant">
            <span className="text-on-surface font-medium tabular-nums">{ranked.length}</span> selected
            {droppedDailyCap.length > 0 && <> · <span className="text-on-surface tabular-nums">{droppedDailyCap.length}</span> held by cap</>}
            {droppedFloor.length > 0 && <> · <span className="text-on-surface tabular-nums">{droppedFloor.length}</span> below floor</>}
          </span>
        }
      >
        <RankDetail ranked={ranked} droppedDailyCap={droppedDailyCap} droppedFloor={droppedFloor} />
      </StageSection>

      <StageSection
        index={4}
        title="Digest"
        subtitle="Full extraction — TTPs, IoCs, MITRE, library matches"
        tone={digestTone}
        summary={
          <span className="text-on-surface-variant">
            <span className="text-on-surface font-medium tabular-nums">{digested.length}</span> report{digested.length === 1 ? '' : 's'}
            {digestFailed.length > 0 && <> · <span className="text-error tabular-nums">{digestFailed.length}</span> failed</>}
            {digested.length > 0 && totalDigestMs > 0 && <> · <span className="text-on-surface-variant tabular-nums">{formatDuration(totalDigestMs)} total</span></>}
          </span>
        }
      >
        <DigestDetail digested={digested} failed={digestFailed} />
      </StageSection>

      <StageSection
        index={5}
        title="Link to Story"
        subtitle="Group multi-vendor coverage of the same story into one entry"
        tone={linkTone}
        summary={
          <span className="text-on-surface-variant">
            {linkActivity === 0 ? (
              <span className="text-on-surface-variant">not run</span>
            ) : (
              <>
                {linkCreated.length > 0 && <><span className="text-on-surface font-medium tabular-nums">{linkCreated.length}</span> new {linkCreated.length === 1 ? 'story' : 'stories'}</>}
                {linkCreated.length > 0 && (linkUpdated.length > 0 || linkSkipped.length > 0) && ' · '}
                {linkUpdated.length > 0 && <><span className="text-on-surface tabular-nums">{linkUpdated.length}</span> joined</>}
                {linkUpdated.length > 0 && linkSkipped.length > 0 && ' · '}
                {linkSkipped.length > 0 && <><span className="text-on-surface-variant tabular-nums">{linkSkipped.length}</span> standalone</>}
                {linkAmbiguous.length > 0 && <> · <span className="text-ext-amber tabular-nums">{linkAmbiguous.length}</span> ambiguous</>}
              </>
            )}
          </span>
        }
      >
        <LinkDetail
          evaluated={linkEvaluated}
          skipped={linkSkipped}
          ambiguous={linkAmbiguous}
          created={linkCreated}
          updated={linkUpdated}
        />
      </StageSection>
    </div>
  );
};
