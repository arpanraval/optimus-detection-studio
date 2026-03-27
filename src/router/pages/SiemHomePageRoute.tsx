import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SiemHomePage } from '../../components/siem/SiemHomePage';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES } from '../routes';

export const SiemHomePageRoute: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  return (
    <PageErrorBoundary pageName="SIEM Home" onNavigateHome={() => navigate(ROUTES.SIEM_HEALTH)}>
      <SiemHomePage integrationId={id!} />
    </PageErrorBoundary>
  );
};

export default SiemHomePageRoute;
