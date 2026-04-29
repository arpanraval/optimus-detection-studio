import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { useAutoDigestEvents, type DigestEvent } from '../../hooks/useAutoDigestEvents';
import { routeHelpers } from '../../router/routes';
import type { AutoDigestJob } from '../../hooks/useAutoDigestSettings';

interface JobTranscriptProps {
  job: AutoDigestJob;
}

const EVENT_META: Record<DigestEvent['event_type'], { label: string; icon: string; tone: string }> = {
  feed_fetched:                { label: 'Feed fetched',          icon: 'rss',           tone: 'text-on-surface-variant' },
  feed_failed:                 { label: 'Feed failed',           icon: 'rss',           tone: 'text-red-400' },
  article_seen:                { label: 'Article harvested',     icon: 'file-text',     tone: 'text-on-surface-variant/70' },
  article_duplicate:           { label: 'Duplicate, skipped',    icon: 'copy',          tone: 'text-on-surface-variant/50' },
  article_classified:          { label: 'Classified',            icon: 'filter',        tone: 'text-on-surface-variant' },
  article_classify_failed:     { label: 'Classifier error',      icon: 'alert-triangle', tone: 'text-red-400' },
  article_relevance_dropped:   { label: 'Below relevance gate',  icon: 'arrow-down',    tone: 'text-on-surface-variant/60' },
  article_skipped_daily_limit: { label: 'Hit daily cap',         icon: 'clock',         tone: 'text-amber-400' },
  article_digested:            { label: 'Digested',              icon: 'check-circle',  tone: 'text-emerald-500' },
  article_digest_failed:       { label: 'Digest failed',         icon: 'x-circle',      tone: 'text-red-400' },
};

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function eventDestinationUrl(e: DigestEvent): string | null {
  // Digested -> our internal report. Everything else -> the original article URL.
  if (e.event_type === 'article_digested') {
    const reportId = (e.payload as any)?.report_id;
    if (reportId) return routeHelpers.threatIntelDetail(reportId);
  }
  return e.article_url || null;
}

function isInternalLink(url: string | null): boolean {
  return !!url && url.startsWith('/');
}

export const JobTranscript: React.FC<JobTranscriptProps> = ({ job }) => {
  const isLive = job.status === 'pending' || job.status === 'processing';
  const { events, isLoading } = useAutoDigestEvents(job.id, { live: isLive });

  // Group events by feed for hierarchical display, but preserve chronological
  // order within each feed and place feed-less events (rare — orchestrator-level
  // failures) at the top so they're not lost.
  const grouped = useMemo(() => {
    const map = new Map<string, { feedName: string; events: DigestEvent[] }>();
    const orphans: DigestEvent[] = [];
    for (const e of events) {
      const key = e.feed_id || (e.feed_name ? `name:${e.feed_name}` : '');
      if (!key) {
        orphans.push(e);
        continue;
      }
      const existing = map.get(key);
      if (existing) {
        existing.events.push(e);
      } else {
        map.set(key, { feedName: e.feed_name || 'Unknown feed', events: [e] });
      }
    }
    return { groups: [...map.values()], orphans };
  }, [events]);

  if (isLoading && events.length === 0) {
    return (
      <div className="flex items-center gap-2 px-2 py-3 text-xs text-on-surface-variant">
        <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        Loading transcript…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="px-2 py-3 text-xs text-on-surface-variant/60">
        No events recorded for this run yet.
      </div>
    );
  }

  return (
    <div className="space-y-3 px-2 py-3 border-l-2 border-outline-variant/20 ml-1.5">
      {grouped.orphans.length > 0 && (
        <EventList events={grouped.orphans} title="Orchestrator" />
      )}
      {grouped.groups.map((g) => (
        <EventList key={g.feedName} events={g.events} title={g.feedName} />
      ))}
    </div>
  );
};

const EventList: React.FC<{ events: DigestEvent[]; title: string }> = ({ events, title }) => (
  <div>
    <div className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest mb-1.5">
      {title}
    </div>
    <ul className="space-y-1">
      {events.map((e) => {
        const meta = EVENT_META[e.event_type];
        const dest = eventDestinationUrl(e);
        const internal = isInternalLink(dest);
        const titleNode = e.article_title ? (
          dest ? (
            internal ? (
              <Link to={dest} className="text-on-surface hover:text-primary truncate">{e.article_title}</Link>
            ) : (
              <a href={dest} target="_blank" rel="noopener noreferrer" className="text-on-surface hover:text-primary truncate">
                {e.article_title}
              </a>
            )
          ) : (
            <span className="text-on-surface truncate">{e.article_title}</span>
          )
        ) : null;

        return (
          <li key={e.id} className="flex items-start gap-2 text-xs">
            <span className="text-[10px] text-on-surface-variant/50 font-mono tabular-nums shrink-0 mt-0.5 w-14">
              {formatTime(e.created_at)}
            </span>
            <Icon name={meta.icon} className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${meta.tone}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.tone}`}>
                  {meta.label}
                </span>
                {e.duration_ms != null && (
                  <span className="text-[10px] text-on-surface-variant/50 tabular-nums">
                    {e.duration_ms < 1000 ? `${e.duration_ms}ms` : `${(e.duration_ms / 1000).toFixed(1)}s`}
                  </span>
                )}
              </div>
              {titleNode && <div className="mt-0.5 truncate">{titleNode}</div>}
              {e.reason && (
                <div className="text-[11px] text-on-surface-variant mt-0.5">{e.reason}</div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  </div>
);
