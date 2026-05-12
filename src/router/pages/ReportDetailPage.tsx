import React from 'react';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import ReportDetailPageComponent from '../../components/intelligence/ReportDetailPage';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes';

export const ReportDetailPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageErrorBoundary pageName="Report Detail" onNavigateHome={() => navigate(ROUTES.HOME)}>
      <ReportDetailPageComponent />
    </PageErrorBoundary>
  );
};

export default ReportDetailPage;
