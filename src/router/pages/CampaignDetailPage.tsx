import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CampaignDetailPage as DetailPage } from '../../components/campaigns/CampaignDetailPage';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { useAppData } from '../AppDataContext';
import { ROUTES, routeHelpers } from '../routes';
import { Status, DetectionType, Severity } from '../../types';

export const CampaignDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { detections } = useAppData();

  const handleBack = () => {
    navigate(ROUTES.CAMPAIGNS);
  };

  const handleNavigateToGroup = (groupId: string) => {
    navigate(routeHelpers.groupDetail(groupId));
  };

  const handleNavigateToSoftware = (softwareId: string) => {
    navigate(routeHelpers.softwareDetail(softwareId));
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
    <PageErrorBoundary pageName="Campaign Detail" onNavigateHome={() => navigate(ROUTES.HOME)}>
      <DetailPage
        campaignId={id}
        onBack={handleBack}
        detections={detections}
        onNavigateToGroup={handleNavigateToGroup}
        onNavigateToSoftware={handleNavigateToSoftware}
        onNavigateToTechnique={handleNavigateToTechnique}
        onNavigateToStrategy={handleNavigateToStrategy}
        onCreateDetection={handleCreateDetection}
      />
    </PageErrorBoundary>
  );
};

export default CampaignDetailPage;
