import React from 'react';
import { Modal } from '../ui/Modal';
import { CrowdStrikeFinetunePanel } from './CrowdStrikeFinetunePanel';
import type { Detection } from '../../types';
import type { CrowdStrikeFinetuneRefinement } from '../../types/crowdstrikeFinetune';

export function CrowdStrikeFinetuneModal({
  detection,
  integrationId,
  preflightRunId,
  windowDays,
  baselineHitCount,
  onApplyRefinement,
  onClose,
}: {
  detection: Detection;
  integrationId: string;
  preflightRunId: string;
  windowDays: number;
  baselineHitCount: number;
  onApplyRefinement: (refinement: CrowdStrikeFinetuneRefinement) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Finetune CrowdStrike CQL with AI"
      subject={{ label: 'Detection', value: detection.name }}
      onClose={onClose}
    >
      <CrowdStrikeFinetunePanel
        detection={detection}
        integrationId={integrationId}
        preflightRunId={preflightRunId}
        windowDays={windowDays}
        baselineHitCount={baselineHitCount}
        onApplyRefinement={onApplyRefinement}
      />
    </Modal>
  );
}
