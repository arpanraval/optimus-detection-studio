import React from 'react';
import { ThreatGroupCards } from './ThreatGroupCards';
import { CriticalGapsList } from './CriticalGapsList';
import type { ThreatGroupSummary, GroupTechniqueDetail, GapTechnique } from '../../../hooks/useProfileIntelligence';

interface ThreatGapIntelligenceProps {
  threatGroups: ThreatGroupSummary[];
  groupTechniqueDetails: Record<string, GroupTechniqueDetail[]>;
  gapTechniques: GapTechnique[];
  crownJewels: string[];
  sectorLabel: string | null;
  loading: boolean;
}

export const ThreatGapIntelligence: React.FC<ThreatGapIntelligenceProps> = ({
  threatGroups,
  groupTechniqueDetails,
  gapTechniques,
  crownJewels,
  sectorLabel,
  loading,
}) => {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-1.5">
      {/* Left: Threat Groups */}
      <div className="bg-surface-container-lowest rounded-2xl p-5">
        <ThreatGroupCards
          groups={threatGroups}
          groupTechniqueDetails={groupTechniqueDetails}
          sectorLabel={sectorLabel}
          loading={loading}
        />
      </div>

      {/* Right: Critical Gaps */}
      <div className="bg-surface-container-lowest rounded-2xl p-5">
        <CriticalGapsList
          gaps={gapTechniques}
          crownJewels={crownJewels}
          loading={loading}
        />
      </div>
    </div>
  );
};
