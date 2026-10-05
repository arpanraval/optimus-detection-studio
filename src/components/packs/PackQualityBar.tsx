import React from 'react';
import type { Detection, DetectionPack } from '../../types';
import { packEligibility } from '../../lib/packValidation';
interface Props {
  pack: Pick<DetectionPack, 'platforms'>;
  detections: Detection[];
}
export const PackQualityBar: React.FC<Props> = ({ pack, detections }) => {
  const { eligible, ineligible, total } = packEligibility(pack, detections);
  if (!total) return null;
  return (
    <section className="space-y-3" aria-label="Deployment eligibility">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-on-surface text-sm">Deployment eligibility</h3>
        <span className="text-xs text-on-surface-variant">
          {eligible} of {total} eligible
        </span>
      </div>
      <div
        className="h-1.5 bg-surface-container-highest rounded-full overflow-hidden"
        role="meter"
        aria-label="Eligible detections"
        aria-valuenow={eligible}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div className="h-full bg-primary" style={{ width: `${(eligible / total) * 100}%` }} />
      </div>
      <p className="text-xs text-on-surface-variant">
        {eligible} eligible; {ineligible} need review
      </p>
      <p className="text-xs text-on-surface-variant leading-relaxed">
        Checks library, status and query language. The deployment preview checks the selected connection and existing
        rules. Microsoft query validation is separate.
      </p>
    </section>
  );
};
