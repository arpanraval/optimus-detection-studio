import React from 'react';
import { Icon } from '../Icon';
import type { Playbook } from '../../lib/playbooks/types';

const CATEGORY_COLORS: Record<string, string> = {
  'threat-assessment': 'bg-red-500/10 text-red-400 border-red-500/20',
  'quality': 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  'reporting': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

const CATEGORY_LABELS: Record<string, string> = {
  'threat-assessment': 'Threat Assessment',
  'quality': 'Quality',
  'reporting': 'Reporting',
};

interface PlaybookCardProps {
  playbook: Playbook;
  onRun: (playbook: Playbook) => void;
  isRunning?: boolean;
}

export const PlaybookCard: React.FC<PlaybookCardProps> = ({ playbook, onRun, isRunning }) => {
  const categoryClass = CATEGORY_COLORS[playbook.category] || 'bg-surface-container-highest text-on-surface-variant';

  return (
    <div className="bg-surface-container rounded-xl border border-outline-variant/20 hover:border-outline-variant/40 transition-all overflow-hidden">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-surface-container-highest">
              <Icon name={playbook.icon} className="w-5 h-5 text-on-surface" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-on-surface">{playbook.name}</h3>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${categoryClass}`}>
                {CATEGORY_LABELS[playbook.category] || playbook.category}
              </span>
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-on-surface-variant leading-relaxed mb-4">
          {playbook.description}
        </p>

        {/* Meta */}
        <div className="flex items-center gap-3 text-xs text-on-surface-variant/60 mb-4">
          <span className="flex items-center gap-1">
            <Icon name="layers" className="w-3 h-3" />
            {playbook.steps.length} steps
          </span>
          <span className="flex items-center gap-1">
            <Icon name="clock" className="w-3 h-3" />
            {playbook.estimatedDuration}
          </span>
          {playbook.requiresInput && (
            <span className="flex items-center gap-1">
              <Icon name="edit" className="w-3 h-3" />
              Requires input
            </span>
          )}
        </div>

        {/* Run button */}
        <button
          onClick={() => onRun(playbook)}
          disabled={isRunning}
          className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            isRunning
              ? 'bg-surface-container-highest text-on-surface-variant cursor-wait'
              : 'bg-primary text-on-primary hover:brightness-110 active:scale-[0.98]'
          }`}
        >
          {isRunning ? (
            <>
              <Icon name="loader" className="w-4 h-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Icon name="play" className="w-4 h-4" />
              Run Assessment
            </>
          )}
        </button>
      </div>
    </div>
  );
};
