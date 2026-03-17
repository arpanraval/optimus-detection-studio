import React from 'react';
import { useNavigate } from 'react-router-dom';
import { WorkspacesListPage } from '../../components/workspaces';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES, routeHelpers } from '../routes';

export const WorkspacesPage: React.FC = () => {
  const navigate = useNavigate();

  const handleSelectWorkspace = (workspaceId: string) => {
    navigate(routeHelpers.workspaceDetail(workspaceId));
  };

  return (
    <PageErrorBoundary pageName="Workspaces" onNavigateHome={() => navigate(ROUTES.DASHBOARD)}>
      <WorkspacesListPage onSelectWorkspace={handleSelectWorkspace} />
    </PageErrorBoundary>
  );
};

export default WorkspacesPage;
