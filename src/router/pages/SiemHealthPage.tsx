import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SiemHealthDashboard } from '../../components/siem/SiemHealthDashboard';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES } from '../routes';

export function SiemHealthPage() {
  const navigate = useNavigate();

  return (
    <PageErrorBoundary pageName="SIEM Health" onNavigateHome={() => navigate(ROUTES.DASHBOARD)}>
      <SiemHealthDashboard />
    </PageErrorBoundary>
  );
}

export default SiemHealthPage;
