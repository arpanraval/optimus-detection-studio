import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ThreatIntelLibraryPage } from '../../components/threatintel/ThreatIntelLibraryPage';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES } from '../routes';

export const ThreatIntelPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageErrorBoundary pageName="Intelligence Reports" onNavigateHome={() => navigate(ROUTES.DASHBOARD)}>
      <ThreatIntelLibraryPage />
    </PageErrorBoundary>
  );
};

export default ThreatIntelPage;
