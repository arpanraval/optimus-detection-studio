import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IntegrationDetail } from '../../components/integrations/IntegrationDetail';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES } from '../routes';

export const IntegrationDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  return (
    <PageErrorBoundary pageName="Integration Detail" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <IntegrationDetail
        integrationId={id!}
        onBack={() => navigate(ROUTES.INTEGRATIONS)}
      />
    </PageErrorBoundary>
  );
};

export default IntegrationDetailPage;
