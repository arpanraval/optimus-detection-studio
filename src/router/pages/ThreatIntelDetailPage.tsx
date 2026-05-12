import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ThreatIntelReportPage } from '../../components/threatintel/ThreatIntelReportPage';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES } from '../routes';

export const ThreatIntelDetailPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageErrorBoundary pageName="Report Analysis" onNavigateHome={() => navigate(ROUTES.HOME)}>
      <ThreatIntelReportPage />
    </PageErrorBoundary>
  );
};

export default ThreatIntelDetailPage;
