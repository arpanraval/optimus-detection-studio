import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ScoringDocumentationPage } from '../../components/ScoringDocumentationPage';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES } from '../routes';

export const ScoringPage: React.FC = () => {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate(ROUTES.LIBRARY);
  };

  return (
    <PageErrorBoundary pageName="Scoring Settings" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <ScoringDocumentationPage onBack={handleBack} />
    </PageErrorBoundary>
  );
};

export default ScoringPage;
