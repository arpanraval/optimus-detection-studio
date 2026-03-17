import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { WorkspaceDetailPage as DetailPage } from '../../components/workspaces';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { useWorkspace } from '../../context/WorkspaceContext';
import { ROUTES, routeHelpers } from '../routes';

export const WorkspaceDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { switchWorkspace, clearCurrentWorkspace } = useWorkspace();

  // Set active workspace when page loads
  useEffect(() => {
    if (id) {
      switchWorkspace(id);
    }
    return () => {
      clearCurrentWorkspace();
    };
  }, [id, switchWorkspace, clearCurrentWorkspace]);

  const handleBack = () => {
    navigate(ROUTES.WORKSPACES);
  };

  const handleSelectDetection = (detectionId: string) => {
    navigate(routeHelpers.detectionDetail(detectionId));
  };

  return (
    <PageErrorBoundary pageName="Workspace Detail" onNavigateHome={() => navigate(ROUTES.DASHBOARD)}>
      <DetailPage
        onBack={handleBack}
        onSelectDetection={handleSelectDetection}
      />
    </PageErrorBoundary>
  );
};

export default WorkspaceDetailPage;
