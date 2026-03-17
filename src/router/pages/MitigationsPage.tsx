import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MitigationsLibrary } from '../../components/mitigations';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES, routeHelpers } from '../routes';

export const MitigationsPage: React.FC = () => {
  const navigate = useNavigate();

  const handleSelectMitigation = (mitreId: string) => {
    navigate(routeHelpers.mitigationDetail(mitreId));
  };

  const handleNavigateToTechnique = (techniqueId: string) => {
    navigate(`${ROUTES.LIBRARY}?filter=${encodeURIComponent(techniqueId)}`);
  };

  return (
    <PageErrorBoundary pageName="Mitigations" onNavigateHome={() => navigate(ROUTES.DASHBOARD)}>
      <MitigationsLibrary
        onSelectMitigation={handleSelectMitigation}
        onNavigateToTechnique={handleNavigateToTechnique}
      />
    </PageErrorBoundary>
  );
};

export default MitigationsPage;
