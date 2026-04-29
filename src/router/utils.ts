// Router utility functions
import { ROUTES, routeHelpers } from './routes';

// Match route patterns to determine active sidebar section
export function matchRouteToSection(pathname: string): string | null {
  // Dashboard / Command Center
  if (pathname === ROUTES.COMMAND_CENTER || pathname.startsWith('/dashboard/enterprise')) return 'dashboard';

  // New detection
  if (pathname === ROUTES.DETECTION_NEW) return 'new-detection';

  // Detections section
  if (pathname.startsWith('/library') || pathname === ROUTES.APPROVAL_QUEUE) return 'detections';

  // Packs
  if (pathname.startsWith('/packs')) return 'detections';

  // MITRE/Intelligence section
  if (pathname.startsWith('/intelligence')) return 'mitre';

  // Onboarding
  if (pathname.startsWith('/onboarding')) return 'detections';

  // Arsenal
  if (pathname.startsWith('/arsenal')) return 'arsenal';

  // Action Plan
  if (pathname === ROUTES.ACTION_PLAN) return 'action-plan';

  // Settings
  if (pathname.startsWith('/settings')) return 'settings';

  // Design System
  if (pathname.startsWith('/design-system')) return 'design-system';

  // Account related
  if (pathname === ROUTES.ACCOUNT || pathname === ROUTES.SUBMISSIONS) return null;

  return null;
}

// Match route patterns to determine active nav item
export function matchRouteToNavItem(pathname: string): string | null {
  // Dashboard sub-items
  if (pathname === ROUTES.COMMAND_CENTER) return 'command-center';
  if (pathname.startsWith('/dashboard/enterprise')) return 'enterprise-dashboard';
  if (pathname === ROUTES.LIBRARY || pathname.startsWith('/library/detections')) return 'library';
  if (pathname === ROUTES.PACKS || pathname.startsWith('/packs/')) return 'packs';
  if (pathname === ROUTES.APPROVAL_QUEUE) return 'approval_queue';
  if (pathname === ROUTES.MITRE_MATRIX) return 'mitre';
  if (pathname === ROUTES.DEFENSIVE_POSTURE) return 'defensive-posture';
  if (pathname === ROUTES.STRATEGIES || pathname.startsWith('/intelligence/strategies/')) return 'detection-strategies';
  if (pathname === ROUTES.GROUPS || pathname.startsWith('/intelligence/groups/')) return 'groups';
  if (pathname === ROUTES.SOFTWARE || pathname.startsWith('/intelligence/software/')) return 'software';
  if (pathname === ROUTES.CAMPAIGNS || pathname.startsWith('/intelligence/campaigns/')) return 'campaigns';
  if (pathname === ROUTES.MITIGATIONS || pathname.startsWith('/intelligence/mitigations/')) return 'mitigations';
  if (pathname === ROUTES.THREAT_INTEL || pathname.startsWith('/intelligence/threat-digest/')) return 'threat-intel';
  if (pathname === ROUTES.SIGMA_CONVERTER) return 'sigma_converter';
  if (pathname === ROUTES.AI_QUERY) return 'ai_query_gen';
  if (pathname === ROUTES.OPTIMUS) return 'ai_agent';
  if (pathname === ROUTES.ACTION_PLAN) return 'action_plan';
  if (pathname === ROUTES.INTEGRATIONS) return 'integrations';
  if (pathname === ROUTES.SCORING) return 'scoring_settings';
  if (pathname === ROUTES.USERS) return 'users';
  if (pathname === ROUTES.DATA_SYNC) return 'data_sync';
  if (pathname === ROUTES.ACCOUNT) return 'account_settings';
  if (pathname === ROUTES.SUBMISSIONS) return 'my_submissions';
  if (pathname === ROUTES.DETECTION_NEW) return 'add_selection';

  // Arsenal sub-items
  if (pathname === ROUTES.PLAYBOOKS) return 'playbooks';
  if (pathname === ROUTES.IMPORT_HISTORY) return 'bulk_import';
  if (pathname === ROUTES.BULK_IMPORT) return 'bulk_import';

  // Settings sub-items
  if (pathname === ROUTES.AUDIT_LOG) return 'audit_log';
  if (pathname === ROUTES.ENVIRONMENT_PROFILE) return 'environment_profile';
  if (pathname === ROUTES.INTELLIGENCE_SOURCES) return 'intelligence_sources';
  if (pathname.startsWith('/settings/integrations/')) return 'integrations';

  // SIEM
  if (pathname === ROUTES.SIEM_HEALTH || pathname.startsWith('/siem/')) return 'siem-health';

  // Exercises
  if (pathname === ROUTES.EXERCISES_STATE_SPONSORED) return 'exercises-state-sponsored';

  // Detection Board
  if (pathname === ROUTES.DETECTION_BOARD) return 'detection-board';

  // Threat intel feeds & reports (sidebar highlighting only)
  if (pathname === ROUTES.THREAT_INTEL_FEEDS) return 'threat-intel-feeds';
  if (pathname === ROUTES.REPORTS || pathname.startsWith('/intelligence/reports/')) return 'analysis-reports';

  // Onboarding
  if (pathname === ROUTES.ONBOARDING) return 'onboarding';

  // Design System
  if (pathname === ROUTES.COMPONENT_SHOWCASE) return 'design-system';
  if (pathname === ROUTES.DESIGN_SYSTEM_BUTTONS) return 'design-system-buttons';
  if (pathname === ROUTES.DESIGN_SYSTEM_INPUTS) return 'design-system-inputs';
  if (pathname === ROUTES.DESIGN_SYSTEM_BADGES) return 'design-system-badges';
  if (pathname === ROUTES.DESIGN_SYSTEM_CARDS) return 'design-system-cards';
  if (pathname === ROUTES.DESIGN_SYSTEM_NAVIGATION) return 'design-system-navigation';
  if (pathname === ROUTES.DESIGN_SYSTEM_MODALS) return 'design-system-modals';
  if (pathname === ROUTES.DESIGN_SYSTEM_DROPDOWNS) return 'design-system-dropdowns';
  if (pathname === ROUTES.DESIGN_SYSTEM_LOADING) return 'design-system-loading';
  if (pathname === ROUTES.DESIGN_SYSTEM_MISC) return 'design-system-misc';
  if (pathname === ROUTES.DESIGN_SYSTEM_COLORS) return 'design-system-colors';

  return null;
}

// Navigation helpers for cross-entity navigation
export function getEntityNavigationPath(
  entityType: 'detection' | 'group' | 'software' | 'campaign' | 'technique' | 'strategy' | 'mitigation',
  entityId: string
): string {
  switch (entityType) {
    case 'detection':
      return routeHelpers.detectionDetail(entityId);
    case 'group':
      return routeHelpers.groupDetail(entityId);
    case 'software':
      return routeHelpers.softwareDetail(entityId);
    case 'campaign':
      return routeHelpers.campaignDetail(entityId);
    case 'technique':
      return routeHelpers.libraryWithFilter(entityId);
    case 'strategy':
      return routeHelpers.strategyDetail(entityId);
    case 'mitigation':
      return routeHelpers.mitigationDetail(entityId);
    default:
      return ROUTES.LIBRARY;
  }
}

// Parse filter from URL search params
export function parseLibraryFilters(searchParams: URLSearchParams): {
  filter?: string;
  tactic?: string;
} {
  return {
    filter: searchParams.get('filter') || undefined,
    tactic: searchParams.get('tactic') || undefined,
  };
}

// Build search params string from filters
export function buildLibrarySearchParams(filters: { filter?: string; tactic?: string }): string {
  const params = new URLSearchParams();
  if (filters.filter) params.set('filter', filters.filter);
  if (filters.tactic) params.set('tactic', filters.tactic);
  const str = params.toString();
  return str ? `?${str}` : '';
}
