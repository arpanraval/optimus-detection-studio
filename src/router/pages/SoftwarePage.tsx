import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SoftwareLibrary } from '../../components/software/SoftwareLibrary';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES, routeHelpers } from '../routes';
import { Software } from '../../hooks/useSoftware';

export const SoftwarePage: React.FC = () => {
  const navigate = useNavigate();

  const handleSelectSoftware = (software: Software) => {
    navigate(routeHelpers.softwareDetail(software.mitre_id));
  };

  return (
    <PageErrorBoundary pageName="Software Library" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <SoftwareLibrary onSelectSoftware={handleSelectSoftware} />
    </PageErrorBoundary>
  );
};

export default SoftwarePage;
