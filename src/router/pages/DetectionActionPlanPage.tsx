import { LoadingStatus } from '@/components/ui/LoadingStatus';
import { useInitialLoading } from '@/hooks/useInitialLoading';
import { PagePending } from '@/components/ui/PagePending';
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

  const initialLoading = useInitialLoading(isLoading);
  if (initialLoading) {
    return <PagePending layout="dashboard" />;
  }

  if (!profile) {
    return <Navigate to={ROUTES.ENVIRONMENT_PROFILE} replace />;
  }

  return <> {isLoading && <div className="px-6 py-2"><LoadingStatus /></div>} {(
    <PageErrorBoundary pageName="Detection Action Plan" onNavigateHome={() => navigate(ROUTES.HOME)}>
      <DetectionActionPlan
        profile={profile}
        scope={scope}
        onScopeChange={setIncludeMyLab}
        onEditProfile={() => navigate(ROUTES.ENVIRONMENT_PROFILE)}
      />
    </PageErrorBoundary>
  )} </>;
};

export default DetectionActionPlanPage;
