import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { 
  Workspace, 
  WorkspaceWithRole, 
  WorkspaceMember, 
  WorkspaceDetection,
  WorkspaceDetectionWithDetails,
  WorkspaceStats,
  WorkspaceRole,
  Detection
} from '../types';
import { useToast } from '../hooks/useToast';
import { logger } from '../lib/logger';

// ============================================
// ALLOWED FIELDS FOR UPDATES (Mass Assignment Protection)
// ============================================

/**
 * Fields that can be updated via updateWorkspace.
 * Protected fields like id, created_by, created_at are excluded.
 */
const WORKSPACE_UPDATABLE_FIELDS = [
  'name',
  'slug',
  'description',
  'icon',
  'settings',
  'git_repo_url',
  'git_branch',
  'git_sync_enabled',
  'deployment_targets',
] as const;

type WorkspaceUpdatableField = typeof WORKSPACE_UPDATABLE_FIELDS[number];

/**
 * Filter an updates object to only include allowed fields.
 * Prevents mass assignment attacks by ignoring protected fields.
 */
function filterWorkspaceFields(updates: Partial<Workspace>): Partial<Workspace> {
  const filtered: Partial<Workspace> = {};
  for (const field of WORKSPACE_UPDATABLE_FIELDS) {
    if (field in updates && updates[field as keyof Workspace] !== undefined) {
      (filtered as Record<string, unknown>)[field] = updates[field as keyof Workspace];
    }
  }
  return filtered;
}

// ============================================
// CONTEXT TYPE
// ============================================

interface WorkspaceContextType {
  // Current workspace
  currentWorkspace: Workspace | null;
  currentWorkspaceRole: WorkspaceRole | null;
  isLoading: boolean;
  error: string | null;
  
  // User's workspaces
  userWorkspaces: WorkspaceWithRole[];
  workspacesLoading: boolean;
  
  // Members of current workspace
  members: WorkspaceMember[];
  membersLoading: boolean;
  
  // Detections in current workspace
  workspaceDetections: WorkspaceDetectionWithDetails[];
  detectionsLoading: boolean;
  
  // Statistics
  stats: WorkspaceStats | null;
  
  // Available updates count
  updatesAvailable: number;
  
  // Actions - Workspace Management
  createWorkspace: (name: string, slug: string, description?: string, icon?: string) => Promise<{ success: boolean; workspace_id?: string; error?: string }>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  updateWorkspace: (workspaceId: string, updates: Partial<Workspace>) => Promise<{ success: boolean; error?: string }>;
  deleteWorkspace: (workspaceId: string) => Promise<{ success: boolean; error?: string }>;
  clearCurrentWorkspace: () => void;
  
  // Actions - Detection Management
  addDetection: (detectionId: string) => Promise<{ success: boolean; error?: string }>;
  addDetections: (detectionIds: string[]) => Promise<{ success: boolean; added: number; skipped: number; errors: string[] }>;
  removeDetection: (detectionId: string) => Promise<{ success: boolean; error?: string }>;
  saveOverride: (detectionId: string, overrides: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  pullUpdate: (detectionId: string, keepOverrides?: boolean) => Promise<{ success: boolean; error?: string }>;
  pullAllUpdates: (keepOverrides?: boolean) => Promise<{ success: boolean; updated: number; error?: string }>;
  
  // Actions - Member Management
  inviteMember: (email: string, role: WorkspaceRole) => Promise<{ success: boolean; error?: string }>;
  removeMember: (userId: string) => Promise<{ success: boolean; error?: string }>;
  changeMemberRole: (userId: string, newRole: WorkspaceRole) => Promise<{ success: boolean; error?: string }>;
  
  // Refresh actions
  refreshWorkspaces: () => Promise<void>;
  refreshMembers: () => Promise<void>;
  refreshDetections: () => Promise<void>;
  refreshStats: () => Promise<void>;
  
  // Helpers
  hasPermission: (requiredRoles: WorkspaceRole[]) => boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

// ============================================
// PROVIDER
// ============================================

interface WorkspaceProviderProps {
  children: React.ReactNode;
  userId: string;
}

export const WorkspaceProvider: React.FC<WorkspaceProviderProps> = ({ children, userId }) => {
  const { showToast } = useToast();
  
  // State
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [currentWorkspaceRole, setCurrentWorkspaceRole] = useState<WorkspaceRole | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [userWorkspaces, setUserWorkspaces] = useState<WorkspaceWithRole[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  
  const [workspaceDetections, setWorkspaceDetections] = useState<WorkspaceDetectionWithDetails[]>([]);
  const [detectionsLoading, setDetectionsLoading] = useState(false);
  
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [updatesAvailable, setUpdatesAvailable] = useState(0);

  // ============================================
  // FETCH FUNCTIONS
  // ============================================

  const fetchUserWorkspaces = useCallback(async () => {
    if (!userId) return;
    setWorkspacesLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_user_workspaces', { p_user_id: userId });
      if (error) throw error;
      setUserWorkspaces(data || []);
    } catch (err) {
      logger.error('Error fetching workspaces:', err);
    } finally {
      setWorkspacesLoading(false);
    }
  }, [userId]);

  const fetchWorkspaceDetails = useCallback(async (workspaceId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch workspace
      const { data: workspace, error: wsError } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', workspaceId)
        .single();
      
      if (wsError) throw wsError;
      setCurrentWorkspace(workspace);
      
      // Fetch user's role in this workspace
      const { data: roleData } = await supabase.rpc('get_workspace_role', { 
        p_workspace_id: workspaceId,
        p_user_id: userId 
      });
      setCurrentWorkspaceRole(roleData);
      
    } catch (err) {
      logger.error('Error fetching workspace:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch workspace');
      setCurrentWorkspace(null);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const fetchMembers = useCallback(async () => {
    if (!currentWorkspace?.id) {
      setMembers([]);
      return;
    }
    setMembersLoading(true);
    try {
      const { data, error } = await supabase
        .from('workspace_members')
        .select(`
          *,
          user:profiles!workspace_members_user_id_fkey (
            id, email, full_name, avatar_url, status, role
          )
        `)
        .eq('workspace_id', currentWorkspace.id)
        .eq('status', 'active');
      
      if (error) throw error;
      setMembers(data || []);
    } catch (err) {
      logger.error('Error fetching members:', err);
    } finally {
      setMembersLoading(false);
    }
  }, [currentWorkspace?.id]);

  const fetchDetections = useCallback(async () => {
    if (!currentWorkspace?.id) {
      setWorkspaceDetections([]);
      return;
    }
    setDetectionsLoading(true);
    try {
      const { data, error } = await supabase
        .from('workspace_detections')
        .select(`
          *,
          detection:detections!workspace_detections_detection_id_fkey (*)
        `)
        .eq('workspace_id', currentWorkspace.id);
      
      if (error) throw error;
      setWorkspaceDetections(data || []);
      
      // Count updates available
      const outdated = (data || []).filter(d => d.sync_status === 'outdated' || d.sync_status === 'diverged').length;
      setUpdatesAvailable(outdated);
    } catch (err) {
      logger.error('Error fetching workspace detections:', err);
    } finally {
      setDetectionsLoading(false);
    }
  }, [currentWorkspace?.id]);

  const fetchStats = useCallback(async () => {
    if (!currentWorkspace?.id) {
      setStats(null);
      return;
    }
    try {
      const { data, error } = await supabase.rpc('get_workspace_stats', { 
        p_workspace_id: currentWorkspace.id 
      });
      if (error) throw error;
      setStats(data);
    } catch (err) {
      logger.error('Error fetching stats:', err);
    }
  }, [currentWorkspace?.id]);

  // ============================================
  // WORKSPACE ACTIONS
  // ============================================

  const createWorkspace = useCallback(async (
    name: string, 
    slug: string, 
    description?: string, 
    icon?: string
  ): Promise<{ success: boolean; workspace_id?: string; error?: string }> => {
    try {
      const { data, error } = await supabase.rpc('create_workspace', {
        p_name: name,
        p_slug: slug,
        p_description: description || null,
        p_icon: icon || '🏢',
        p_type: 'team'
      });
      
      if (error) throw error;
      if (!data.success) return { success: false, error: data.error };
      
      showToast('success', 'Workspace Created', `"${name}" has been created`);
      await fetchUserWorkspaces();
      return { success: true, workspace_id: data.workspace_id };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create workspace';
      showToast('error', 'Creation Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [fetchUserWorkspaces, showToast]);

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    await fetchWorkspaceDetails(workspaceId);
  }, [fetchWorkspaceDetails]);

  const clearCurrentWorkspace = useCallback(() => {
    setCurrentWorkspace(null);
    setCurrentWorkspaceRole(null);
    setMembers([]);
    setWorkspaceDetections([]);
    setStats(null);
    setUpdatesAvailable(0);
  }, []);

  const updateWorkspace = useCallback(async (
    workspaceId: string,
    updates: Partial<Workspace>
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // Filter to allowed fields only (mass assignment protection)
      const safeUpdates = filterWorkspaceFields(updates);

      if (Object.keys(safeUpdates).length === 0) {
        return { success: false, error: 'No valid fields to update' };
      }

      const { error } = await supabase
        .from('workspaces')
        .update({
          ...safeUpdates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', workspaceId);

      if (error) throw error;

      showToast('success', 'Workspace Updated', 'Changes saved successfully');
      if (workspaceId === currentWorkspace?.id) {
        await fetchWorkspaceDetails(workspaceId);
      }
      await fetchUserWorkspaces();
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update workspace';
      showToast('error', 'Update Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [currentWorkspace?.id, fetchWorkspaceDetails, fetchUserWorkspaces, showToast]);

  const deleteWorkspace = useCallback(async (workspaceId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase
        .from('workspaces')
        .delete()
        .eq('id', workspaceId);
      
      if (error) throw error;
      
      showToast('success', 'Workspace Deleted', 'Workspace has been deleted');
      if (workspaceId === currentWorkspace?.id) {
        clearCurrentWorkspace();
      }
      await fetchUserWorkspaces();
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete workspace';
      showToast('error', 'Deletion Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [currentWorkspace?.id, clearCurrentWorkspace, fetchUserWorkspaces, showToast]);

  // ============================================
  // DETECTION ACTIONS
  // ============================================

  const addDetection = useCallback(async (detectionId: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentWorkspace?.id) return { success: false, error: 'No workspace selected' };
    
    try {
      const { data, error } = await supabase.rpc('add_detection_to_workspace', {
        p_workspace_id: currentWorkspace.id,
        p_detection_id: detectionId,
        p_user_id: userId
      });
      
      if (error) throw error;
      if (!data.success) return { success: false, error: data.error };
      
      showToast('success', 'Detection Added', 'Detection added to workspace');
      await fetchDetections();
      await fetchStats();
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add detection';
      showToast('error', 'Add Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [currentWorkspace?.id, userId, fetchDetections, fetchStats, showToast]);

  const addDetections = useCallback(async (detectionIds: string[]): Promise<{ success: boolean; added: number; skipped: number; errors: string[] }> => {
    if (!currentWorkspace?.id) return { success: false, added: 0, skipped: 0, errors: ['No workspace selected'] };
    
    try {
      const { data, error } = await supabase.rpc('bulk_add_detections_to_workspace', {
        p_workspace_id: currentWorkspace.id,
        p_detection_ids: detectionIds,
        p_user_id: userId
      });
      
      if (error) throw error;
      
      showToast('success', 'Detections Added', `Added ${data.added} detection(s)`);
      await fetchDetections();
      await fetchStats();
      return { success: true, added: data.added, skipped: data.skipped, errors: data.errors || [] };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add detections';
      showToast('error', 'Bulk Add Failed', errorMessage);
      return { success: false, added: 0, skipped: 0, errors: [errorMessage] };
    }
  }, [currentWorkspace?.id, userId, fetchDetections, fetchStats, showToast]);

  const removeDetection = useCallback(async (detectionId: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentWorkspace?.id) return { success: false, error: 'No workspace selected' };
    
    try {
      const { data, error } = await supabase.rpc('remove_detection_from_workspace', {
        p_workspace_id: currentWorkspace.id,
        p_detection_id: detectionId,
        p_user_id: userId
      });
      
      if (error) throw error;
      if (!data.success) return { success: false, error: data.error };
      
      showToast('success', 'Detection Removed', 'Detection removed from workspace');
      await fetchDetections();
      await fetchStats();
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove detection';
      showToast('error', 'Remove Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [currentWorkspace?.id, userId, fetchDetections, fetchStats, showToast]);

  const saveOverride = useCallback(async (
    detectionId: string, 
    overrides: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentWorkspace?.id) return { success: false, error: 'No workspace selected' };
    
    try {
      const { data, error } = await supabase.rpc('save_workspace_override', {
        p_workspace_id: currentWorkspace.id,
        p_detection_id: detectionId,
        p_overrides: overrides,
        p_user_id: userId
      });
      
      if (error) throw error;
      if (!data.success) return { success: false, error: data.error };
      
      showToast('success', 'Override Saved', 'Local customization saved');
      await fetchDetections();
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save override';
      showToast('error', 'Save Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [currentWorkspace?.id, userId, fetchDetections, showToast]);

  const pullUpdate = useCallback(async (
    detectionId: string, 
    keepOverrides: boolean = false
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentWorkspace?.id) return { success: false, error: 'No workspace selected' };
    
    try {
      const { data, error } = await supabase.rpc('pull_workspace_update', {
        p_workspace_id: currentWorkspace.id,
        p_detection_id: detectionId,
        p_keep_overrides: keepOverrides,
        p_user_id: userId
      });
      
      if (error) throw error;
      if (!data.success) return { success: false, error: data.error };
      
      showToast('success', 'Update Pulled', `Updated to v${data.new_version}`);
      await fetchDetections();
      await fetchStats();
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to pull update';
      showToast('error', 'Update Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [currentWorkspace?.id, userId, fetchDetections, fetchStats, showToast]);

  const pullAllUpdates = useCallback(async (keepOverrides: boolean = false): Promise<{ success: boolean; updated: number; error?: string }> => {
    if (!currentWorkspace?.id) return { success: false, updated: 0, error: 'No workspace selected' };
    
    try {
      const { data, error } = await supabase.rpc('bulk_pull_workspace_updates', {
        p_workspace_id: currentWorkspace.id,
        p_keep_overrides: keepOverrides,
        p_user_id: userId
      });
      
      if (error) throw error;
      if (!data.success) return { success: false, updated: 0, error: data.error };
      
      showToast('success', 'Updates Pulled', `Updated ${data.updated} detection(s)`);
      await fetchDetections();
      await fetchStats();
      return { success: true, updated: data.updated };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to pull updates';
      showToast('error', 'Bulk Update Failed', errorMessage);
      return { success: false, updated: 0, error: errorMessage };
    }
  }, [currentWorkspace?.id, userId, fetchDetections, fetchStats, showToast]);

  // ============================================
  // MEMBER ACTIONS
  // ============================================

  const inviteMember = useCallback(async (
    email: string, 
    role: WorkspaceRole
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentWorkspace?.id) return { success: false, error: 'No workspace selected' };
    
    try {
      const { error } = await supabase
        .from('workspace_invitations')
        .insert({
          workspace_id: currentWorkspace.id,
          email,
          role,
          invited_by: userId
        });
      
      if (error) throw error;
      
      showToast('success', 'Invitation Sent', `Invitation sent to ${email}`);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send invitation';
      showToast('error', 'Invitation Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [currentWorkspace?.id, userId, showToast]);

  const removeMember = useCallback(async (memberId: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentWorkspace?.id) return { success: false, error: 'No workspace selected' };
    
    try {
      const { error } = await supabase
        .from('workspace_members')
        .delete()
        .eq('workspace_id', currentWorkspace.id)
        .eq('user_id', memberId);
      
      if (error) throw error;
      
      showToast('success', 'Member Removed', 'Member has been removed');
      await fetchMembers();
      await fetchStats();
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove member';
      showToast('error', 'Remove Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [currentWorkspace?.id, fetchMembers, fetchStats, showToast]);

  const changeMemberRole = useCallback(async (
    memberId: string, 
    newRole: WorkspaceRole
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentWorkspace?.id) return { success: false, error: 'No workspace selected' };
    
    try {
      const { error } = await supabase
        .from('workspace_members')
        .update({ role: newRole })
        .eq('workspace_id', currentWorkspace.id)
        .eq('user_id', memberId);
      
      if (error) throw error;
      
      showToast('success', 'Role Updated', 'Member role has been updated');
      await fetchMembers();
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to change role';
      showToast('error', 'Update Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [currentWorkspace?.id, fetchMembers, showToast]);

  // ============================================
  // HELPERS
  // ============================================

  const hasPermission = useCallback((requiredRoles: WorkspaceRole[]): boolean => {
    if (!currentWorkspaceRole) return false;
    return requiredRoles.includes(currentWorkspaceRole);
  }, [currentWorkspaceRole]);

  // ============================================
  // EFFECTS
  // ============================================

  useEffect(() => {
    if (userId) {
      fetchUserWorkspaces();
    }
  }, [userId, fetchUserWorkspaces]);

  useEffect(() => {
    if (currentWorkspace?.id) {
      fetchMembers();
      fetchDetections();
      fetchStats();
    }
  }, [currentWorkspace?.id, fetchMembers, fetchDetections, fetchStats]);

  // ============================================
  // CONTEXT VALUE
  // ============================================

  const contextValue = useMemo<WorkspaceContextType>(() => ({
    currentWorkspace,
    currentWorkspaceRole,
    isLoading,
    error,
    userWorkspaces,
    workspacesLoading,
    members,
    membersLoading,
    workspaceDetections,
    detectionsLoading,
    stats,
    updatesAvailable,
    createWorkspace,
    switchWorkspace,
    updateWorkspace,
    deleteWorkspace,
    clearCurrentWorkspace,
    addDetection,
    addDetections,
    removeDetection,
    saveOverride,
    pullUpdate,
    pullAllUpdates,
    inviteMember,
    removeMember,
    changeMemberRole,
    refreshWorkspaces: fetchUserWorkspaces,
    refreshMembers: fetchMembers,
    refreshDetections: fetchDetections,
    refreshStats: fetchStats,
    hasPermission,
  }), [
    currentWorkspace, currentWorkspaceRole, isLoading, error,
    userWorkspaces, workspacesLoading, members, membersLoading,
    workspaceDetections, detectionsLoading, stats, updatesAvailable,
    createWorkspace, switchWorkspace, updateWorkspace, deleteWorkspace, clearCurrentWorkspace,
    addDetection, addDetections, removeDetection, saveOverride,
    pullUpdate, pullAllUpdates, inviteMember, removeMember, changeMemberRole,
    fetchUserWorkspaces, fetchMembers, fetchDetections, fetchStats,
    hasPermission
  ]);

  return (
    <WorkspaceContext.Provider value={contextValue}>
      {children}
    </WorkspaceContext.Provider>
  );
};

// ============================================
// HOOK
// ============================================

export const useWorkspace = (): WorkspaceContextType => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};

export default WorkspaceContext;
