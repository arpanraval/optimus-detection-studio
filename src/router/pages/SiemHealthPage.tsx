import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SiemLandingPage } from '../../components/siem/SiemLandingPage';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES } from '../routes';

export function SiemHealthPage() {
  const navigate = useNavigate();

  return (
    <PageErrorBoundary pageName="SIEM Home" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <div className="px-4 lg:px-6 py-4 pb-16">
        <SiemLandingPage />
      </div>
    </PageErrorBoundary>
  );
}

export default SiemHealthPage;
