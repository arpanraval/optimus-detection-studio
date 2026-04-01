import React from 'react';
import { useNavigate } from 'react-router-dom';
import { IntegrationsPage as Integrations } from '../../components/IntegrationsPage';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES } from '../routes';

export const IntegrationsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageErrorBoundary pageName="Integrations" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <Integrations />
    </PageErrorBoundary>
  );
};

export default IntegrationsPage;
