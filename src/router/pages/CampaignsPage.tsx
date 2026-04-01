import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CampaignsLibrary } from '../../components/campaigns/CampaignsLibrary';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES, routeHelpers } from '../routes';
import { Campaign } from '../../hooks/useCampaigns';

export const CampaignsPage: React.FC = () => {
  const navigate = useNavigate();

  const handleSelectCampaign = (campaign: Campaign) => {
    navigate(routeHelpers.campaignDetail(campaign.mitre_id));
  };

  return (
    <PageErrorBoundary pageName="Campaigns" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <CampaignsLibrary onSelectCampaign={handleSelectCampaign} onNavigateToGroup={(id) => navigate(routeHelpers.groupDetail(id))} />
    </PageErrorBoundary>
  );
};

export default CampaignsPage;
