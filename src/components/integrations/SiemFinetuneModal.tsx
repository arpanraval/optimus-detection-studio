import React, { useEffect } from 'react';
import { Icon } from '../Icon';
import { SiemFinetunePanel } from './SiemFinetunePanel';
import type { Detection } from '../../types';
import type { FinetuneRefinement } from '../../types/finetune';

interface SiemFinetuneModalProps {
  detection: Detection;
  integrationId: string;
  windowDays: number;
  baselineHitCount: number;
  preflightRunId?: string;
  onApplyRefinement: (refinement: FinetuneRefinement) => void;
  onClose: () => void;
}

export const SiemFinetuneModal: React.FC<SiemFinetuneModalProps> = ({
  detection, integrationId, windowDays, baselineHitCount, preflightRunId,
  onApplyRefinement, onClose,
}) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="finetune-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <div className="bg-surface-container rounded-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto shadow-2xl border border-outline-variant/20">
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/10">
          <div>
            <h2 id="finetune-modal-title" className="text-lg font-semibold text-on-surface">
              Finetune with AI
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">{detection.name}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg hover:bg-surface-container-high transition-colors"
          >
            <Icon name="x" className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>
        <div className="p-5">
          <SiemFinetunePanel
            detection={detection}
            integrationId={integrationId}
            windowDays={windowDays}
            baselineHitCount={baselineHitCount}
            preflightRunId={preflightRunId}
            onApplyRefinement={onApplyRefinement}
          />
        </div>
      </div>
    </div>
  );
};
