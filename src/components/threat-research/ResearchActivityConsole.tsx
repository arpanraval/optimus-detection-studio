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

const AGENT_COLOR: Record<ResearchAgent, string> = {
  orchestrator:        'text-gray-700 bg-gray-100',
  preflight:           'text-blue-700 bg-blue-100',
  research:            'text-violet-700 bg-violet-100',
  'attack-researcher': 'text-orange-700 bg-orange-100',
  'detection-engineer':'text-emerald-700 bg-emerald-100',
  qa:                  'text-pink-700 bg-pink-100',
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
      <aside className="flex h-full w-80 flex-col border-l bg-gray-50">
        <div className="border-b px-4 py-3 text-sm font-semibold">Activity</div>
        <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-gray-500">
          Waiting for the first agent to start...
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-80 flex-col border-l bg-gray-50">
      <div className="border-b px-4 py-3 text-sm font-semibold">Activity</div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
        {events.map(ev => <EventItem key={ev.id} event={ev} />)}
      </div>
    </aside>
  );
}

function EventItem({ event }: { event: ThreatResearchEvent }) {
  const isNarration = event.event_type === 'agent_narration';
  const icon = EVENT_ICON[event.event_type] ?? 'circle';
  const agentChip = AGENT_COLOR[event.agent] ?? 'text-gray-700 bg-gray-100';

  if (isNarration && event.narration) {
    return (
      <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800">
        <div className="mb-1 flex items-center gap-1.5">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${agentChip}`}>{AGENT_LABEL[event.agent]}</span>
          <span className="text-gray-400">thinking</span>
        </div>
        <div className="whitespace-pre-wrap leading-relaxed text-gray-700">{event.narration}</div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 px-2 py-1 text-xs">
      <Icon name={icon as any} size={12} className="mt-0.5 flex-shrink-0 text-gray-500" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${agentChip}`}>{AGENT_LABEL[event.agent]}</span>
          <span className="text-gray-700">{event.event_type.replace(/_/g, ' ')}</span>
        </div>
        {event.message && <div className="mt-0.5 truncate text-gray-600">{event.message}</div>}
      </div>
    </div>
  );
}

export default ResearchActivityConsole;
