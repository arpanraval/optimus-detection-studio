import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { EnvironmentProfileForm } from '../../components/settings/EnvironmentProfileForm';

export const EnvironmentProfilePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageErrorBoundary pageName="Environment Profile" onNavigateHome={() => navigate(ROUTES.HOME)}>
      <EnvironmentProfileForm onBack={() => navigate(-1)} />
    </PageErrorBoundary>
  );
};

export default EnvironmentProfilePage;
