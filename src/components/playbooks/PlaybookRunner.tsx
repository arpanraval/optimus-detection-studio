import React from 'react';
import { Icon } from '../Icon';
import type { PlaybookRun } from '../../lib/playbooks/types';
import type { Playbook } from '../../lib/playbooks/types';

interface PlaybookRunnerProps {
  playbook: Playbook;
  run: PlaybookRun;
}

export const PlaybookRunner: React.FC<PlaybookRunnerProps> = ({ playbook, run }) => {
  return (
    <div className="bg-surface-container rounded-xl border border-outline-variant/20 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-surface-container-highest">
          <Icon name={playbook.icon} className="w-5 h-5 text-on-surface" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-on-surface">{playbook.name}</h3>
          <p className="text-xs text-on-surface-variant">
            {run.status === 'running' ? 'Running analysis...' :
             run.status === 'completed' ? 'Analysis complete' :
             run.status === 'error' ? 'Analysis failed' : 'Preparing...'}
          </p>
        </div>
        {run.status === 'running' && (
          <Icon name="loader" className="w-5 h-5 animate-spin text-primary ml-auto" />
        )}
        {run.status === 'completed' && (
          <Icon name="check-circle" className="w-5 h-5 text-green-500 ml-auto" />
        )}
        {run.status === 'error' && (
          <Icon name="x-circle" className="w-5 h-5 text-error ml-auto" />
        )}
      </div>

      {/* Step progress */}
      <div className="space-y-2">
        {playbook.steps.map((step, idx) => {
          const result = run.stepResults[step.id];
          const status = result?.status || 'pending';

          return (
            <div
              key={step.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-container-high/50"
            >
              <span className="text-xs text-on-surface-variant/60 font-mono w-5">
                {idx + 1}
              </span>

              {status === 'completed' && (
                <Icon name="check-circle" className="w-4 h-4 text-green-500 flex-shrink-0" />
              )}
              {status === 'running' && (
                <Icon name="loader" className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
              )}
              {status === 'error' && (
                <Icon name="x-circle" className="w-4 h-4 text-error flex-shrink-0" />
              )}
              {status === 'pending' && (
                <div className="w-4 h-4 rounded-full border-2 border-outline-variant/30 flex-shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-on-surface truncate">{step.name}</p>
                <p className="text-[10px] text-on-surface-variant truncate">{step.description}</p>
              </div>

              {result?.error && (
                <span className="text-[10px] text-error truncate max-w-32">{result.error}</span>
              )}
            </div>
          );
        })}
      </div>

      {run.error && (
        <div className="mt-4 p-3 rounded-lg bg-error/10 border border-error/20">
          <p className="text-sm text-error">{run.error}</p>
        </div>
      )}
    </div>
  );
};
