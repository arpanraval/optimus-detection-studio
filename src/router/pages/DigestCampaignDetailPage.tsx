import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { CampaignDetailPage } from '../../components/threatintel/CampaignDetailPage';
import { ROUTES } from '../routes';

export const DigestCampaignDetailPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageErrorBoundary pageName="Story Detail" onNavigateHome={() => navigate(ROUTES.HOME)}>
      <CampaignDetailPage />
    </PageErrorBoundary>
  );
};

export default DigestCampaignDetailPage;
