import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SoftwareDetailPage as DetailPage } from '../../components/software/SoftwareDetailPage';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { useAppData } from '../AppDataContext';
import { ROUTES, routeHelpers } from '../routes';

export const SoftwareDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { detections } = useAppData();

  const handleBack = () => {
    navigate(ROUTES.SOFTWARE);
  };

  const handleNavigateToGroup = (groupId: string) => {
    navigate(routeHelpers.groupDetail(groupId));
  };

  const handleNavigateToCampaign = (campaignId: string) => {
    navigate(routeHelpers.campaignDetail(campaignId));
  };

  const handleNavigateToTechnique = (techniqueId: string) => {
    navigate(`${ROUTES.LIBRARY}?filter=${encodeURIComponent(techniqueId)}`);
  };

  return (
    <PageErrorBoundary pageName="Software Detail" onNavigateHome={() => navigate(ROUTES.DASHBOARD)}>
      <DetailPage
        softwareId={id}
        onBack={handleBack}
        detections={detections}
        onNavigateToGroup={handleNavigateToGroup}
        onNavigateToCampaign={handleNavigateToCampaign}
        onNavigateToTechnique={handleNavigateToTechnique}
      />
    </PageErrorBoundary>
  );
};

export default SoftwareDetailPage;
