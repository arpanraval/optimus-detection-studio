import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GroupDetailPage as DetailPage } from '../../components/groups/GroupDetailPage';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { useAppData } from '../AppDataContext';
import { ROUTES, routeHelpers } from '../routes';
import { Status, Maturity, DetectionType, Severity, Confidence } from '../../types';

export const GroupDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { detections } = useAppData();

  const handleBack = () => {
    navigate(ROUTES.GROUPS);
  };

  const handleNavigateToSoftware = (softwareId: string) => {
    navigate(routeHelpers.softwareDetail(softwareId));
  };

  const handleNavigateToCampaign = (campaignId: string) => {
    navigate(routeHelpers.campaignDetail(campaignId));
  };

  const handleNavigateToTechnique = (techniqueId: string) => {
    navigate(`${ROUTES.LIBRARY}?filter=${encodeURIComponent(techniqueId)}`);
  };

  const handleNavigateToStrategy = (strategyStixId: string) => {
    navigate(routeHelpers.strategyDetail(strategyStixId));
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
    // Store draft in session storage and navigate to form
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
    <PageErrorBoundary pageName="Group Detail" onNavigateHome={() => navigate(ROUTES.DASHBOARD)}>
      <DetailPage
        groupId={id}
        onBack={handleBack}
        detections={detections}
        onNavigateToSoftware={handleNavigateToSoftware}
        onNavigateToCampaign={handleNavigateToCampaign}
        onNavigateToTechnique={handleNavigateToTechnique}
        onNavigateToStrategy={handleNavigateToStrategy}
        onCreateDetection={handleCreateDetection}
      />
    </PageErrorBoundary>
  );
};

export default GroupDetailPage;
