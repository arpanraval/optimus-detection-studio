import React, { useEffect, useRef } from 'react';
import { Icon } from '../Icon';
import type { ThreatResearchEvent, ResearchAgent } from '../../types/threatResearch';

interface Props {
  events: ThreatResearchEvent[];
}

const AGENT_LABEL: Record<ResearchAgent, string> = {
  orchestrator:        'Orchestrator',
  preflight:           'Preflight',
  research:            'Research',
  'attack-researcher': 'Attack Researcher',
  'detection-engineer':'Detection Engineer',
  qa:                  'QA',
};

// All agent chips use container tokens so they auto-flip light/dark.
const AGENT_CHIP: Record<ResearchAgent, string> = {
  orchestrator:        'bg-surface-variant text-on-surface-variant',
  preflight:           'bg-secondary-container text-on-secondary-container',
  research:            'bg-primary-container text-on-primary-container',
  'attack-researcher': 'bg-tertiary-container text-on-tertiary-container',
  'detection-engineer':'bg-tertiary-container text-on-tertiary-container',
  qa:                  'bg-primary-container text-on-primary-container',
};

const EVENT_ICON: Record<string, string> = {
  agent_started:              'play',
  agent_iteration:            'rotate-cw',
  agent_tool_call:            'tool',
  agent_narration:            'message-square',
  agent_completed:            'check',
  agent_failed:               'x',
  preflight_started:          'compass',
  preflight_completed:        'check',
  behaviour_created:          'crosshair',
  opportunity_created:        'lightbulb',
  detection_generated:        'shield',
  qa_verdict:                 'check-circle',
  qa_refinement_started:      'rotate-cw',
  qa_refinement_completed:    'check-circle',
  session_completed:          'check',
  session_cancelled:          'pause',
  session_failed:             'alert-triangle',
  tool_call:                  'tool',
  tool_cache_hit:             'database',
};

export function ResearchActivityConsole({ events }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [events.length]);

  if (events.length === 0) {
    return (
      <aside className="flex h-full w-80 flex-col border-l border-outline-variant bg-surface-container">
        <div className="border-b border-outline-variant px-4 py-3 text-sm font-semibold text-on-surface">Activity</div>
        <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-on-surface-variant">
          Waiting for the first agent to start...
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-80 flex-col border-l border-outline-variant bg-surface-container">
      <div className="border-b border-outline-variant px-4 py-3 text-sm font-semibold text-on-surface">Activity</div>
      <div ref={scrollRef} className="flex-1 space-y-1.5 overflow-y-auto px-2 py-2">
        {events.map(ev => <EventItem key={ev.id} event={ev} />)}
      </div>
    </aside>
  );
}

function EventItem({ event }: { event: ThreatResearchEvent }) {
  const isNarration = event.event_type === 'agent_narration';
  const icon = EVENT_ICON[event.event_type] ?? 'circle';
  const agentChip = AGENT_CHIP[event.agent] ?? 'bg-surface-variant text-on-surface-variant';

  if (isNarration && event.narration) {
    return (
      <div className="rounded-md border border-outline-variant bg-surface px-3 py-2 text-xs text-on-surface">
        <div className="mb-1 flex items-center gap-1.5">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${agentChip}`}>{AGENT_LABEL[event.agent]}</span>
          <span className="text-on-surface-variant">thinking</span>
        </div>
        <div className="whitespace-pre-wrap leading-relaxed text-on-surface">{event.narration}</div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 px-2 py-1 text-xs">
      <Icon name={icon as any} size={12} className="mt-0.5 flex-shrink-0 text-on-surface-variant" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${agentChip}`}>{AGENT_LABEL[event.agent]}</span>
          <span className="text-on-surface">{event.event_type.replace(/_/g, ' ')}</span>
        </div>
        {event.message && <div className="mt-0.5 truncate text-on-surface-variant">{event.message}</div>}
      </div>
    </div>
  );
}

export default ResearchActivityConsole;
