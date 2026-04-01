import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DetectionStrategyDetailPage } from '../../components/strategies';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES, routeHelpers } from '../routes';
import { Status, Maturity, DetectionType, Severity, Confidence } from '../../types';

export const StrategyDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const handleBack = () => {
    navigate(ROUTES.STRATEGIES);
  };

  const handleNavigateToTechnique = (techniqueId: string) => {
    navigate(`${ROUTES.LIBRARY}?filter=${encodeURIComponent(techniqueId)}`);
  };

  const handleNavigateToGroup = (groupMitreId: string) => {
    navigate(routeHelpers.groupDetail(groupMitreId));
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
      maturity: Maturity.Experimental,
      detectionType: DetectionType.Detection,
      severity: Severity.Medium,
      confidence: Confidence.Medium,
    };
    sessionStorage.setItem('detectionDraft', JSON.stringify(draft));
    navigate(ROUTES.DETECTION_NEW);
  };

  return (
    <PageErrorBoundary pageName="Strategy Detail" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <DetectionStrategyDetailPage
        strategyStixId={id}
        onBack={handleBack}
        onNavigateToTechnique={handleNavigateToTechnique}
        onNavigateToGroup={handleNavigateToGroup}
        onCreateDetection={handleCreateDetection}
      />
    </PageErrorBoundary>
  );
};

export default StrategyDetailPage;
