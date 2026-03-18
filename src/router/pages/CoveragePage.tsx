import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CoverageAnalytics } from '../../components/coverage/CoverageAnalytics';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { useAppData } from '../AppDataContext';
import { ROUTES, routeHelpers } from '../routes';
import { Status, Maturity, DetectionType, Severity, Confidence } from '../../types';

export const CoveragePage: React.FC = () => {
  const navigate = useNavigate();
  const { detections } = useAppData();
  const [includeMyLab, setIncludeMyLab] = useState(false);
  const scope = includeMyLab ? 'all' as const : 'production' as const;

  // General navigation handler for CoverageAnalytics component
  const handleNavigate = (view: string, filter?: any) => {
    switch (view) {
      case 'mitre':
        if (filter?.tactic) {
          navigate(`${ROUTES.MITRE_MATRIX}?tactic=${encodeURIComponent(filter.tactic)}`);
        } else if (filter?.technique) {
          navigate(`${ROUTES.MITRE_MATRIX}?technique=${encodeURIComponent(filter.technique)}`);
        } else {
          navigate(ROUTES.MITRE_MATRIX);
        }
        break;
      case 'groups':
        if (filter?.search) {
          navigate(`${ROUTES.GROUPS}?search=${encodeURIComponent(filter.search)}`);
        } else {
          navigate(ROUTES.GROUPS);
        }
        break;
      case 'software':
        if (filter?.search) {
          navigate(`${ROUTES.SOFTWARE}?search=${encodeURIComponent(filter.search)}`);
        } else {
          navigate(ROUTES.SOFTWARE);
        }
        break;
      case 'library':
        if (filter?.technique) {
          navigate(`${ROUTES.LIBRARY}?filter=${encodeURIComponent(filter.technique)}`);
        } else if (filter?.tactic) {
          navigate(`${ROUTES.LIBRARY}?filter=${encodeURIComponent(filter.tactic)}`);
        } else {
          navigate(ROUTES.LIBRARY);
        }
        break;
      case 'gaps':
        // Gaps section - scroll to or highlight gaps section (currently just stay on page)
        break;
      case 'coverage':
        navigate(ROUTES.COVERAGE);
        break;
      default:
        navigate(ROUTES.DASHBOARD);
    }
  };

  const handleNavigateToLibrary = (techniqueId: string) => {
    navigate(`${ROUTES.LIBRARY}?filter=${encodeURIComponent(techniqueId)}`);
  };

  const handleNavigateToStrategy = (strategyStixId: string) => {
    navigate(routeHelpers.strategyDetail(strategyStixId));
  };

  const handleCreateDetection = (prefill: {
    name?: string;
    description?: string;
    mitreAttackIds?: string[];
    logSources?: string[];
    platforms?: string[];
    technology?: string;
    linkedGroups?: { stix_id: string; mitre_id: string; name: string }[];
    linkedCampaigns?: { stix_id: string; mitre_id: string; name: string }[];
  }) => {
    const draft = {
      name: prefill.name || '',
      description: prefill.description || '',
      mitreAttackIds: prefill.mitreAttackIds || [],
      logSources: prefill.logSources || [],
      platforms: prefill.platforms || [],
      technology: prefill.technology || '',
      linkedGroups: prefill.linkedGroups || [],
      linkedCampaigns: prefill.linkedCampaigns || [],
      status: Status.Draft,
      maturity: Maturity.Experimental,
      detectionType: DetectionType.Detection,
      severity: Severity.Medium,
      confidence: Confidence.Medium,
    };
    sessionStorage.setItem('detectionDraft', JSON.stringify(draft));
    navigate(ROUTES.DETECTION_NEW);
  };

  return (
    <PageErrorBoundary pageName="Coverage Analytics" onNavigateHome={() => navigate(ROUTES.DASHBOARD)}>
      <CoverageAnalytics
        detections={detections}
        scope={scope}
        onScopeChange={setIncludeMyLab}
        onNavigate={handleNavigate}
        onNavigateToLibrary={handleNavigateToLibrary}
        onNavigateToStrategy={handleNavigateToStrategy}
        onCreateDetection={handleCreateDetection}
      />
    </PageErrorBoundary>
  );
};

export default CoveragePage;
