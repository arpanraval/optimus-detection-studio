import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DetectionPacksPage } from '../../components/packs';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES, routeHelpers } from '../routes';

export const PacksPage: React.FC = () => {
  const navigate = useNavigate();

  const handleSelectPack = (packId: string) => {
    navigate(routeHelpers.packDetail(packId));
  };

  return (
    <PageErrorBoundary pageName="Detection Packs" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <DetectionPacksPage onSelectPack={handleSelectPack} />
    </PageErrorBoundary>
  );
};

export default PacksPage;
