import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../AppDataContext';
import { CostCenterPage as Inner } from '../../components/settings/CostCenterPage';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES } from '../routes';

export const CostCenterPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAppData();
  const isAdmin = profile?.role === 'owner' || profile?.role === 'admin';

  React.useEffect(() => {
    if (profile && !isAdmin) navigate(ROUTES.MY_AI_USAGE, { replace: true });
  }, [profile, isAdmin, navigate]);

  if (!profile || !isAdmin) return null;

  return (
    <PageErrorBoundary pageName="AI Cost Center" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <Inner />
    </PageErrorBoundary>
  );
};

export default CostCenterPage;
