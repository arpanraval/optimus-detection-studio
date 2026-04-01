import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DefensivePostureDashboard } from '../../components/impact/DefensivePostureDashboard';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { useAppData } from '../AppDataContext';
import { ROUTES, routeHelpers } from '../routes';

export const DefensivePosturePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAppData();
  const [includeMyLab, setIncludeMyLab] = useState(false);
  const scope = includeMyLab ? 'all' as const : 'production' as const;

  const handleTechniqueClick = (mitreId: string) => {
    navigate(`${ROUTES.LIBRARY}?filter=${encodeURIComponent(mitreId)}`);
  };

  const handleGroupClick = (groupMitreId: string) => {
    navigate(routeHelpers.groupDetail(groupMitreId));
  };

  const handleViewAllGaps = () => {
    navigate(ROUTES.COVERAGE);
  };

  const handleBuildDetection = (techniqueId: string) => {
    const draft = { mitreAttackIds: [techniqueId] };
    sessionStorage.setItem('detectionDraft', JSON.stringify(draft));
    navigate(ROUTES.DETECTION_NEW);
  };

  return (
    <PageErrorBoundary pageName="Defensive Posture" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <DefensivePostureDashboard
        userId={user?.id || ''}
        scope={scope}
        onScopeChange={setIncludeMyLab}
        onTechniqueClick={handleTechniqueClick}
        onGroupClick={handleGroupClick}
        onViewAllGaps={handleViewAllGaps}
        onBuildDetection={handleBuildDetection}
      />
    </PageErrorBoundary>
  );
};

export default DefensivePosturePage;
