import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MitreDashboard } from '../../components/MitreDashboard';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { useAppData } from '../AppDataContext';
import { ROUTES, routeHelpers } from '../routes';
import { Detection, Status, Maturity, DetectionType, Severity, Confidence } from '../../types';

export const MitreMatrixPage: React.FC = () => {
  const navigate = useNavigate();
  const { detections } = useAppData();
  const [includeMyLab, setIncludeMyLab] = useState(false);
  const scope = includeMyLab ? 'all' as const : 'production' as const;

  const handleNavigateToTechnique = (techniqueId: string) => {
    navigate(`${ROUTES.LIBRARY}?filter=${encodeURIComponent(techniqueId)}`);
  };

  const handleNavigateToDetection = (detectionId: string) => {
    navigate(routeHelpers.detectionDetail(detectionId));
  };

  const handleNavigateToGroup = (groupId: string) => {
    navigate(routeHelpers.groupDetail(groupId));
  };

  const handleNavigateToSoftware = (softwareId: string) => {
    navigate(routeHelpers.softwareDetail(softwareId));
  };

  const handleNavigateToCampaign = (campaignId: string) => {
    navigate(routeHelpers.campaignDetail(campaignId));
  };

  const handleCreateDetectionFromTechnique = (draft: Partial<Detection>) => {
    const fullDraft = {
      name: draft.name || '',
      description: draft.description || '',
      mitreAttackIds: draft.mitreTechniques || [],
      logSources: draft.dataSources || [],
      platforms: draft.platforms || [],
      status: Status.Draft,
      maturity: Maturity.Experimental,
      detectionType: DetectionType.Detection,
      severity: Severity.Medium,
      confidence: Confidence.Medium,
    };
    sessionStorage.setItem('detectionDraft', JSON.stringify(fullDraft));
    navigate(ROUTES.DETECTION_NEW);
  };

  return (
    <PageErrorBoundary pageName="MITRE Dashboard" onNavigateHome={() => navigate(ROUTES.DASHBOARD)}>
      <MitreDashboard
        detections={detections}
        scope={scope}
        onScopeChange={setIncludeMyLab}
        onNavigateToLibrary={handleNavigateToTechnique}
        onNavigateToTechnique={handleNavigateToTechnique}
        onNavigateToDetection={handleNavigateToDetection}
        onNavigateToGroup={handleNavigateToGroup}
        onNavigateToSoftware={handleNavigateToSoftware}
        onNavigateToCampaign={handleNavigateToCampaign}
        onCreateDetectionFromTechnique={handleCreateDetectionFromTechnique}
      />
    </PageErrorBoundary>
  );
};

export default MitreMatrixPage;
