import { LoadingStatus } from '@/components/ui/LoadingStatus';
import { useInitialLoading } from '@/hooks/useInitialLoading';
import { PagePending } from '@/components/ui/PagePending';
import React from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { ROUTES } from '../routes';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { useEnvironmentProfile } from '../../hooks/useEnvironmentProfile';
import { TechnologySubPage } from '../../components/action-plan/TechnologySubPage';
import { BUCKET_ORDER, type TechBucket } from '../../lib/actionPlan/technologyBuckets';

const VALID_SLUGS = new Set<string>(BUCKET_ORDER);

export const ActionPlanTechnologyPage: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { profile, isLoading } = useEnvironmentProfile();

  const initialLoading = useInitialLoading(isLoading);
  if (initialLoading) {
    return <PagePending layout="dashboard" />;
  }
  if (!profile) return <Navigate to={ROUTES.ENVIRONMENT_PROFILE} replace />;
  if (!slug || !VALID_SLUGS.has(slug)) return <Navigate to={ROUTES.ACTION_PLAN} replace />;

  return <> {isLoading && <div className="px-6 py-2"><LoadingStatus /></div>} {(
    <PageErrorBoundary
      pageName="Action Plan — Technology"
      onNavigateHome={() => navigate(ROUTES.ACTION_PLAN)}
    >
      <TechnologySubPage profile={profile} bucket={slug as TechBucket} />
    </PageErrorBoundary>
  )} </>;
};

export default ActionPlanTechnologyPage;
