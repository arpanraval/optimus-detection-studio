import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DetectionPackDetailPage } from '../../components/packs';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES, routeHelpers } from '../routes';

export const PackDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const handleBack = () => {
    navigate(ROUTES.PACKS);
  };

  const handleSelectDetection = (detection: { id: string }) => {
    navigate(routeHelpers.detectionDetail(detection.id));
  };

  return (
    <PageErrorBoundary pageName="Pack Detail" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <DetectionPackDetailPage
        packId={id!}
        onBack={handleBack}
        onSelectDetection={handleSelectDetection}
      />
    </PageErrorBoundary>
  );
};

export default PackDetailPage;
