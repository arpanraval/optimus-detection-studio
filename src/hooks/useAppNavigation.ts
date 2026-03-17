// Navigation hook for components
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';
import { ROUTES, routeHelpers } from '../router/routes';
import { getEntityNavigationPath, buildLibrarySearchParams } from '../router/utils';

export function useAppNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Navigate to detection library with optional filter
  const navigateToLibrary = useCallback((filter?: string, tactic?: string) => {
    const search = buildLibrarySearchParams({ filter, tactic });
    navigate(`${ROUTES.LIBRARY}${search}`);
  }, [navigate]);

  // Navigate to detection detail
  const navigateToDetection = useCallback((id: string) => {
    navigate(routeHelpers.detectionDetail(id));
  }, [navigate]);

  // Navigate to edit detection
  const navigateToEditDetection = useCallback((id: string) => {
    navigate(routeHelpers.detectionEdit(id));
  }, [navigate]);

  // Navigate to new detection
  const navigateToNewDetection = useCallback(() => {
    navigate(ROUTES.DETECTION_NEW);
  }, [navigate]);

  // Navigate to group detail
  const navigateToGroup = useCallback((id: string) => {
    navigate(routeHelpers.groupDetail(id));
  }, [navigate]);

  // Navigate to software detail
  const navigateToSoftware = useCallback((id: string) => {
    navigate(routeHelpers.softwareDetail(id));
  }, [navigate]);

  // Navigate to campaign detail
  const navigateToCampaign = useCallback((id: string) => {
    navigate(routeHelpers.campaignDetail(id));
  }, [navigate]);

  // Navigate to strategy detail
  const navigateToStrategy = useCallback((id: string) => {
    navigate(routeHelpers.strategyDetail(id));
  }, [navigate]);

  // Navigate to mitigation detail
  const navigateToMitigation = useCallback((id: string) => {
    navigate(routeHelpers.mitigationDetail(id));
  }, [navigate]);

  // Navigate to pack detail
  const navigateToPack = useCallback((id: string) => {
    navigate(routeHelpers.packDetail(id));
  }, [navigate]);

  // Navigate to workspace detail
  const navigateToWorkspace = useCallback((id: string) => {
    navigate(routeHelpers.workspaceDetail(id));
  }, [navigate]);

  // Cross-entity navigation (for global search etc.)
  const navigateToEntity = useCallback((
    entityType: 'detection' | 'group' | 'software' | 'campaign' | 'technique' | 'strategy' | 'mitigation',
    entityId: string
  ) => {
    navigate(getEntityNavigationPath(entityType, entityId));
  }, [navigate]);

  // Navigate back
  const goBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Get current MITRE filter from URL
  const getMitreFilter = useCallback(() => {
    return searchParams.get('filter') || null;
  }, [searchParams]);

  // Set MITRE filter in URL
  const setMitreFilter = useCallback((filter: string | null) => {
    if (filter) {
      navigate(`${ROUTES.LIBRARY}?filter=${encodeURIComponent(filter)}`);
    } else {
      navigate(ROUTES.LIBRARY);
    }
  }, [navigate]);

  return {
    navigate,
    location,
    searchParams,
    navigateToLibrary,
    navigateToDetection,
    navigateToEditDetection,
    navigateToNewDetection,
    navigateToGroup,
    navigateToSoftware,
    navigateToCampaign,
    navigateToStrategy,
    navigateToMitigation,
    navigateToPack,
    navigateToWorkspace,
    navigateToEntity,
    goBack,
    getMitreFilter,
    setMitreFilter,
  };
}

export default useAppNavigation;
