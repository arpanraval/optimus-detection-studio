import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SigmaConverter } from '../../components/SigmaConverter';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { Detection } from '../../types';
import { ROUTES } from '../routes';

export const SigmaConverterPage: React.FC = () => {
  const navigate = useNavigate();

  const handleCreateDraft = (draft: Partial<Detection>) => {
    sessionStorage.setItem('detectionDraft', JSON.stringify(draft));
    navigate(ROUTES.DETECTION_NEW);
  };

  return (
    <PageErrorBoundary pageName="Sigma Converter" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <SigmaConverter onCreateDraft={handleCreateDraft} />
    </PageErrorBoundary>
  );
};

export default SigmaConverterPage;
