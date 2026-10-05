import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { ROUTES } from '../routes';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { useEnvironmentProfile } from '../../hooks/useEnvironmentProfile';
import { DetectionActionPlan } from '../../components/settings/environment-wizard/DetectionActionPlan';

export const DetectionActionPlanPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, isLoading } = useEnvironmentProfile();
  const [includeMyLab, setIncludeMyLab] = useState(true);
  const scope = includeMyLab ? 'all' as const : 'production' as const;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile) {
    return <Navigate to={ROUTES.ENVIRONMENT_PROFILE} replace />;
  }

  return (
    <PageErrorBoundary pageName="Detection Action Plan" onNavigateHome={() => navigate(ROUTES.HOME)}>
      <DetectionActionPlan
        profile={profile}
        scope={scope}
        onScopeChange={setIncludeMyLab}
        onEditProfile={() => navigate(ROUTES.ENVIRONMENT_PROFILE)}
      />
    </PageErrorBoundary>
  );
};

export default DetectionActionPlanPage;
