import React from 'react';
import { Modal } from '../ui/Modal';
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
}) => (
  <Modal title="Finetune with AI" subject={{ label: 'Detection', value: detection.name }} onClose={onClose}>
    <SiemFinetunePanel
      detection={detection}
      integrationId={integrationId}
      windowDays={windowDays}
      baselineHitCount={baselineHitCount}
      preflightRunId={preflightRunId}
      onApplyRefinement={onApplyRefinement}
    />
  </Modal>
);
