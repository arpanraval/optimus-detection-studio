import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Role, Profile, UserInvitation } from '../types';
import { useToast } from '../hooks/useToast';
import { logger } from '../lib/logger';

// ============================================
// CONTEXT TYPE
// ============================================

interface UserManagementContextType {
  // All users in the application
  allUsers: Profile[];
  usersLoading: boolean;

  // Pending invitations
  invitations: UserInvitation[];
  invitationsLoading: boolean;

  // Refresh actions
  refreshAllUsers: () => Promise<void>;
  refreshInvitations: () => Promise<void>;

  // User management actions
  inviteUser: (email: string, role: Role) => Promise<{ success: boolean; error?: string }>;
  changeUserRole: (userId: string, newRole: Role) => Promise<{ success: boolean; error?: string }>;
  deactivateUser: (userId: string) => Promise<{ success: boolean; error?: string }>;
  reactivateUser: (userId: string) => Promise<{ success: boolean; error?: string }>;
  cancelInvitation: (invitationId: string) => Promise<{ success: boolean; error?: string }>;

  // Helpers
  getUserById: (userId: string) => Profile | undefined;
}

const UserManagementContext = createContext<UserManagementContextType | undefined>(undefined);

// ============================================
// PROVIDER
// ============================================

interface UserManagementProviderProps {
  children: React.ReactNode;
  userId: string;
}

export const UserManagementProvider: React.FC<UserManagementProviderProps> = ({
  children,
  userId,
}) => {
  const { showToast } = useToast();

  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);

  const USERS_PAGE_SIZE = 200;

  // Fetch ALL users in the application
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
      if (count && count > USERS_PAGE_SIZE) {
        logger.warn(`Loaded ${data?.length} of ${count} total users. Consider implementing pagination UI.`);
      }
    } catch (err) {
      logger.error('Error fetching users:', err);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // Fetch pending invitations
  const fetchInvitations = useCallback(async () => {
    setInvitationsLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_invitations')
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
    fetchAllUsers();
    fetchInvitations();
  }, [fetchAllUsers, fetchInvitations]);

  // Invite new user to the APPLICATION
  const inviteUser = useCallback(async (
    email: string,
    role: Role,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: { action: 'invite', email, role },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      showToast('success', 'Invitation Sent', `Invitation sent to ${email}`);
      await fetchInvitations();
      await fetchAllUsers();

      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to invite user';
      showToast('error', 'Invite Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [fetchInvitations, fetchAllUsers, showToast]);

  // Change user's GLOBAL role
  const changeUserRole = useCallback(async (
    targetUserId: string,
    newRole: Role,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: { action: 'changeRole', userId: targetUserId, role: newRole },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      showToast('success', 'Role Updated', `User role changed to ${newRole}`);
      await fetchAllUsers();

      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to change role';
      showToast('error', 'Update Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [fetchAllUsers, showToast]);

  // Deactivate user from APPLICATION
  const deactivateUser = useCallback(async (
    targetUserId: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: { action: 'deactivate', userId: targetUserId },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      showToast('success', 'User Deactivated', 'User has been deactivated');
      await fetchAllUsers();

      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to deactivate user';
      showToast('error', 'Deactivation Failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [fetchAllUsers, showToast]);

  // Reactivate user
  const reactivateUser = useCallback(async (
    targetUserId: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: { action: 'reactivate', userId: targetUserId },
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
    invitationId: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase
        .from('user_invitations')
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

  // Helper: get user by ID
  const getUserById = useCallback((targetUserId: string): Profile | undefined => {
    return allUsers.find(u => u.id === targetUserId);
  }, [allUsers]);

  const contextValue = useMemo<UserManagementContextType>(() => ({
    allUsers,
    usersLoading,
    invitations,
    invitationsLoading,
    refreshAllUsers: fetchAllUsers,
    refreshInvitations: fetchInvitations,
    inviteUser,
    changeUserRole,
    deactivateUser,
    reactivateUser,
    cancelInvitation,
    getUserById,
  }), [
    allUsers,
    usersLoading,
    invitations,
    invitationsLoading,
    fetchAllUsers,
    fetchInvitations,
    inviteUser,
    changeUserRole,
    deactivateUser,
    reactivateUser,
    cancelInvitation,
    getUserById,
  ]);

  return (
    <UserManagementContext.Provider value={contextValue}>
      {children}
    </UserManagementContext.Provider>
  );
};

// ============================================
// HOOK
// ============================================

export const useUserManagement = (): UserManagementContextType => {
  const context = useContext(UserManagementContext);
  if (!context) {
    throw new Error('useUserManagement must be used within a UserManagementProvider');
  }
  return context;
};

export default UserManagementContext;
