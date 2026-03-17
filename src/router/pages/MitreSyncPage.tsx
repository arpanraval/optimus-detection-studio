import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SyncPage } from '../../components/SyncPage';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { useAppData } from '../AppDataContext';
import { hasRoleLevel } from '../../types';
import { ROUTES } from '../routes';

export const MitreSyncPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAppData();

  if (!hasRoleLevel(profile?.role || 'analyst', 'admin')) {
    return (
      <div className="p-8">
        <p className="text-error">Access Denied. Admin privileges required.</p>
        <button
          onClick={() => navigate(ROUTES.DASHBOARD)}
          className="mt-4 px-4 py-2 bg-primary text-on-primary rounded-lg"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <PageErrorBoundary pageName="Data Sync" onNavigateHome={() => navigate(ROUTES.DASHBOARD)}>
      <SyncPage />
    </PageErrorBoundary>
  );
};

export default MitreSyncPage;
