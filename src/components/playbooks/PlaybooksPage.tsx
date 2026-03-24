import React, { useState } from 'react';
import { Icon } from '../Icon';
import { PLAYBOOKS } from '../../lib/playbooks';
import type { Playbook } from '../../lib/playbooks/types';
import { PlaybookCard } from './PlaybookCard';
import { PlaybookRunner } from './PlaybookRunner';
import { PlaybookReport } from './PlaybookReport';
import { usePlaybookRunner } from '../../hooks/usePlaybookRunner';

export const PlaybooksPage: React.FC = () => {
  const { run, isRunning, executePlaybook, reset } = usePlaybookRunner();
  const [activePlaybook, setActivePlaybook] = useState<Playbook | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [showInputModal, setShowInputModal] = useState(false);

  const handleRun = (playbook: Playbook) => {
    if (playbook.requiresInput) {
      setActivePlaybook(playbook);
      setInputValue('');
      setShowInputModal(true);
      return;
    }

    setActivePlaybook(playbook);
    executePlaybook(playbook);
  };

  const handleInputSubmit = () => {
    if (!activePlaybook?.requiresInput || !inputValue.trim()) return;
    setShowInputModal(false);
    executePlaybook(activePlaybook, { [activePlaybook.requiresInput.key]: inputValue.trim() });
  };

  const handleClose = () => {
    reset();
    setActivePlaybook(null);
  };

  // Show report if completed
  if (run?.status === 'completed' && activePlaybook) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <PlaybookReport playbook={activePlaybook} run={run} onClose={handleClose} />
      </div>
    );
  }

  // Show runner if in progress
  if (run && (run.status === 'running' || run.status === 'error') && activePlaybook) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <PlaybookRunner playbook={activePlaybook} run={run} />

        {run.status === 'error' && (
          <div className="flex justify-center">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors"
            >
              Back to Playbooks
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Icon name="zap" className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-on-surface">Playbooks</h1>
            <p className="text-sm text-on-surface-variant">
              Guided multi-step analysis workflows for detection coverage assessment
            </p>
          </div>
        </div>
      </div>

      {/* Playbook grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PLAYBOOKS.map((playbook) => (
          playbook.disabled ? (
            <div key={playbook.id} className="opacity-40 pointer-events-none relative">
              <PlaybookCard playbook={playbook} onRun={() => {}} isRunning={false} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="px-3 py-1.5 rounded-lg bg-surface-container-highest/90 text-xs font-medium text-on-surface-variant border border-outline/20">
                  Coming Soon
                </span>
              </div>
            </div>
          ) : (
            <PlaybookCard
              key={playbook.id}
              playbook={playbook}
              onRun={handleRun}
              isRunning={isRunning && activePlaybook?.id === playbook.id}
            />
          )
        ))}
      </div>

      {/* Input modal */}
      {showInputModal && activePlaybook?.requiresInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowInputModal(false)}
          />
          <div className="relative bg-surface-container-high border border-outline-variant/30 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <h3 className="text-lg font-semibold text-on-surface">{activePlaybook.name}</h3>
              <p className="text-sm text-on-surface-variant mt-1">
                {activePlaybook.requiresInput.label}
              </p>
            </div>
            <div className="px-6 pb-4">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={activePlaybook.requiresInput.placeholder}
                className="w-full px-4 py-2.5 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleInputSubmit()}
              />
            </div>
            <div className="px-6 py-4 bg-surface-container flex justify-end gap-3">
              <button
                onClick={() => setShowInputModal(false)}
                className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleInputSubmit}
                disabled={!inputValue.trim()}
                className="px-4 py-2 text-sm font-medium bg-primary text-on-primary rounded-lg hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                <Icon name="play" className="w-4 h-4" />
                Run
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
