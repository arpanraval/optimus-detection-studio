import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { StateSponsoredReportPage as ReportPage } from '../../components/exercises/StateSponsoredReportPage';

export const StateSponsoredReportPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageErrorBoundary pageName="State Sponsored Attack Report" onNavigateHome={() => navigate('/')}>
      <ReportPage onNavigate={navigate} />
    </PageErrorBoundary>
  );
};

export default StateSponsoredReportPage;
