import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MitigationDetailPage as DetailPage } from '../../components/mitigations';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES, routeHelpers } from '../routes';

export const MitigationDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const handleBack = () => {
    navigate(ROUTES.MITIGATIONS);
  };

  const handleNavigateToTechnique = (techniqueId: string) => {
    navigate(`${ROUTES.LIBRARY}?filter=${encodeURIComponent(techniqueId)}`);
  };

  const handleNavigateToGroup = (groupMitreId: string) => {
    navigate(routeHelpers.groupDetail(groupMitreId));
  };

  return (
    <PageErrorBoundary pageName="Mitigation Detail" onNavigateHome={() => navigate(ROUTES.DASHBOARD)}>
      <DetailPage
        mitreId={id}
        onBack={handleBack}
        onNavigateToTechnique={handleNavigateToTechnique}
        onNavigateToGroup={handleNavigateToGroup}
      />
    </PageErrorBoundary>
  );
};

export default MitigationDetailPage;
