import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { MyAiUsagePage as Inner } from '../../components/account/MyAiUsagePage';
import { ROUTES } from '../routes';

export const MyAiUsagePage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <PageErrorBoundary pageName="My AI Usage" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <Inner />
    </PageErrorBoundary>
  );
};

export default MyAiUsagePage;
