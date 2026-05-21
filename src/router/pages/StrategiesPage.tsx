import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DetectionStrategiesLibrary } from '../../components/strategies';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES, routeHelpers } from '../routes';
import { Status, DetectionType, Severity } from '../../types';

export const StrategiesPage: React.FC = () => {
  const navigate = useNavigate();

  const handleSelectStrategy = (stixId: string) => {
    navigate(routeHelpers.strategyDetail(stixId));
  };

  const handleNavigateToTechnique = (techniqueId: string) => {
    navigate(`${ROUTES.LIBRARY}?filter=${encodeURIComponent(techniqueId)}`);
  };

  const handleCreateDetection = (prefill: {
    name?: string;
    description?: string;
    mitreAttackIds?: string[];
    logSources?: string[];
    platforms?: string[];
    technology?: string;
    linkedGroups?: { stix_id: string; mitre_id: string; name: string }[];
    linkedCampaigns?: { stix_id: string; mitre_id: string; name: string }[];
  }) => {
    const draft = {
      name: prefill.name || '',
      description: prefill.description || '',
      mitreAttackIds: prefill.mitreAttackIds || [],
      logSources: prefill.logSources || [],
      platforms: prefill.platforms || [],
      technology: prefill.technology || '',
      linkedGroups: prefill.linkedGroups || [],
      linkedCampaigns: prefill.linkedCampaigns || [],
      status: Status.Draft,
      detectionType: DetectionType.Detection,
      severity: Severity.Medium,
    };
    sessionStorage.setItem('detectionDraft', JSON.stringify(draft));
    navigate(ROUTES.DETECTION_NEW);
  };

  return (
    <PageErrorBoundary pageName="Detection Strategies" onNavigateHome={() => navigate(ROUTES.HOME)}>
      <DetectionStrategiesLibrary
        onSelectStrategy={handleSelectStrategy}
        onNavigateToTechnique={handleNavigateToTechnique}
        onCreateDetection={handleCreateDetection}
      />
    </PageErrorBoundary>
  );
};

export default StrategiesPage;
