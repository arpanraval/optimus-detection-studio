import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { 
  Role, 
  Permission, 
  ROLE_PERMISSIONS, 
  ROLE_HIERARCHY,
  UserPermissions,
  Detection,
  Profile,
} from '../types';
import { logger } from '../lib/logger';

// ============================================
// CONTEXT TYPE
// ============================================

interface PermissionsContextType {
  // Current user's permissions
  permissions: UserPermissions | null;
  isLoading: boolean;
  error: string | null;
  
  // Permission check helpers
  can: (permission: Permission) => boolean;
  canAny: (permissions: Permission[]) => boolean;
  canAll: (permissions: Permission[]) => boolean;
  
  // Role check helpers
  hasRole: (role: Role) => boolean;
  hasRoleOrHigher: (role: Role) => boolean;
  
  // Detection-specific permission checks
  canEditDetection: (detection: Detection) => boolean;
  canDeleteDetection: (detection: Detection) => boolean;
  canAssignDetection: (detection: Detection) => boolean;
  canReviewDetection: (detection: Detection) => boolean;
  
  // Refresh permissions
  refreshPermissions: () => Promise<void>;
  
  // Current team context (for filtering, not permissions)
  currentTeamId: string | null;
  setCurrentTeamId: (teamId: string | null) => void;
  
  // User info
  userId: string | null;
  userRole: Role;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

// ============================================
// PROVIDER
// ============================================

interface PermissionsProviderProps {
  children: React.ReactNode;
  userId: string;
  initialTeamId?: string;
}

export const PermissionsProvider: React.FC<PermissionsProviderProps> = ({ 
  children, 
  userId,
  initialTeamId 
}) => {
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(initialTeamId || null);

  // Fetch permissions from profiles.role (GLOBAL role)
  const fetchPermissions = useCallback(async () => {
    if (!userId) {
      setPermissions(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get the user's profile - this is the ONLY source of role truth
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, status')
        .eq('id', userId)
        .single();

      if (profileError) {
        throw new Error('Could not fetch user profile');
      }

      // Get global role from profiles.role
      const globalRole = (profile?.role as Role) || 'viewer';

      // If no team specified, try to get user's first team (for team context, not permissions)
      let teamId = currentTeamId;
      if (!teamId) {
        const { data: membership } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('user_id', userId)
          .limit(1)
          .single();

        if (membership) {
          teamId = membership.team_id;
          setCurrentTeamId(teamId);
        }
      }

      // Build permissions object from GLOBAL role
      const rolePermissions = ROLE_PERMISSIONS[globalRole] || ROLE_PERMISSIONS.viewer;
      const permissionsMap: Record<string, boolean> = {};
      
      rolePermissions.forEach(perm => {
        permissionsMap[perm] = true;
      });

      setPermissions({
        user_id: userId,
        team_id: teamId || undefined,
        role: globalRole,
        is_global_admin: globalRole === 'owner' || globalRole === 'admin',
        permissions: permissionsMap,
      });

    } catch (err) {
      logger.error('Error fetching permissions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch permissions');
      
      // Set default viewer permissions on error
      setPermissions({
        user_id: userId,
        team_id: undefined,
        role: 'viewer',
        is_global_admin: false,
        permissions: {},
      });
    } finally {
      setIsLoading(false);
    }
  }, [userId, currentTeamId]);

  // Fetch on mount and when dependencies change
  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Permission check: single permission
  const can = useCallback((permission: Permission): boolean => {
    if (!permissions) return false;
    return permissions.permissions[permission] === true;
  }, [permissions]);

  // Permission check: any of the permissions
  const canAny = useCallback((perms: Permission[]): boolean => {
    return perms.some(p => can(p));
  }, [can]);

  // Permission check: all permissions required
  const canAll = useCallback((perms: Permission[]): boolean => {
    return perms.every(p => can(p));
  }, [can]);

  // Role check: exact role
  const hasRole = useCallback((role: Role): boolean => {
    if (!permissions) return false;
    return permissions.role === role;
  }, [permissions]);

  // Role check: role or higher in hierarchy
  const hasRoleOrHigher = useCallback((role: Role): boolean => {
    if (!permissions) return false;
    return ROLE_HIERARCHY[permissions.role] >= ROLE_HIERARCHY[role];
  }, [permissions]);

  // Detection-specific: can edit
  const canEditDetection = useCallback((detection: Detection): boolean => {
    if (!permissions || !userId) return false;
    
    // Owner of detection can always edit
    if (detection.user_id === userId) {
      return can('detection:update:own');
    }
    
    // Assigned user can edit
    if (detection.assigned_to === userId) {
      return can('detection:update:assigned');
    }
    
    // Users with update:any permission can edit any detection
    return can('detection:update:any');
  }, [permissions, userId, can]);

  // Detection-specific: can delete
  const canDeleteDetection = useCallback((detection: Detection): boolean => {
    if (!permissions || !userId) return false;
    
    // Owner of detection can delete their own
    if (detection.user_id === userId) {
      return can('detection:delete:own');
    }
    
    // Users with delete:any permission can delete any detection
    return can('detection:delete:any');
  }, [permissions, userId, can]);

  // Detection-specific: can assign
  const canAssignDetection = useCallback((detection: Detection): boolean => {
    if (!permissions) return false;
    
    // Can assign others
    if (can('assignment:others')) return true;
    
    // Can self-assign (only to self, only if unassigned)
    if (can('assignment:self') && !detection.assigned_to) return true;
    
    return false;
  }, [permissions, can]);

  // Detection-specific: can review
  const canReviewDetection = useCallback((detection: Detection): boolean => {
    if (!permissions || !userId) return false;
    
    // Can't review own detection
    if (detection.user_id === userId) return false;
    
    return can('review:perform');
  }, [permissions, userId, can]);

  // Memoized context value
  const contextValue = useMemo<PermissionsContextType>(() => ({
    permissions,
    isLoading,
    error,
    can,
    canAny,
    canAll,
    hasRole,
    hasRoleOrHigher,
    canEditDetection,
    canDeleteDetection,
    canAssignDetection,
    canReviewDetection,
    refreshPermissions: fetchPermissions,
    currentTeamId,
    setCurrentTeamId,
    userId,
    userRole: permissions?.role || 'viewer',
  }), [
    permissions,
    isLoading,
    error,
    can,
    canAny,
    canAll,
    hasRole,
    hasRoleOrHigher,
    canEditDetection,
    canDeleteDetection,
    canAssignDetection,
    canReviewDetection,
    fetchPermissions,
    currentTeamId,
    userId,
  ]);

  return (
    <PermissionsContext.Provider value={contextValue}>
      {children}
    </PermissionsContext.Provider>
  );
};

// ============================================
// HOOK
// ============================================

export const usePermissions = (): PermissionsContextType => {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
};

// ============================================
// UTILITY COMPONENTS
// ============================================

interface PermissionGateProps {
  children: React.ReactNode;
  permission?: Permission;
  permissions?: Permission[];
  requireAll?: boolean;
  fallback?: React.ReactNode;
  role?: Role;
}

/**
 * Conditionally render children based on permissions
 * 
 * Usage:
 * <PermissionGate permission="detection:create">
 *   <CreateButton />
 * </PermissionGate>
 * 
 * <PermissionGate permissions={['detection:update:any', 'detection:update:own']} requireAll={false}>
 *   <EditButton />
 * </PermissionGate>
 * 
 * <PermissionGate role="lead">
 *   <LeadOnlyContent />
 * </PermissionGate>
 */
export const PermissionGate: React.FC<PermissionGateProps> = ({
  children,
  permission,
  permissions,
  requireAll = false,
  fallback = null,
  role,
}) => {
  const { can, canAny, canAll, hasRoleOrHigher } = usePermissions();

  let hasAccess = false;

  if (role) {
    hasAccess = hasRoleOrHigher(role);
  } else if (permission) {
    hasAccess = can(permission);
  } else if (permissions) {
    hasAccess = requireAll ? canAll(permissions) : canAny(permissions);
  }

  return hasAccess ? <>{children}</> : <>{fallback}</>;
};

/**
 * Hook to check if user can perform action on a specific detection
 */
export const useDetectionPermissions = (detection: Detection | null) => {
  const { 
    canEditDetection, 
    canDeleteDetection, 
    canAssignDetection, 
    canReviewDetection,
    can,
    userId 
  } = usePermissions();

  return useMemo(() => {
    if (!detection) {
      return {
        canView: false,
        canEdit: false,
        canDelete: false,
        canAssign: false,
        canReview: false,
        canComment: false,
        canRequestReview: false,
        isOwner: false,
        isAssigned: false,
      };
    }

    const isOwner = detection.user_id === userId;
    const isAssigned = detection.assigned_to === userId;

    return {
      canView: can('detection:read'),
      canEdit: canEditDetection(detection),
      canDelete: canDeleteDetection(detection),
      canAssign: canAssignDetection(detection),
      canReview: canReviewDetection(detection),
      canComment: can('comment:create'),
      canRequestReview: (isOwner || isAssigned) && can('review:request'),
      isOwner,
      isAssigned,
    };
  }, [detection, canEditDetection, canDeleteDetection, canAssignDetection, canReviewDetection, can, userId]);
};

export default PermissionsContext;