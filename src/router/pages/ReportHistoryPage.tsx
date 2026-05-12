import React from 'react';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import ReportHistoryPageComponent from '../../components/intelligence/ReportHistoryPage';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes';

export const ReportHistoryPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageErrorBoundary pageName="Analysis Reports" onNavigateHome={() => navigate(ROUTES.HOME)}>
      <ReportHistoryPageComponent />
    </PageErrorBoundary>
  );
};

export default ReportHistoryPage;
