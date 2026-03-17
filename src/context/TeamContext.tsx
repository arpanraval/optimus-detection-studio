import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { 
  Team, 
  TeamMember, 
  TeamInvitation,
  Role,
  Profile 
} from '../types';
import { useToast } from '../hooks/useToast';
import { logger } from '../lib/logger';

// ============================================
// ALLOWED FIELDS FOR UPDATES (Mass Assignment Protection)
// ============================================

/**
 * Fields that can be updated via updateTeam.
 * Protected fields like id, slug, created_by, created_at are excluded.
 */
const TEAM_UPDATABLE_FIELDS = [
  'name',
  'description',
  'logo_url',
  'settings',
] as const;

type TeamUpdatableField = typeof TEAM_UPDATABLE_FIELDS[number];

/**
 * Filter an updates object to only include allowed fields.
 * Prevents mass assignment attacks by ignoring protected fields.
 */
function filterTeamFields(updates: Partial<Team>): Partial<Team> {
  const filtered: Partial<Team> = {};
  for (const field of TEAM_UPDATABLE_FIELDS) {
    if (field in updates && updates[field as keyof Team] !== undefined) {
      (filtered as Record<string, unknown>)[field] = updates[field as keyof Team];
    }
  }
  return filtered;
}

// ============================================
// CONTEXT TYPE
// ============================================

interface TeamContextType {
  // Current team (for filtering/context)
  currentTeam: Team | null;
  isLoading: boolean;
  error: string | null;
  
  // All teams in the system
  allTeams: Team[];
  teamsLoading: boolean;
  
  // Team members (of current team)
  members: TeamMember[];
  membersLoading: boolean;
  
  // ALL users in the application (for User Management)
  allUsers: Profile[];
  usersLoading: boolean;
  
  // Pending invitations
  invitations: TeamInvitation[];
  invitationsLoading: boolean;
  
  // User's teams
  userTeams: Team[];
  
  // Refresh actions
  refreshTeam: () => Promise<void>;
  refreshMembers: () => Promise<void>;
  refreshInvitations: () => Promise<void>;
  refreshAllUsers: () => Promise<void>;
  refreshAllTeams: () => Promise<void>;
  
  // Team switching
  switchTeam: (teamId: string) => Promise<void>;
  
  // ==========================================
  // USER MANAGEMENT (Global - affects profiles)
  // ==========================================
  
  /** Invite a new user to the APPLICATION with a global role */
  inviteUser: (email: string, role: Role, addToTeamId?: string) => Promise<{ success: boolean; error?: string }>;
  
  /** Change a user's GLOBAL role (in profiles.role) */
  changeUserRole: (userId: string, newRole: Role) => Promise<{ success: boolean; error?: string }>;
  
  /** Deactivate a user from the APPLICATION */
  deactivateUser: (userId: string) => Promise<{ success: boolean; error?: string }>;
  
  /** Reactivate a user in the APPLICATION */
  reactivateUser: (userId: string) => Promise<{ success: boolean; error?: string }>;
  
  /** Cancel a pending invitation */
  cancelInvitation: (invitationId: string) => Promise<{ success: boolean; error?: string }>;
  
  // ==========================================
  // TEAM MANAGEMENT (Team membership only)
  // ==========================================
  
  /** Create a new team */
  createTeam: (name: string, description?: string) => Promise<{ success: boolean; teamId?: string; error?: string }>;
  
  /** Update team details */
  updateTeam: (teamId: string, updates: Partial<Team>) => Promise<{ success: boolean; error?: string }>;
  
  /** Delete a team */
  deleteTeam: (teamId: string) => Promise<{ success: boolean; error?: string }>;
  
  /** Add an existing user to a team (no role - just membership) */
  addMemberToTeam: (userId: string, teamId: string) => Promise<{ success: boolean; error?: string }>;
  
  /** Remove a user from a team */
  removeMemberFromTeam: (userId: string, teamId: string) => Promise<{ success: boolean; error?: string }>;
  
  /** Get members of a specific team */
  getTeamMembers: (teamId: string) => Promise<TeamMember[]>;
  
  // ==========================================
  // HELPERS
  // ==========================================
  getMemberByUserId: (userId: string) => TeamMember | undefined;
  getUserById: (userId: string) => Profile | undefined;
  isUserInTeam: (userId: string, teamId: string) => boolean;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

// ============================================
// PROVIDER
// ============================================

interface TeamProviderProps {
  children: React.ReactNode;
  userId: string;
  initialTeamId?: string;
}

export const TeamProvider: React.FC<TeamProviderProps> = ({ 
  children, 
  userId,
  initialTeamId 
}) => {
  const { showToast } = useToast();
  
  // State
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  
  const [userTeams, setUserTeams] = useState<Team[]>([]);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(initialTeamId || null);

  // Pagination settings (prevents unbounded data fetches)
  const USERS_PAGE_SIZE = 200;
  const TEAMS_PAGE_SIZE = 100;

  // Fetch ALL users in the application (with pagination)
  const fetchAllUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const { data, error, count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact' })
        .order('full_name', { ascending: true })
        .range(0, USERS_PAGE_SIZE - 1);

      if (error) throw error;
      setAllUsers(data || []);
      // Log if there are more users than we fetched
      if (count && count > USERS_PAGE_SIZE) {
        logger.warn(`Loaded ${data?.length} of ${count} total users. Consider implementing pagination UI.`);
      }
    } catch (err) {
      logger.error('Error fetching users:', err);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // Fetch ALL teams (with pagination)
  const fetchAllTeams = useCallback(async () => {
    setTeamsLoading(true);
    try {
      const { data, error, count } = await supabase
        .from('teams')
        .select('*', { count: 'exact' })
        .order('name', { ascending: true })
        .range(0, TEAMS_PAGE_SIZE - 1);

      if (error) throw error;
      setAllTeams(data || []);
      // Log if there are more teams than we fetched
      if (count && count > TEAMS_PAGE_SIZE) {
        logger.warn(`Loaded ${data?.length} of ${count} total teams. Consider implementing pagination UI.`);
      }
    } catch (err) {
      logger.error('Error fetching teams:', err);
    } finally {
      setTeamsLoading(false);
    }
  }, []);

  // Fetch current team
  const fetchTeam = useCallback(async () => {
    if (!userId) {
      setCurrentTeam(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let teamId = currentTeamId;

      // If no team ID specified, get user's first team
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

      if (teamId) {
        const { data: team, error: teamError } = await supabase
          .from('teams')
          .select('*')
          .eq('id', teamId)
          .single();

        if (teamError) throw teamError;
        setCurrentTeam(team);
      } else {
        setCurrentTeam(null);
      }

      // Fetch teams user belongs to
      const { data: memberships } = await supabase
        .from('team_members')
        .select('team:teams(*)')
        .eq('user_id', userId);

      if (memberships) {
        const teams = memberships
          .map(m => m.team as unknown as Team)
          .filter(Boolean);
        setUserTeams(teams);
      }

    } catch (err) {
      logger.error('Error fetching team:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch team');
      setCurrentTeam(null);
    } finally {
      setIsLoading(false);
    }
  }, [userId, currentTeamId]);

  // Fetch team members (with user profile joined)
  const fetchMembers = useCallback(async () => {
    if (!currentTeam?.id) {
      setMembers([]);
      return;
    }

    setMembersLoading(true);

    try {
      const { data, error } = await supabase
        .from('team_members')
        .select(`
          *,
          user:profiles!team_members_user_id_fkey (
            id,
            email,
            full_name,
            avatar_url,
            status,
            role,
            last_active_at
          )
        `)
        .eq('team_id', currentTeam.id);

      if (error) throw error;

      const transformedMembers: TeamMember[] = (data || []).map(m => ({
        ...m,
        user: m.user as unknown as Profile,
      }));

      setMembers(transformedMembers);

    } catch (err) {
      logger.error('Error fetching members:', err);
      showToast('error', 'Error', 'Failed to fetch team members');
    } finally {
      setMembersLoading(false);
    }
  }, [currentTeam?.id, showToast]);

  // Fetch pending invitations
  const fetchInvitations = useCallback(async () => {
    setInvitationsLoading(true);

    try {
      const { data, error } = await supabase
        .from('team_invitations')
        .select('*')
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvitations(data || []);

    } catch (err) {
      logger.error('Error fetching invitations:', err);
    } finally {
      setInvitationsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchTeam();
    fetchAllUsers();
    fetchAllTeams();
  }, [fetchTeam, fetchAllUsers, fetchAllTeams]);

  // Fetch members when team changes
  useEffect(() => {
    if (currentTeam) {
      fetchMembers();
    }
  }, [currentTeam, fetchMembers]);

  // Fetch invitations on mount
  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  // Switch team
  const switchTeam = useCallback(async (teamId: string) => {
    setCurrentTeamId(teamId);
  }, []);

  // ==========================================
  // USER MANAGEMENT ACTIONS
  // ==========================================

  // Invite new user to the APPLICATION
  const inviteUser = useCallback(async (
    email: string, 
    role: Role,
    addToTeamId?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: {
          action: 'invite',
          email,
          role,  // This is now the GLOBAL role
          teamId: addToTeamId || currentTeam?.id,  // Optional team to add to
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      showToast('success', 'Invitation Sent', `Invitation sent to ${email}`);
      await fetchInvitations();
      await fetchAllUsers();
      if (addToTeamId || currentTeam?.id) {
        await fetchMembers();
      }

      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to invite user';
      showToast('error', 'Invite Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [currentTeam?.id, fetchInvitations, fetchAllUsers, fetchMembers, showToast]);

  // Change user's GLOBAL role (in profiles.role)
  const changeUserRole = useCallback(async (
    targetUserId: string, 
    newRole: Role
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: {
          action: 'changeRole',
          userId: targetUserId,
          role: newRole,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      showToast('success', 'Role Updated', `User role changed to ${newRole}`);
      await fetchAllUsers();
      await fetchMembers();

      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to change role';
      showToast('error', 'Update Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [fetchAllUsers, fetchMembers, showToast]);

  // Deactivate user from APPLICATION
  const deactivateUser = useCallback(async (
    targetUserId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: {
          action: 'deactivate',
          userId: targetUserId,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      showToast('success', 'User Deactivated', 'User has been deactivated');
      await fetchAllUsers();
      await fetchMembers();

      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to deactivate user';
      showToast('error', 'Deactivation Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [fetchAllUsers, fetchMembers, showToast]);

  // Reactivate user - routes through edge function for proper authorization
  const reactivateUser = useCallback(async (
    targetUserId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // Call edge function with proper admin authorization check
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: {
          action: 'reactivate',
          userId: targetUserId,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      showToast('success', 'User Reactivated', 'User has been reactivated');
      await fetchAllUsers();

      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reactivate user';
      showToast('error', 'Reactivation Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [fetchAllUsers, showToast]);

  // Cancel invitation
  const cancelInvitation = useCallback(async (
    invitationId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase
        .from('team_invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;

      showToast('success', 'Invitation Cancelled', 'The invitation has been cancelled');
      await fetchInvitations();

      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to cancel invitation';
      showToast('error', 'Cancellation Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [fetchInvitations, showToast]);

  // ==========================================
  // TEAM MANAGEMENT ACTIONS
  // ==========================================

  // Create new team
  const createTeam = useCallback(async (
    name: string,
    description?: string
  ): Promise<{ success: boolean; teamId?: string; error?: string }> => {
    try {
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      
      const { data, error } = await supabase
        .from('teams')
        .insert({
          name,
          slug,
          description: description || '',
          created_by: userId,
          settings: {},
        })
        .select()
        .single();

      if (error) throw error;

      // Add creator to team
      await supabase
        .from('team_members')
        .insert({
          team_id: data.id,
          user_id: userId,
        });

      showToast('success', 'Team Created', `Team "${name}" has been created`);
      await fetchAllTeams();
      await fetchTeam();

      return { success: true, teamId: data.id };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create team';
      showToast('error', 'Creation Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [userId, fetchAllTeams, fetchTeam, showToast]);

  // Update team (with field filtering for mass assignment protection)
  const updateTeam = useCallback(async (
    teamId: string,
    updates: Partial<Team>
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // Filter to allowed fields only (mass assignment protection)
      const safeUpdates = filterTeamFields(updates);

      if (Object.keys(safeUpdates).length === 0) {
        return { success: false, error: 'No valid fields to update' };
      }

      const { error } = await supabase
        .from('teams')
        .update({
          ...safeUpdates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', teamId);

      if (error) throw error;

      showToast('success', 'Team Updated', 'Team has been updated');
      await fetchAllTeams();
      if (teamId === currentTeam?.id) {
        await fetchTeam();
      }

      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update team';
      showToast('error', 'Update Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [currentTeam?.id, fetchAllTeams, fetchTeam, showToast]);

  // Delete team
  const deleteTeam = useCallback(async (
    teamId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // First remove all members
      await supabase
        .from('team_members')
        .delete()
        .eq('team_id', teamId);

      // Then delete the team
      const { error } = await supabase
        .from('teams')
        .delete()
        .eq('id', teamId);

      if (error) throw error;

      showToast('success', 'Team Deleted', 'Team has been deleted');
      await fetchAllTeams();
      
      // If we deleted the current team, clear it
      if (teamId === currentTeam?.id) {
        setCurrentTeam(null);
        setCurrentTeamId(null);
      }

      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete team';
      showToast('error', 'Deletion Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [currentTeam?.id, fetchAllTeams, showToast]);

  // Add existing user to team (no role - just membership)
  const addMemberToTeam = useCallback(async (
    targetUserId: string,
    teamId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // Check if already a member
      const { data: existing } = await supabase
        .from('team_members')
        .select('id')
        .eq('team_id', teamId)
        .eq('user_id', targetUserId)
        .single();

      if (existing) {
        return { success: false, error: 'User is already a member of this team' };
      }

      const { error } = await supabase
        .from('team_members')
        .insert({
          team_id: teamId,
          user_id: targetUserId,
          joined_at: new Date().toISOString(),
        });

      if (error) throw error;

      showToast('success', 'Member Added', 'User has been added to the team');
      if (teamId === currentTeam?.id) {
        await fetchMembers();
      }
      await fetchTeam();

      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add member';
      showToast('error', 'Add Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [currentTeam?.id, fetchMembers, fetchTeam, showToast]);

  // Remove user from team
  const removeMemberFromTeam = useCallback(async (
    targetUserId: string,
    teamId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', teamId)
        .eq('user_id', targetUserId);

      if (error) throw error;

      showToast('success', 'Member Removed', 'User has been removed from the team');
      if (teamId === currentTeam?.id) {
        await fetchMembers();
      }
      await fetchTeam();

      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove member';
      showToast('error', 'Remove Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [currentTeam?.id, fetchMembers, fetchTeam, showToast]);

  // Get members of a specific team
  const getTeamMembers = useCallback(async (teamId: string): Promise<TeamMember[]> => {
    try {
      const { data, error } = await supabase
        .from('team_members')
        .select(`
          *,
          user:profiles!team_members_user_id_fkey (
            id,
            email,
            full_name,
            avatar_url,
            status,
            role,
            last_active_at
          )
        `)
        .eq('team_id', teamId);

      if (error) throw error;

      return (data || []).map(m => ({
        ...m,
        user: m.user as unknown as Profile,
      }));

    } catch (err) {
      logger.error('Error fetching team members:', err);
      return [];
    }
  }, []);

  // ==========================================
  // HELPERS
  // ==========================================

  const getMemberByUserId = useCallback((targetUserId: string): TeamMember | undefined => {
    return members.find(m => m.user_id === targetUserId);
  }, [members]);

  const getUserById = useCallback((targetUserId: string): Profile | undefined => {
    return allUsers.find(u => u.id === targetUserId);
  }, [allUsers]);

  const isUserInTeam = useCallback((targetUserId: string, teamId: string): boolean => {
    // This is a simple check - for current team's members
    if (teamId === currentTeam?.id) {
      return members.some(m => m.user_id === targetUserId);
    }
    // For other teams, we'd need to fetch
    return false;
  }, [currentTeam?.id, members]);

  // Memoized context value
  const contextValue = useMemo<TeamContextType>(() => ({
    currentTeam,
    isLoading,
    error,
    allTeams,
    teamsLoading,
    members,
    membersLoading,
    allUsers,
    usersLoading,
    invitations,
    invitationsLoading,
    userTeams,
    refreshTeam: fetchTeam,
    refreshMembers: fetchMembers,
    refreshInvitations: fetchInvitations,
    refreshAllUsers: fetchAllUsers,
    refreshAllTeams: fetchAllTeams,
    switchTeam,
    inviteUser,
    changeUserRole,
    deactivateUser,
    reactivateUser,
    cancelInvitation,
    createTeam,
    updateTeam,
    deleteTeam,
    addMemberToTeam,
    removeMemberFromTeam,
    getTeamMembers,
    getMemberByUserId,
    getUserById,
    isUserInTeam,
  }), [
    currentTeam,
    isLoading,
    error,
    allTeams,
    teamsLoading,
    members,
    membersLoading,
    allUsers,
    usersLoading,
    invitations,
    invitationsLoading,
    userTeams,
    fetchTeam,
    fetchMembers,
    fetchInvitations,
    fetchAllUsers,
    fetchAllTeams,
    switchTeam,
    inviteUser,
    changeUserRole,
    deactivateUser,
    reactivateUser,
    cancelInvitation,
    createTeam,
    updateTeam,
    deleteTeam,
    addMemberToTeam,
    removeMemberFromTeam,
    getTeamMembers,
    getMemberByUserId,
    getUserById,
    isUserInTeam,
  ]);

  return (
    <TeamContext.Provider value={contextValue}>
      {children}
    </TeamContext.Provider>
  );
};

// ============================================
// HOOK
// ============================================

export const useTeam = (): TeamContextType => {
  const context = useContext(TeamContext);
  if (!context) {
    throw new Error('useTeam must be used within a TeamProvider');
  }
  return context;
};

// ============================================
// UTILITY HOOK: Current user's membership
// ============================================

export const useCurrentMembership = () => {
  const { currentTeam, members } = useTeam();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    };
    getUser();
  }, []);

  return useMemo(() => {
    if (!userId || !currentTeam) return null;
    return members.find(m => m.user_id === userId) || null;
  }, [userId, currentTeam, members]);
};

export default TeamContext;