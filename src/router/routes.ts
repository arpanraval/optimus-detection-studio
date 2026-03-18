// Route path constants and helpers

export const ROUTES = {
  // Command Center (new default)
  COMMAND_CENTER: '/',

  // Dashboard (classic)
  DASHBOARD: '/dashboard/classic',

  // Enterprise Dashboard
  ENTERPRISE_DASHBOARD: '/dashboard/enterprise',
  ENTERPRISE_DASHBOARD_DETAIL: '/dashboard/enterprise/:dashboardId',

  // Intelligence Globe
  INTEL_GLOBE: '/dashboard/globe',

  // Detection Library
  LIBRARY: '/library',
  DETECTION_NEW: '/library/detections/new',
  DETECTION_DETAIL: '/library/detections/:id',
  DETECTION_EDIT: '/library/detections/:id/edit',

  // Detection Packs
  PACKS: '/packs',
  PACK_DETAIL: '/packs/:id',

  // Workspaces
  WORKSPACES: '/workspaces',
  WORKSPACE_DETAIL: '/workspaces/:id',

  // Intelligence
  MITRE_MATRIX: '/intelligence/mitre',
  COVERAGE: '/intelligence/coverage',
  DEFENSIVE_POSTURE: '/intelligence/posture',
  STRATEGIES: '/intelligence/strategies',
  STRATEGY_DETAIL: '/intelligence/strategies/:id',
  GROUPS: '/intelligence/groups',
  GROUP_DETAIL: '/intelligence/groups/:id',
  SOFTWARE: '/intelligence/software',
  SOFTWARE_DETAIL: '/intelligence/software/:id',
  CAMPAIGNS: '/intelligence/campaigns',
  CAMPAIGN_DETAIL: '/intelligence/campaigns/:id',
  MITIGATIONS: '/intelligence/mitigations',
  MITIGATION_DETAIL: '/intelligence/mitigations/:id',
  THREAT_INTEL: '/intelligence/threat-digest',
  THREAT_INTEL_DETAIL: '/intelligence/threat-digest/:id',
  THREAT_INTEL_FEEDS: '/intelligence/feeds',

  // Arsenal
  SIGMA_CONVERTER: '/arsenal/sigma',
  AI_QUERY: '/arsenal/ai-query',
  OPTIMUS: '/arsenal/optimus',
  BULK_IMPORT: '/arsenal/bulk-import',
  IMPORT_HISTORY: '/arsenal/import-history',
  PLAYBOOKS: '/arsenal/playbooks',
  ONBOARDING: '/onboarding',

  // Pipeline
  PIPELINE: '/pipeline',

  // Action Plan
  ACTION_PLAN: '/action-plan',

  // Defense Exercises
  EXERCISES_STATE_SPONSORED: '/exercises/state-sponsored',

  // Settings
  INTEGRATIONS: '/settings/integrations',
  INTEGRATION_DETAIL: '/settings/integrations/:id',
  SCORING: '/settings/scoring',
  USERS: '/settings/users',
  MITRE_SYNC: '/settings/mitre-sync',
  AUDIT_LOG: '/settings/audit-log',
  ENVIRONMENT_PROFILE: '/settings/environment',

  // SIEM Health
  SIEM_HEALTH: '/siem',

  // Account
  ACCOUNT: '/account',
  SUBMISSIONS: '/submissions',
  APPROVAL_QUEUE: '/approval-queue',

  // Search
  SEARCH: '/search',

  // Auth (for unauthenticated users)
  AUTH: '/auth',

  // Design System (dev only)
  COMPONENT_SHOWCASE: '/design-system',
  DESIGN_SYSTEM_BUTTONS: '/design-system/buttons',
  DESIGN_SYSTEM_INPUTS: '/design-system/inputs',
  DESIGN_SYSTEM_BADGES: '/design-system/badges',
  DESIGN_SYSTEM_CARDS: '/design-system/cards',
  DESIGN_SYSTEM_NAVIGATION: '/design-system/navigation',
  DESIGN_SYSTEM_MODALS: '/design-system/modals',
  DESIGN_SYSTEM_DROPDOWNS: '/design-system/dropdowns',
  DESIGN_SYSTEM_LOADING: '/design-system/loading',
  DESIGN_SYSTEM_MISC: '/design-system/misc',
  DESIGN_SYSTEM_COLORS: '/design-system/colors',
  DESIGN_SYSTEM_BULK_IMPORT: '/design-system/bulk-import',
  DESIGN_SYSTEM_LOGO: '/design-system/logo',
  DESIGN_SYSTEM_MITRE_TOOLTIP: '/design-system/mitre-tooltip',
  DESIGN_SYSTEM_ONBOARDING_ANIMATION: '/design-system/onboarding-animation',
  DESIGN_SYSTEM_INTEL_CARDS: '/design-system/intel-cards',
  DESIGN_SYSTEM_AI_CHAT_CARDS: '/design-system/ai-chat-cards',
} as const;

export type RoutePath = typeof ROUTES[keyof typeof ROUTES];

// Helper functions to generate paths with parameters
export const routeHelpers = {
  detectionDetail: (id: string) => `/library/detections/${id}`,
  detectionEdit: (id: string) => `/library/detections/${id}/edit`,
  packDetail: (id: string) => `/packs/${id}`,
  workspaceDetail: (id: string) => `/workspaces/${id}`,
  strategyDetail: (id: string) => `/intelligence/strategies/${id}`,
  groupDetail: (id: string) => `/intelligence/groups/${id}`,
  softwareDetail: (id: string) => `/intelligence/software/${id}`,
  campaignDetail: (id: string) => `/intelligence/campaigns/${id}`,
  mitigationDetail: (id: string) => `/intelligence/mitigations/${id}`,
  threatIntelDetail: (id: string) => `/intelligence/threat-digest/${id}`,
  integrationDetail: (id: string) => `/settings/integrations/${id}`,
  enterpriseDashboard: (id: string) => `/dashboard/enterprise/${id}`,
  stateSponsoredReport: () => `/exercises/state-sponsored`,

  // Library with filter params
  libraryWithFilter: (filter: string) => `/library?filter=${encodeURIComponent(filter)}`,
  libraryWithTactic: (tactic: string) => `/library?tactic=${encodeURIComponent(tactic)}`,
};

// Map old View types to new routes (for migration)
export const viewToRoute: Record<string, string> = {
  'dashboard': ROUTES.COMMAND_CENTER,
  'command-center': ROUTES.COMMAND_CENTER,
  'dashboard-classic': ROUTES.DASHBOARD,
  'enterprise-dashboard': ROUTES.ENTERPRISE_DASHBOARD,
  'intel-globe': ROUTES.INTEL_GLOBE,
  'library': ROUTES.LIBRARY,
  'detail': ROUTES.DETECTION_DETAIL,
  'form': ROUTES.DETECTION_NEW,
  'mitre': ROUTES.MITRE_MATRIX,
  'coverage': ROUTES.COVERAGE,
  'defensive-posture': ROUTES.DEFENSIVE_POSTURE,
  'detection-strategies': ROUTES.STRATEGIES,
  'strategy-detail': ROUTES.STRATEGY_DETAIL,
  'groups': ROUTES.GROUPS,
  'group-detail': ROUTES.GROUP_DETAIL,
  'software': ROUTES.SOFTWARE,
  'software-detail': ROUTES.SOFTWARE_DETAIL,
  'campaigns': ROUTES.CAMPAIGNS,
  'campaign-detail': ROUTES.CAMPAIGN_DETAIL,
  'mitigations': ROUTES.MITIGATIONS,
  'mitigation-detail': ROUTES.MITIGATION_DETAIL,
  'threat-intel': ROUTES.THREAT_INTEL,
  'threat-intel-feeds': ROUTES.THREAT_INTEL_FEEDS,
  'packs': ROUTES.PACKS,
  'pack-detail': ROUTES.PACK_DETAIL,
  'workspaces': ROUTES.WORKSPACES,
  'workspace-detail': ROUTES.WORKSPACE_DETAIL,
  'sigma_converter': ROUTES.SIGMA_CONVERTER,
  'ai_query_gen': ROUTES.AI_QUERY,
  'ai_agent': ROUTES.OPTIMUS,
  'playbooks': ROUTES.PLAYBOOKS,
  'bulk_import': ROUTES.BULK_IMPORT,
  'onboarding': ROUTES.ONBOARDING,
  'pipeline': ROUTES.PIPELINE,
  'integrations': ROUTES.INTEGRATIONS,
  'scoring_settings': ROUTES.SCORING,
  'environment_profile': ROUTES.ENVIRONMENT_PROFILE,
  'siem-health': ROUTES.SIEM_HEALTH,
  'action_plan': ROUTES.ACTION_PLAN,
  'exercises-state-sponsored': '/exercises/state-sponsored',
  'audit_log': ROUTES.AUDIT_LOG,
  'users': ROUTES.USERS,
  'mitre_data_sync': ROUTES.MITRE_SYNC,
  'account_settings': ROUTES.ACCOUNT,
  'my_submissions': ROUTES.SUBMISSIONS,
  'approval_queue': ROUTES.APPROVAL_QUEUE,
  'add_selection': ROUTES.DETECTION_NEW,
  // Design System
  'design-system': ROUTES.COMPONENT_SHOWCASE,
  'design-system-buttons': ROUTES.DESIGN_SYSTEM_BUTTONS,
  'design-system-inputs': ROUTES.DESIGN_SYSTEM_INPUTS,
  'design-system-badges': ROUTES.DESIGN_SYSTEM_BADGES,
  'design-system-cards': ROUTES.DESIGN_SYSTEM_CARDS,
  'design-system-navigation': ROUTES.DESIGN_SYSTEM_NAVIGATION,
  'design-system-modals': ROUTES.DESIGN_SYSTEM_MODALS,
  'design-system-dropdowns': ROUTES.DESIGN_SYSTEM_DROPDOWNS,
  'design-system-loading': ROUTES.DESIGN_SYSTEM_LOADING,
  'design-system-misc': ROUTES.DESIGN_SYSTEM_MISC,
  'design-system-colors': ROUTES.DESIGN_SYSTEM_COLORS,
  'design-system-bulk-import': ROUTES.DESIGN_SYSTEM_BULK_IMPORT,
  'design-system-logo': ROUTES.DESIGN_SYSTEM_LOGO,
  'design-system-mitre-tooltip': ROUTES.DESIGN_SYSTEM_MITRE_TOOLTIP,
  'design-system-onboarding-animation': ROUTES.DESIGN_SYSTEM_ONBOARDING_ANIMATION,
  'design-system-intel-cards': ROUTES.DESIGN_SYSTEM_INTEL_CARDS,
  'design-system-ai-chat-cards': ROUTES.DESIGN_SYSTEM_AI_CHAT_CARDS,
};

// Page headers for each route
export const routeHeaders: Record<string, { title: string; description?: string }> = {
  [ROUTES.COMMAND_CENTER]: { title: 'Command Center', description: 'Detection engineering command center' },
  [ROUTES.DASHBOARD]: { title: 'Dashboard', description: 'Overview of your detection engineering program' },
  [ROUTES.ENTERPRISE_DASHBOARD]: { title: 'Enterprise Dashboard', description: 'Customizable drag-and-drop dashboard with widgets' },
  [ROUTES.INTEL_GLOBE]: { title: 'Intelligence Globe', description: 'Interactive threat actor and software relationship map' },
  [ROUTES.LIBRARY]: { title: 'Detection Library', description: 'Browse and manage your security detections' },
  [ROUTES.DETECTION_NEW]: { title: 'New Detection', description: 'Create a new detection rule' },
  [ROUTES.DETECTION_DETAIL]: { title: 'Detection Details', description: undefined },
  [ROUTES.DETECTION_EDIT]: { title: 'Edit Detection', description: undefined },
  [ROUTES.PACKS]: { title: 'Detection Packs', description: 'Curated collections of detection rules' },
  [ROUTES.PACK_DETAIL]: { title: 'Pack Details', description: undefined },
  [ROUTES.WORKSPACES]: { title: 'Workspaces', description: 'Manage detection engineering workspaces' },
  [ROUTES.WORKSPACE_DETAIL]: { title: 'Workspace', description: 'Workspace details and detections' },
  [ROUTES.MITRE_MATRIX]: { title: 'MITRE ATT&CK', description: 'Technique coverage matrix and analysis' },
  [ROUTES.COVERAGE]: { title: 'Coverage Analytics', description: 'Analyze detection coverage across the MITRE ATT&CK framework' },
  [ROUTES.DEFENSIVE_POSTURE]: { title: 'Defensive Posture', description: 'Assess your defensive capabilities' },
  [ROUTES.STRATEGIES]: { title: 'Detection Strategies', description: 'Browse MITRE detection strategies' },
  [ROUTES.STRATEGY_DETAIL]: { title: 'Strategy Details', description: undefined },
  [ROUTES.GROUPS]: { title: 'Threat Groups', description: 'Browse and analyze APT groups and their techniques' },
  [ROUTES.GROUP_DETAIL]: { title: 'Group Profile', description: undefined },
  [ROUTES.SOFTWARE]: { title: 'Software & Tools', description: 'Browse malware and hacking tools used by threat actors' },
  [ROUTES.SOFTWARE_DETAIL]: { title: 'Software Profile', description: undefined },
  [ROUTES.CAMPAIGNS]: { title: 'Campaigns', description: 'Browse known cyber campaigns and intrusion sets' },
  [ROUTES.CAMPAIGN_DETAIL]: { title: 'Campaign Profile', description: undefined },
  [ROUTES.MITIGATIONS]: { title: 'Mitigations', description: 'Browse security mitigations and controls' },
  [ROUTES.MITIGATION_DETAIL]: { title: 'Mitigation Details', description: undefined },
  [ROUTES.THREAT_INTEL]: { title: 'Intelligence Reports', description: 'AI-powered threat intelligence extraction' },
  [ROUTES.THREAT_INTEL_DETAIL]: { title: 'Report Analysis', description: undefined },
  [ROUTES.THREAT_INTEL_FEEDS]: { title: 'Threat Intel Feeds', description: 'Subscribe to RSS and TAXII threat intelligence feeds' },
  [ROUTES.SIGMA_CONVERTER]: { title: 'Sigma Converter', description: 'Convert Sigma rules to SIEM query languages' },
  [ROUTES.AI_QUERY]: { title: 'AI Query Generator', description: 'Generate detection queries with AI assistance' },
  [ROUTES.OPTIMUS]: { title: 'Optimus Prime', description: 'Your intelligent detection engineering assistant' },
  [ROUTES.BULK_IMPORT]: { title: 'Bulk Import', description: 'Import detection rules from Sigma, Splunk ESCU, and other vendors' },
  [ROUTES.IMPORT_HISTORY]: { title: 'Import History', description: 'View past bulk imports and rollback if needed' },
  [ROUTES.PLAYBOOKS]: { title: 'Playbooks', description: 'Guided multi-step analysis workflows for detection coverage' },
  [ROUTES.ONBOARDING]: { title: 'Add Official Sources', description: 'Import detection rules from official vendor repositories' },
  [ROUTES.PIPELINE]: { title: 'Pipeline', description: 'Visual detection lifecycle management' },
  [ROUTES.INTEGRATIONS]: { title: 'Integrations', description: 'Connect your SIEM, SOAR, and security tools' },
  [ROUTES.INTEGRATION_DETAIL]: { title: 'Integration Details', description: undefined },
  [ROUTES.SCORING]: { title: 'Defense Impact Intelligence', description: 'Configure detection scoring and impact metrics' },
  [ROUTES.USERS]: { title: 'User Management', description: 'Manage user accounts and permissions' },
  [ROUTES.MITRE_SYNC]: { title: 'Data Sync', description: 'Sync MITRE ATT&CK data and vector embeddings' },
  [ROUTES.AUDIT_LOG]: { title: 'Audit Log', description: 'Enterprise audit trail for compliance and accountability' },
  [ROUTES.ENVIRONMENT_PROFILE]: { title: 'Environment Profile', description: 'Configure your security environment for personalized intelligence' },
  [ROUTES.SIEM_HEALTH]: { title: 'SIEM Health', description: 'Monitor SIEM deployment health, drift detection, and deploy queue' },
  [ROUTES.ACTION_PLAN]: { title: 'Detection Action Plan', description: 'Prioritized detection deployment roadmap' },
  [ROUTES.EXERCISES_STATE_SPONSORED]: { title: 'State Sponsored Attack Report', description: 'Defense exercise: state-sponsored threat posture analysis' },
  [ROUTES.ACCOUNT]: { title: 'Account Settings', description: 'Manage your profile and preferences' },
  [ROUTES.SUBMISSIONS]: { title: 'My Submissions', description: 'Track your publication requests' },
  [ROUTES.APPROVAL_QUEUE]: { title: 'Approval Queue', description: 'Review promotion requests for Production Library' },
  [ROUTES.SEARCH]: { title: 'Search Results' },
  [ROUTES.COMPONENT_SHOWCASE]: { title: 'Design System', description: 'M3 Design System Components' },
  [ROUTES.DESIGN_SYSTEM_BUTTONS]: { title: 'Buttons', description: 'Button components and variants' },
  [ROUTES.DESIGN_SYSTEM_INPUTS]: { title: 'Inputs', description: 'Form inputs and text fields' },
  [ROUTES.DESIGN_SYSTEM_BADGES]: { title: 'Badges & Chips', description: 'Status badges and filter chips' },
  [ROUTES.DESIGN_SYSTEM_CARDS]: { title: 'Cards', description: 'Card layouts and containers' },
  [ROUTES.DESIGN_SYSTEM_NAVIGATION]: { title: 'Navigation', description: 'Navigation components' },
  [ROUTES.DESIGN_SYSTEM_MODALS]: { title: 'Modals', description: 'Dialogs and modal windows' },
  [ROUTES.DESIGN_SYSTEM_DROPDOWNS]: { title: 'Dropdowns', description: 'Dropdown menus and selects' },
  [ROUTES.DESIGN_SYSTEM_LOADING]: { title: 'Loading', description: 'Loading states and spinners' },
  [ROUTES.DESIGN_SYSTEM_MISC]: { title: 'Miscellaneous', description: 'Other UI components' },
  [ROUTES.DESIGN_SYSTEM_COLORS]: { title: 'Color System', description: 'Theme colors and palettes' },
  [ROUTES.DESIGN_SYSTEM_BULK_IMPORT]: { title: 'Bulk Import UI', description: 'Design options for the bulk import wizard' },
  [ROUTES.DESIGN_SYSTEM_LOGO]: { title: 'Logo Options', description: 'Color combinations for the Optimus logo' },
  [ROUTES.DESIGN_SYSTEM_MITRE_TOOLTIP]: { title: 'MITRE Tooltip', description: 'Technique tooltip redesign options' },
  [ROUTES.DESIGN_SYSTEM_INTEL_CARDS]: { title: 'Intel Cards', description: 'Intelligence entity card design options' },
  [ROUTES.DESIGN_SYSTEM_AI_CHAT_CARDS]: { title: 'AI Chat Cards', description: 'Optimus Prime AI response card types' },
};
