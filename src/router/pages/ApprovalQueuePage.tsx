import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminApprovalQueue } from '../../components/library/AdminApprovalQueue';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { useAppData } from '../AppDataContext';
import { hasRoleLevel } from '../../types';
import { ROUTES, routeHelpers } from '../routes';

export const ApprovalQueuePage: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAppData();

  if (!hasRoleLevel(profile?.role || 'analyst', 'lead')) {
    return (
      <div className="p-8">
        <p className="text-error">Access Denied. Lead or Admin privileges required.</p>
        <button
          onClick={() => navigate(ROUTES.COMMAND_CENTER)}
          className="mt-4 px-4 py-2 bg-primary text-on-primary rounded-lg"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  const handleNavigateToDetection = (detectionId: string) => {
    navigate(routeHelpers.detectionDetail(detectionId));
  };

  return (
    <PageErrorBoundary pageName="Approval Queue" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <AdminApprovalQueue onNavigateToDetection={handleNavigateToDetection} />
    </PageErrorBoundary>
  );
};

export default ApprovalQueuePage;
