import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icon';
import type { ThreatResearchEvent, ResearchAgent } from '../../types/threatResearch';

interface Props {
  events: ThreatResearchEvent[];
  /** Whether the panel is open. When false, only an edge handle is visible. */
  open: boolean;
  onToggle: () => void;
}

const ALL_AGENTS: ResearchAgent[] = [
  'orchestrator', 'preflight', 'research', 'attack-researcher', 'detection-engineer', 'qa',
];

const AGENT_LABEL: Record<ResearchAgent, string> = {
  orchestrator:        'Orch',
  preflight:           'Preflight',
  research:            'Research',
  'attack-researcher': 'Attack',
  'detection-engineer':'Engineer',
  qa:                  'QA',
};

const AGENT_DOT: Record<ResearchAgent, string> = {
  orchestrator:        'bg-surface-variant',
  preflight:           'bg-secondary',
  research:            'bg-primary',
  'attack-researcher': 'bg-tertiary',
  'detection-engineer':'bg-tertiary',
  qa:                  'bg-primary',
};

export function ResearchActivityConsole({ events, open, onToggle }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Filter state — agent + free-text. Stored locally so a session reload
  // doesn't clobber a user's narrowing while debugging a specific agent.
  const [agentFilter, setAgentFilter] = useState<ResearchAgent | 'all'>('all');
  const [textFilter, setTextFilter] = useState('');

  const filtered = useMemo(() => {
    if (agentFilter === 'all' && !textFilter) return events;
    const needle = textFilter.toLowerCase();
    return events.filter(ev => {
      if (agentFilter !== 'all' && ev.agent !== agentFilter) return false;
      if (!needle) return true;
      const blob = `${ev.event_type} ${ev.message ?? ''} ${ev.narration ?? ''}`.toLowerCase();
      return blob.includes(needle);
    });
  }, [events, agentFilter, textFilter]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [filtered.length]);

  // Panel + handle live in a single positioned container so they slide
  // together. The handle uses negative left offset to stick out flush
  // against the panel's left edge — guaranteed visually attached.
  return (
    <div
      className={`absolute right-3 top-3 bottom-3 z-20 flex h-[calc(100%-1.5rem)] w-[440px] transform transition-transform duration-200 ${
        open ? 'translate-x-0' : 'translate-x-[440px]'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={open ? 'Close activity panel' : 'Open activity panel'}
        className="absolute -left-7 top-1/2 z-10 flex h-12 w-7 -translate-y-1/2 items-center justify-center rounded-l-xl border border-r-0 border-outline-variant bg-surface text-on-surface-variant shadow-sm hover:bg-surface-container"
      >
        <Icon name={open ? 'chevron-right' : 'chevron-left'} size={14} />
      </button>

      <aside className="flex h-full w-full flex-col rounded-2xl border border-outline-variant bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-outline-variant px-5 py-3">
          <div className="text-sm font-semibold text-on-surface">Activity</div>
          <div className="text-xs text-on-surface-variant">
            {filtered.length === events.length ? events.length : `${filtered.length} / ${events.length}`}
          </div>
        </div>

        {/* Filter bar — only visible when there's anything to filter. */}
        {events.length > 0 && (
          <div className="flex items-center gap-2 border-b border-outline-variant px-3 py-2">
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value as ResearchAgent | 'all')}
              className="rounded-md border border-outline-variant bg-surface px-2 py-1 text-xs text-on-surface focus:border-primary focus:outline-none"
            >
              <option value="all">All agents</option>
              {ALL_AGENTS.map(a => <option key={a} value={a}>{AGENT_LABEL[a]}</option>)}
            </select>
            <input
              type="text"
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              placeholder="Filter messages…"
              className="flex-1 rounded-md border border-outline-variant bg-surface px-2 py-1 text-xs text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
            />
            {(agentFilter !== 'all' || textFilter) && (
              <button
                type="button"
                onClick={() => { setAgentFilter('all'); setTextFilter(''); }}
                aria-label="Clear filters"
                className="text-on-surface-variant hover:text-on-surface"
              >
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
        )}

        {events.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-on-surface-variant">
            Waiting for the first agent to start…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-on-surface-variant">
            No events match the current filter.
          </div>
        ) : (
          <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
            {filtered.map(ev => <EventItem key={ev.id} event={ev} />)}
          </div>
        )}
      </aside>
    </div>
  );
}

function EventItem({ event }: { event: ThreatResearchEvent }) {
  const isNarration = event.event_type === 'agent_narration';
  const dot = AGENT_DOT[event.agent] ?? 'bg-surface-variant';
  // Click-to-expand for long messages so the default state stays compact
  // while letting users read the full text (tool args, behaviour ids,
  // queries) when investigating. Previously the `truncate` class hard-cut
  // these to one line with no recourse. Declared before any conditional
  // return so the hook count is stable across renders.
  const [expanded, setExpanded] = useState(false);
  const isLong = !!event.message && event.message.length > 80;

  if (isNarration && event.narration) {
    return (
      <div className="rounded-xl border border-outline-variant bg-surface-container px-3 py-2">
        <div className="mb-1 flex items-center gap-2">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
          <span className="text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
            {AGENT_LABEL[event.agent]} · thinking
          </span>
        </div>
        <div className="whitespace-pre-wrap text-xs leading-relaxed text-on-surface">{event.narration}</div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => isLong && setExpanded(v => !v)}
      className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left ${
        isLong ? 'cursor-pointer hover:bg-surface-container' : 'cursor-default'
      }`}
    >
      <span className={`mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
            {AGENT_LABEL[event.agent]}
          </span>
          <span className="truncate text-xs text-on-surface">
            {event.event_type.replace(/_/g, ' ')}
          </span>
        </div>
        {event.message && (
          <div
            className={expanded
              ? 'whitespace-pre-wrap break-words text-[11px] text-on-surface-variant'
              : 'text-[11px] text-on-surface-variant'}
            style={expanded ? undefined : {
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}
          >
            {event.message}
          </div>
        )}
      </div>
    </button>
  );
}

export default ResearchActivityConsole;
