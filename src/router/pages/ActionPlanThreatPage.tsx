import React from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { ROUTES } from '../routes';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { useEnvironmentProfile } from '../../hooks/useEnvironmentProfile';
import { ThreatSubPage } from '../../components/action-plan/ThreatSubPage';

export const ActionPlanThreatPage: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { profile, isLoading } = useEnvironmentProfile();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!profile) return <Navigate to={ROUTES.ENVIRONMENT_PROFILE} replace />;
  if (!slug) return <Navigate to={ROUTES.ACTION_PLAN} replace />;

  return (
    <PageErrorBoundary
      pageName="Action Plan — Threat"
      onNavigateHome={() => navigate(ROUTES.ACTION_PLAN)}
    >
      <ThreatSubPage profile={profile} slug={slug} />
    </PageErrorBoundary>
  );
};

export default ActionPlanThreatPage;
