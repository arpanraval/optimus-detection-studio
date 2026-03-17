import React from 'react';
import { useNavigate } from 'react-router-dom';
import { IntelligenceGlobe } from '../../components/dashboard/IntelligenceGlobe';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { useAppData } from '../AppDataContext';
import { ROUTES } from '../routes';

export const IntelGlobePage: React.FC = () => {
  const navigate = useNavigate();
  const { detections } = useAppData();

  const handleNavigate = (type: 'group' | 'software' | 'technique', id: string) => {
    switch (type) {
      case 'group':
        navigate(`/intelligence/groups/${id}`);
        break;
      case 'software':
        navigate(`/intelligence/software/${id}`);
        break;
      case 'technique':
        navigate(`/library?filter=${encodeURIComponent(id)}`);
        break;
    }
  };

  return (
    <PageErrorBoundary pageName="Intelligence Globe" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <IntelligenceGlobe onNavigate={handleNavigate} detections={detections} />
    </PageErrorBoundary>
  );
};

export default IntelGlobePage;
