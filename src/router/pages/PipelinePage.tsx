import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { KanbanBoard } from '../../components/kanban/KanbanBoard';

export const PipelinePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageErrorBoundary pageName="Detection Board" onNavigateHome={() => navigate(ROUTES.HOME)}>
      <KanbanBoard />
    </PageErrorBoundary>
  );
};

export default PipelinePage;
