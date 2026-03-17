import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Dashboard } from '../../components/Dashboard';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { useAppData } from '../AppDataContext';
import { ROUTES } from '../routes';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { detections } = useAppData();

  const handleNavigate = (targetView: string, filter?: any) => {
    if (targetView === 'library') {
      const params = new URLSearchParams();
      // Both technique and tactic use the same 'filter' param - UseCaseLibrary handles both
      if (filter?.technique) {
        params.set('filter', filter.technique);
      } else if (filter?.tactic) {
        params.set('filter', filter.tactic);
      }
      if (filter?.status) {
        params.set('status', filter.status);
      }
      if (filter?.platform) {
        params.set('platform', filter.platform);
      }
      if (filter?.qualityGrade) {
        params.set('qualityGrade', filter.qualityGrade);
      }
      if (filter?.validated) {
        params.set('validated', 'true');
      }
      const queryString = params.toString();
      navigate(queryString ? `${ROUTES.LIBRARY}?${queryString}` : ROUTES.LIBRARY);
    } else if (targetView === 'coverage') {
      navigate(ROUTES.COVERAGE);
    } else if (targetView === 'groups') {
      navigate(ROUTES.GROUPS);
    } else if (targetView === 'software') {
      navigate(ROUTES.SOFTWARE);
    } else if (targetView === 'mitre') {
      navigate(ROUTES.MITRE_MATRIX);
    } else {
      navigate(ROUTES.DASHBOARD);
    }
  };

  return (
    <PageErrorBoundary pageName="Dashboard" onNavigateHome={() => navigate(ROUTES.DASHBOARD)}>
      <Dashboard
        detections={detections}
        onNavigate={handleNavigate}
      />
    </PageErrorBoundary>
  );
};

export default DashboardPage;
