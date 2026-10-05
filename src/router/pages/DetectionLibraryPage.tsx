import React, { useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UseCaseLibrary } from '../../components/UseCaseLibrary';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { useAppData } from '../AppDataContext';
import { ROUTES, routeHelpers } from '../routes';
import { EMPTY_FILTER_VALUE, filterFieldForMissingColumn } from '../../constants/filters';

// Filter keys that can appear in URL search params
const URL_FILTER_KEYS = [
  'status', 'severity', 'technology', 'logSource', 'queryLanguage',
  'author', 'platforms', 'mitreTactics', 'mitreTechniques', 'tags',
  'detectionType', 'qualityGrade', 'testedAndValidated',
  'publish_status', 'source', 'threatActors', 'campaigns', 'software',
  'associatedCVEs',
];

export const DetectionLibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAppData();

  const mitreFilter = searchParams.get('filter') || null;
  const initialSearch = searchParams.get('search') || '';
  const createdBefore = searchParams.get('createdBefore') || undefined;
  const missingFieldParam = searchParams.get('missingField') || undefined;

  // Dashboard hygiene widgets link here with ?missingField=<column>. Where that column has a
  // filter group, express it as a normal "(None)" selection so the user sees a chip they can
  // inspect and clear, and can reproduce the same view from the panel. Columns with no group
  // (description, detectionQuery, ...) keep travelling on the dedicated prop.
  const missingFieldAsFilter = missingFieldParam ? filterFieldForMissingColumn(missingFieldParam) : undefined;
  const missingField = missingFieldAsFilter ? undefined : missingFieldParam;

  // Build initialFilters from ALL URL parameters
  const initialFilters = useMemo(() => {
    const filters: Record<string, string[]> = {};
    for (const key of URL_FILTER_KEYS) {
      const value = searchParams.get(key);
      if (value) {
        // Support comma-separated values: ?tags=Powershell,Lateral+Movement
        filters[key] = value.split(',').map(v => v.trim()).filter(Boolean);
      }
    }
    // Legacy: 'platform' param maps to 'platforms' filter
    const platformLegacy = searchParams.get('platform');
    if (platformLegacy && !filters.platforms) {
      filters.platforms = [platformLegacy];
    }
    // Legacy: 'validated' param maps to 'testedAndValidated' filter
    const validatedLegacy = searchParams.get('validated');
    if (validatedLegacy === 'true' && !filters.testedAndValidated) {
      filters.testedAndValidated = ['true'];
    }
    // ?missingField=<column> arriving from a Dashboard widget
    if (missingFieldAsFilter && !filters[missingFieldAsFilter]) {
      filters[missingFieldAsFilter] = [EMPTY_FILTER_VALUE];
    }
    return Object.keys(filters).length > 0 ? filters : undefined;
  }, [searchParams, missingFieldAsFilter]);

  const setMitreFilter = (filter: string | null) => {
    const newParams = new URLSearchParams(searchParams);
    if (filter) {
      newParams.set('filter', filter);
    } else {
      newParams.delete('filter');
    }
    setSearchParams(newParams, { replace: true });
  };

  // Sync filter/search state back to URL
  const handleFiltersChange = useCallback((filters: Record<string, string[]>, search: string) => {
    const newParams = new URLSearchParams();
    // Preserve MITRE filter if present
    if (mitreFilter) newParams.set('filter', mitreFilter);
    // Preserve special filters
    if (createdBefore) newParams.set('createdBefore', createdBefore);
    if (missingField) newParams.set('missingField', missingField);
    // Set search
    if (search) newParams.set('search', search);
    // Set filters
    for (const [key, values] of Object.entries(filters)) {
      if (values.length > 0) {
        newParams.set(key, values.join(','));
      }
    }
    setSearchParams(newParams, { replace: true });
  }, [mitreFilter, createdBefore, missingField, setSearchParams]);

  const handleSelectDetection = (detection: { id: string }) => {
    navigate(routeHelpers.detectionDetail(detection.id));
  };

  const handleEditDetection = (detection: { id: string }) => {
    navigate(routeHelpers.detectionEdit(detection.id));
  };

  const handleNewDetection = () => {
    navigate(ROUTES.DETECTION_NEW);
  };

  const handleNewUniversalDetection = () => {
    navigate(`${ROUTES.DETECTION_NEW}?library=universal`);
  };

  const handleNavigateToTechnique = (techniqueId: string) => {
    setMitreFilter(techniqueId);
  };

  const handleNavigateToGroup = (groupId: string) => {
    navigate(routeHelpers.groupDetail(groupId));
  };

  const handleNavigateToSoftware = (softwareId: string) => {
    navigate(routeHelpers.softwareDetail(softwareId));
  };

  return (
    <PageErrorBoundary pageName="Detection Library" onNavigateHome={() => navigate(ROUTES.HOME)}>
      <UseCaseLibrary
        onSelectDetection={handleSelectDetection}
        onNewDetection={handleNewDetection}
        onEditDetection={handleEditDetection}
        onNewUniversalDetection={handleNewUniversalDetection}
        mitreFilter={mitreFilter}
        setMitreFilter={setMitreFilter}
        onNavigateToTechnique={handleNavigateToTechnique}
        onNavigateToGroup={handleNavigateToGroup}
        onNavigateToSoftware={handleNavigateToSoftware}
        userRole={profile?.role}
        initialFilters={initialFilters}
        initialSearch={initialSearch}
        createdBefore={createdBefore}
        missingField={missingField}
        onFiltersChange={handleFiltersChange}
      />
    </PageErrorBoundary>
  );
};

export default DetectionLibraryPage;
