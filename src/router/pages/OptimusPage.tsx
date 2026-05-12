import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AIAgentChat } from '../../components/AIAgentChat';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { useAppData } from '../AppDataContext';
import { Detection } from '../../types';
import { ROUTES } from '../routes';

export const OptimusPage: React.FC = () => {
  const navigate = useNavigate();
  const { detections } = useAppData();

  const handleOpenDraft = (draft: Partial<Detection>) => {
    sessionStorage.setItem('detectionDraft', JSON.stringify(draft));
    navigate(ROUTES.DETECTION_NEW);
  };

  return (
    <PageErrorBoundary pageName="AI Agent" onNavigateHome={() => navigate(ROUTES.HOME)}>
      <AIAgentChat detections={detections} onOpenDraft={handleOpenDraft} />
    </PageErrorBoundary>
  );
};

export default OptimusPage;
