import React from 'react';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { PlaybooksPage as PlaybooksPageComponent } from '../../components/playbooks/PlaybooksPage';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes';

export const PlaybooksPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageErrorBoundary pageName="Playbooks" onNavigateHome={() => navigate(ROUTES.HOME)}>
      <PlaybooksPageComponent />
    </PageErrorBoundary>
  );
};

export default PlaybooksPage;
