import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MySubmissions } from '../../components/MySubmissions';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { useAppData } from '../AppDataContext';
import { ROUTES, routeHelpers } from '../routes';

export const SubmissionsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAppData();

  const handleNavigateToDetection = (detectionId: string) => {
    navigate(routeHelpers.detectionDetail(detectionId));
  };

  const handleBack = () => {
    navigate(ROUTES.LIBRARY);
  };

  return (
    <PageErrorBoundary pageName="My Submissions" onNavigateHome={() => navigate(ROUTES.HOME)}>
      <MySubmissions
        userId={user?.id || ''}
        onNavigateToDetection={handleNavigateToDetection}
        onBack={handleBack}
      />
    </PageErrorBoundary>
  );
};

export default SubmissionsPage;
