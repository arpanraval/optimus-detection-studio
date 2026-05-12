import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { AutoDigestSettingsPage as AutoDigestSettings } from '../../components/settings/AutoDigestSettingsPage';

export const AutoDigestSettingsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageErrorBoundary pageName="Intelligence Sources" onNavigateHome={() => navigate(ROUTES.HOME)}>
      <AutoDigestSettings onBack={() => navigate(-1)} />
    </PageErrorBoundary>
  );
};

export default AutoDigestSettingsPage;
