// ============================================
// ROLE & PERMISSION TYPES (RBAC)
// ============================================

/**
 * Global user role - stored in profiles.role
 * This is the single source of truth for user permissions across the app.
 */
export type Role = 'owner' | 'admin' | 'lead' | 'analyst' | 'viewer';

/** Role hierarchy for permission inheritance */
export const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 5,
  admin: 4,
  lead: 3,
  analyst: 2,
  viewer: 1,
};

/** Check if a role has at least the required level */
export const hasRoleLevel = (userRole: Role, requiredRole: Role): boolean => {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
};

/** All available permissions in the system */
export type Permission =
  // Detection permissions
  | 'detection:create'
  | 'detection:read'
  | 'detection:update:own'
  | 'detection:update:assigned'
  | 'detection:update:any'
  | 'detection:delete:own'
  | 'detection:delete:any'
  // Development library permissions
  | 'development:read'
  | 'development:promote'
  | 'development:approve_promotion'
  // Assignment permissions
  | 'assignment:self'
  | 'assignment:others'
  | 'assignment:view'
  // Review permissions
  | 'review:request'
  | 'review:perform'
  | 'review:view'
  // Comment permissions
  | 'comment:create'
  | 'comment:edit:own'
  | 'comment:delete:own'
  | 'comment:resolve'
  // User management permissions
  | 'user:invite'
  | 'user:manage'
  | 'user:view'
  // Activity & audit permissions
  | 'activity:view:own'
  | 'activity:export';

/** Permission sets by role */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    'detection:create', 'detection:read', 'detection:update:own', 'detection:update:assigned',
    'detection:update:any', 'detection:delete:own', 'detection:delete:any',
    'development:read', 'development:promote', 'development:approve_promotion',
    'assignment:self', 'assignment:others', 'assignment:view',
    'review:request', 'review:perform', 'review:view',
    'comment:create', 'comment:edit:own', 'comment:delete:own', 'comment:resolve',
    'user:invite', 'user:manage', 'user:view',
    'activity:view:own', 'activity:export',
  ],
  admin: [
    'detection:create', 'detection:read', 'detection:update:own', 'detection:update:assigned',
    'detection:update:any', 'detection:delete:own', 'detection:delete:any',
    'development:read', 'development:promote', 'development:approve_promotion',
    'assignment:self', 'assignment:others', 'assignment:view',
    'review:request', 'review:perform', 'review:view',
    'comment:create', 'comment:edit:own', 'comment:delete:own', 'comment:resolve',
    'user:invite', 'user:manage', 'user:view',
    'activity:view:own', 'activity:export',
  ],
  lead: [
    'detection:create', 'detection:read', 'detection:update:own', 'detection:update:assigned',
    'detection:update:any', 'detection:delete:own', 'detection:delete:any',
    'development:read', 'development:promote',
    'assignment:self', 'assignment:others', 'assignment:view',
    'review:request', 'review:perform', 'review:view',
    'comment:create', 'comment:edit:own', 'comment:delete:own', 'comment:resolve',
    'user:view',
    'activity:view:own',
  ],
  analyst: [
    'detection:create', 'detection:read', 'detection:update:own', 'detection:update:assigned',
    'detection:delete:own',
    'development:read',
    'assignment:self', 'assignment:view',
    'review:request', 'review:view',
    'comment:create', 'comment:edit:own', 'comment:delete:own',
    'user:view',
    'activity:view:own',
  ],
  viewer: [
    'detection:read',
    'development:read',
    'assignment:view',
    'review:view',
    'comment:create', 'comment:edit:own',
    'user:view',
    'activity:view:own',
  ],
};

// ============================================
// PERMISSIONS CONTEXT TYPES
// ============================================

/** User's resolved permissions */
export interface UserPermissions {
  user_id: string;
  role: Role;
  is_global_admin: boolean;
  permissions: Record<string, boolean>;
}

/** Permission check result from database */
export interface PermissionCheckResult {
  user_id: string;
  role: Role;
  is_global_admin: boolean;
  permissions: Record<string, boolean>;
}

// ============================================================================
// GRANULAR PERMISSIONS SYSTEM
// ============================================================================

/**
 * All granular permissions available in the system
 */
export type GranularPermission =
  // Detection Management
  | 'detection:create'
  | 'detection:edit_own'
  | 'detection:edit_any'
  | 'detection:delete_own'
  | 'detection:delete_any'
  | 'detection:export'
  | 'detection:import'
  // Review & Workflow
  | 'review:request'
  | 'review:perform'
  | 'review:approve'
  | 'assignment:self'
  | 'assignment:others'
  | 'assignment:remove'
  // Library Access
  | 'library:view_personal'
  | 'library:view_development'
  | 'library:copy_development'
  | 'library:publish'
  | 'library:approve_publish'
  // AI & Tools
  | 'tools:ai_query_gen'
  | 'tools:sigma_converter'
  | 'tools:ai_agent'
  | 'tools:export_reports'
  // MITRE & Threat Intel
  | 'mitre:view_coverage'
  | 'mitre:view_groups'
  | 'mitre:view_software'
  | 'mitre:view_campaigns'
  | 'mitre:link_entities'
  // Integrations
  | 'integrations:view'
  | 'integrations:configure'
  | 'integrations:sync'
  // Settings
  | 'settings:edit_profile'
  | 'settings:change_password'
  | 'settings:enable_mfa';

/**
 * Permission categories for UI grouping
 */
export interface PermissionCategory {
  id: string;
  label: string;
  description: string;
  permissions: {
    key: GranularPermission;
    label: string;
    description: string;
  }[];
}

/**
 * All permission categories
 */
export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    id: 'detection',
    label: 'Detection Management',
    description: 'Create, edit, delete, and manage detections',
    permissions: [
      { key: 'detection:create', label: 'Create detections', description: 'Create new detection rules' },
      { key: 'detection:edit_own', label: 'Edit own detections', description: 'Edit detections you created' },
      { key: 'detection:edit_any', label: 'Edit any detection', description: 'Edit any detection in the library' },
      { key: 'detection:delete_own', label: 'Delete own detections', description: 'Delete detections you created' },
      { key: 'detection:delete_any', label: 'Delete any detection', description: 'Delete any detection in the library' },
      { key: 'detection:export', label: 'Export detections', description: 'Export to PDF, JSON, YAML' },
      { key: 'detection:import', label: 'Import detections', description: 'Import from external sources' },
    ],
  },
  {
    id: 'review',
    label: 'Review & Workflow',
    description: 'Review process and assignment workflow',
    permissions: [
      { key: 'review:request', label: 'Request review', description: 'Submit detections for review' },
      { key: 'review:perform', label: 'Perform reviews', description: 'Review detections submitted by others' },
      { key: 'review:approve', label: 'Approve/Reject', description: 'Final approval authority' },
      { key: 'assignment:self', label: 'Self-assign', description: 'Assign detections to yourself' },
      { key: 'assignment:others', label: 'Assign to others', description: 'Assign detections to other users' },
      { key: 'assignment:remove', label: 'Remove assignments', description: 'Unassign detections' },
    ],
  },
  {
    id: 'library',
    label: 'Library Access',
    description: 'Access to detection libraries',
    permissions: [
      { key: 'library:view_personal', label: 'View personal library', description: 'Access your own detections' },
      { key: 'library:view_development', label: 'View development library', description: 'Access the development library' },
      { key: 'library:copy_development', label: 'Fork from production', description: 'Fork rules from production library' },
      { key: 'library:publish', label: 'Submit for promotion', description: 'Submit rules for promotion to production' },
      { key: 'library:approve_publish', label: 'Approve promotions', description: 'Approve promotion requests' },
    ],
  },
  {
    id: 'tools',
    label: 'AI & Tools',
    description: 'Access to AI assistants and tools',
    permissions: [
      { key: 'tools:ai_query_gen', label: 'AI Query Generator', description: 'Generate queries with AI' },
      { key: 'tools:sigma_converter', label: 'Sigma Converter', description: 'Convert Sigma rules' },
      { key: 'tools:ai_agent', label: 'AI Agent (Optimus)', description: 'Use the AI assistant' },
      { key: 'tools:export_reports', label: 'Export reports', description: 'Generate and export reports' },
    ],
  },
  {
    id: 'mitre',
    label: 'MITRE & Threat Intel',
    description: 'Threat intelligence and MITRE ATT&CK',
    permissions: [
      { key: 'mitre:view_coverage', label: 'View coverage', description: 'See MITRE coverage analytics' },
      { key: 'mitre:view_groups', label: 'View threat groups', description: 'Access threat group profiles' },
      { key: 'mitre:view_software', label: 'View software', description: 'Access malware/tool profiles' },
      { key: 'mitre:view_campaigns', label: 'View campaigns', description: 'Access campaign profiles' },
      { key: 'mitre:link_entities', label: 'Link entities', description: 'Link detections to MITRE entities' },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    description: 'External tool integrations',
    permissions: [
      { key: 'integrations:view', label: 'View integrations', description: 'See configured integrations' },
      { key: 'integrations:configure', label: 'Configure integrations', description: 'Set up new integrations' },
      { key: 'integrations:sync', label: 'Sync to SIEM', description: 'Push rules to connected SIEMs' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Personal settings',
    permissions: [
      { key: 'settings:edit_profile', label: 'Edit profile', description: 'Change display name, avatar' },
      { key: 'settings:change_password', label: 'Change password', description: 'Update account password' },
      { key: 'settings:enable_mfa', label: 'Enable MFA', description: 'Set up two-factor authentication' },
    ],
  },
];

/**
 * Default permissions for each role
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<string, GranularPermission[]> = {
  owner: [
    // All permissions
    'detection:create', 'detection:edit_own', 'detection:edit_any', 'detection:delete_own', 'detection:delete_any', 'detection:export', 'detection:import',
    'review:request', 'review:perform', 'review:approve', 'assignment:self', 'assignment:others', 'assignment:remove',
    'library:view_personal', 'library:view_development', 'library:copy_development', 'library:publish', 'library:approve_publish',
    'tools:ai_query_gen', 'tools:sigma_converter', 'tools:ai_agent', 'tools:export_reports',
    'mitre:view_coverage', 'mitre:view_groups', 'mitre:view_software', 'mitre:view_campaigns', 'mitre:link_entities',
    'integrations:view', 'integrations:configure', 'integrations:sync',
    'settings:edit_profile', 'settings:change_password', 'settings:enable_mfa',
  ],
  admin: [
    'detection:create', 'detection:edit_own', 'detection:edit_any', 'detection:delete_own', 'detection:delete_any', 'detection:export', 'detection:import',
    'review:request', 'review:perform', 'review:approve', 'assignment:self', 'assignment:others', 'assignment:remove',
    'library:view_personal', 'library:view_development', 'library:copy_development', 'library:publish', 'library:approve_publish',
    'tools:ai_query_gen', 'tools:sigma_converter', 'tools:ai_agent', 'tools:export_reports',
    'mitre:view_coverage', 'mitre:view_groups', 'mitre:view_software', 'mitre:view_campaigns', 'mitre:link_entities',
    'integrations:view', 'integrations:configure', 'integrations:sync',
    'settings:edit_profile', 'settings:change_password', 'settings:enable_mfa',
  ],
  lead: [
    'detection:create', 'detection:edit_own', 'detection:edit_any', 'detection:delete_own', 'detection:export', 'detection:import',
    'review:request', 'review:perform', 'review:approve', 'assignment:self', 'assignment:others', 'assignment:remove',
    'library:view_personal', 'library:view_development', 'library:copy_development', 'library:publish',
    'tools:ai_query_gen', 'tools:sigma_converter', 'tools:ai_agent', 'tools:export_reports',
    'mitre:view_coverage', 'mitre:view_groups', 'mitre:view_software', 'mitre:view_campaigns', 'mitre:link_entities',
    'integrations:view', 'integrations:sync',
    'settings:edit_profile', 'settings:change_password', 'settings:enable_mfa',
  ],
  analyst: [
    'detection:create', 'detection:edit_own', 'detection:delete_own', 'detection:export',
    'review:request', 'assignment:self',
    'library:view_personal', 'library:view_development', 'library:copy_development',
    'tools:ai_query_gen', 'tools:sigma_converter', 'tools:ai_agent', 'tools:export_reports',
    'mitre:view_coverage', 'mitre:view_groups', 'mitre:view_software', 'mitre:view_campaigns', 'mitre:link_entities',
    'integrations:view',
    'settings:edit_profile', 'settings:change_password', 'settings:enable_mfa',
  ],
  viewer: [
    'library:view_personal', 'library:view_development',
    'mitre:view_coverage', 'mitre:view_groups', 'mitre:view_software', 'mitre:view_campaigns',
    'integrations:view',
    'settings:edit_profile', 'settings:change_password', 'settings:enable_mfa',
  ],
};

/**
 * User's custom permission overrides
 */
export interface UserPermissionOverrides {
  userId: string;
  /** Permissions added beyond role defaults */
  granted: GranularPermission[];
  /** Permissions removed from role defaults */
  revoked: GranularPermission[];
  updatedAt: string;
  updatedBy: string;
}

/**
 * Calculate effective permissions for a user
 */
export const getEffectivePermissions = (
  role: string,
  overrides?: UserPermissionOverrides
): Set<GranularPermission> => {
  const rolePerms = new Set<GranularPermission>(ROLE_DEFAULT_PERMISSIONS[role] || []);

  if (overrides) {
    // Add granted permissions
    overrides.granted.forEach(p => rolePerms.add(p));
    // Remove revoked permissions
    overrides.revoked.forEach(p => rolePerms.delete(p));
  }

  return rolePerms;
};

/**
 * Check if user has a specific permission
 */
export const hasPermission = (
  role: string,
  permission: GranularPermission,
  overrides?: UserPermissionOverrides
): boolean => {
  const effectivePerms = getEffectivePermissions(role, overrides);
  return effectivePerms.has(permission);
};
