import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from './Icon';
import { Role, Profile, Team, TeamMember, TeamInvitation } from '../types';
import { useToast } from '../hooks/useToast';
import { useTeam } from '../context/TeamContext';
import { usePermissions } from '../context/PermissionsContext';
import { RoleBadge } from './rbac/RoleBadge';
import { InviteUserModal } from './rbac/InviteUserModal';
import { supabase } from '../lib/supabaseClient';

// =============================================================================
// STYLES
// =============================================================================

const customStyles = `
.team-scroll::-webkit-scrollbar { width: 5px; height: 5px; }
.team-scroll::-webkit-scrollbar-track { background: transparent; }
.team-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
.team-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
.team-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent; }
[data-theme="light"] .team-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); }
[data-theme="light"] .team-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }

@keyframes slide-in-right {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}
.animate-slide-in-right {
    animation: slide-in-right 0.2s ease-out;
}
`;

// =============================================================================
// AVATAR HELPER - M3 Compatible Colors
// =============================================================================

// M3-compatible muted color palette for avatars
const AVATAR_COLORS = [
    { bg: 'bg-violet-500/20', text: 'text-violet-300' },
    { bg: 'bg-blue-500/20', text: 'text-blue-300' },
    { bg: 'bg-cyan-500/20', text: 'text-cyan-300' },
    { bg: 'bg-teal-500/20', text: 'text-teal-300' },
    { bg: 'bg-emerald-500/20', text: 'text-emerald-300' },
    { bg: 'bg-amber-500/20', text: 'text-amber-300' },
    { bg: 'bg-orange-500/20', text: 'text-orange-300' },
    { bg: 'bg-rose-500/20', text: 'text-rose-300' },
    { bg: 'bg-pink-500/20', text: 'text-pink-300' },
    { bg: 'bg-fuchsia-500/20', text: 'text-fuchsia-300' },
    { bg: 'bg-indigo-500/20', text: 'text-indigo-300' },
    { bg: 'bg-sky-500/20', text: 'text-sky-300' },
];

const getAvatarColor = (seed: string): { bg: string; text: string } => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

// Inline UserAvatar Component
interface UserAvatarProps {
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

const UserAvatar: React.FC<UserAvatarProps> = ({ name, email, avatarUrl, size = 'md', className = '' }) => {
    const displayName = name || email?.split('@')[0] || '?';
    const initials = displayName.split(/\s+/).length >= 2
        ? (displayName.split(/\s+/)[0][0] + displayName.split(/\s+/).slice(-1)[0][0]).toUpperCase()
        : displayName.slice(0, 2).toUpperCase();
    
    const { bg, text } = getAvatarColor(email || name || '');
    
    const sizeClasses = {
        sm: 'w-8 h-8 text-xs',
        md: 'w-10 h-10 text-sm',
        lg: 'w-14 h-14 text-base',
    };

    if (avatarUrl) {
        return <img src={avatarUrl} alt={displayName} className={`${sizeClasses[size]} rounded-xl object-cover ${className}`} />;
    }

    return (
        <div className={`${sizeClasses[size]} rounded-xl flex items-center justify-center font-semibold ${bg} ${text} ${className}`}>
            {initials}
        </div>
    );
};

// =============================================================================
// TYPES
// =============================================================================

type TabId = 'users' | 'teams' | 'invitations';
type SortField = 'name' | 'email' | 'role' | 'status' | 'created_at' | 'last_active_at';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
    field: SortField;
    direction: SortDirection;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const UserManagementPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabId>('users');
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [isInviting, setIsInviting] = useState(false);
    const [changingRoleFor, setChangingRoleFor] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] = useState(false);
    const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
    const [teamMembersMap, setTeamMembersMap] = useState<Record<string, TeamMember[]>>({});
    const [loadingTeamMembers, setLoadingTeamMembers] = useState<string | null>(null);
    const [addMemberModal, setAddMemberModal] = useState<{ teamId: string; teamName: string } | null>(null);
    const [editTeamModal, setEditTeamModal] = useState<Team | null>(null);
    const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
    const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'name', direction: 'asc' });
    
    // Password modal state
    const [passwordModal, setPasswordModal] = useState<{ userId: string; userName: string; email: string } | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [isSettingPassword, setIsSettingPassword] = useState(false);
    
    // Delete confirmation modal
    const [deleteModal, setDeleteModal] = useState<{ userId: string; userName: string; email: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    
    const { showToast } = useToast();
    const { hasRoleOrHigher, userId: currentUserId } = usePermissions();
    const { 
        allUsers,
        allTeams,
        invitations,
        usersLoading,
        teamsLoading,
        invitationsLoading,
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
        refreshAllUsers,
        refreshAllTeams,
        refreshInvitations,
    } = useTeam();

    // Inject custom styles
    useEffect(() => {
        const styleId = 'user-management-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = customStyles;
            document.head.appendChild(style);
        }
    }, []);

    // ==========================================================================
    // SORTING
    // ==========================================================================
    
    const handleSort = (field: SortField) => {
        setSortConfig(prev => ({
            field,
            direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const sortedUsers = useMemo(() => {
        const users = [...allUsers];
        return users.sort((a, b) => {
            let aVal: any, bVal: any;
            
            switch (sortConfig.field) {
                case 'name':
                    aVal = a.full_name || a.email || '';
                    bVal = b.full_name || b.email || '';
                    break;
                case 'email':
                    aVal = a.email || '';
                    bVal = b.email || '';
                    break;
                case 'role':
                    const roleOrder = { owner: 0, admin: 1, lead: 2, analyst: 3, viewer: 4 };
                    aVal = roleOrder[a.role as keyof typeof roleOrder] ?? 5;
                    bVal = roleOrder[b.role as keyof typeof roleOrder] ?? 5;
                    break;
                case 'status':
                    aVal = a.status || 'active';
                    bVal = b.status || 'active';
                    break;
                case 'created_at':
                    aVal = new Date(a.created_at || 0).getTime();
                    bVal = new Date(b.created_at || 0).getTime();
                    break;
                case 'last_active_at':
                    aVal = new Date(a.last_active_at || 0).getTime();
                    bVal = new Date(b.last_active_at || 0).getTime();
                    break;
                default:
                    aVal = '';
                    bVal = '';
            }
            
            if (typeof aVal === 'string') {
                const cmp = aVal.toLowerCase().localeCompare(bVal.toLowerCase());
                return sortConfig.direction === 'asc' ? cmp : -cmp;
            }
            
            return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
        });
    }, [allUsers, sortConfig]);

    // ==========================================================================
    // HANDLERS
    // ==========================================================================

    const handleInviteUser = async (email: string, role: Role) => {
        setIsInviting(true);
        try {
            await inviteUser(email, role);
            setIsInviteModalOpen(false);
            await Promise.all([refreshAllUsers(), refreshInvitations()]);
        } catch (err: unknown) {
            throw err;
        } finally {
            setIsInviting(false);
        }
    };

    const handleRoleChange = async (userId: string, newRole: Role) => {
        setChangingRoleFor(userId);
        try {
            await changeUserRole(userId, newRole);
            // Update selected user if it's the one being changed
            if (selectedUser?.id === userId) {
                setSelectedUser(prev => prev ? { ...prev, role: newRole } : null);
            }
        } finally {
            setChangingRoleFor(null);
        }
    };

    const handleDeactivate = async (userId: string, userName: string) => {
        if (!window.confirm(`Deactivate ${userName}? They will no longer be able to access the application.`)) return;
        try {
            await deactivateUser(userId);
            if (selectedUser?.id === userId) {
                setSelectedUser(prev => prev ? { ...prev, status: 'deactivated' } : null);
            }
        } catch (err: unknown) {}
    };

    const handleReactivate = async (userId: string) => {
        try {
            await reactivateUser(userId);
            if (selectedUser?.id === userId) {
                setSelectedUser(prev => prev ? { ...prev, status: 'active' } : null);
            }
        } catch (err: unknown) {}
    };

    const handleDeleteUser = async () => {
        if (!deleteModal) return;
        
        setIsDeleting(true);
        try {
            // First clean up related data
            const { error: cleanupError } = await supabase.rpc('cleanup_user_data', { 
                target_user_id: deleteModal.userId 
            });
            
            // If RPC doesn't exist, try manual cleanup
            if (cleanupError) {
                console.log('RPC not available, trying manual cleanup...');
                // Manual cleanup in order
                await supabase.from('activity_log').delete().eq('user_id', deleteModal.userId);
                await supabase.from('user_notifications').delete().eq('user_id', deleteModal.userId);
                await supabase.from('detection_comments').delete().eq('user_id', deleteModal.userId);
                if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deleteModal.userId)) throw new Error('Invalid user ID');
                await supabase.from('detection_reviews').delete().or(`reviewer_id.eq.${deleteModal.userId},requested_by.eq.${deleteModal.userId}`);
                await supabase.from('team_invitations').delete().eq('invited_by', deleteModal.userId);
                await supabase.from('team_members').delete().eq('user_id', deleteModal.userId);
                await supabase.from('detections').update({ assigned_to: null }).eq('assigned_to', deleteModal.userId);
                // Transfer detections to current user instead of deleting
                await supabase.from('detections').update({ user_id: currentUserId }).eq('user_id', deleteModal.userId);
            }
            
            // Now delete via edge function
            const { data, error } = await supabase.functions.invoke('manage-users', {
                body: { action: 'delete', userId: deleteModal.userId },
            });
            
            if (error) throw error;
            if (data.error) throw new Error(data.error);
            
            showToast('success', 'User Deleted', `${deleteModal.email} has been permanently deleted.`);
            setDeleteModal(null);
            setSelectedUser(null);
            await refreshAllUsers();
            
        } catch (err: unknown) {
            showToast('error', 'Delete Failed', err instanceof Error ? err.message : 'Failed to delete user. Check database constraints.');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleSetPassword = async () => {
        if (!passwordModal || !newPassword) return;
        if (newPassword.length < 12) {
            showToast('error', 'Invalid Password', 'Password must be at least 12 characters.');
            return;
        }
        if (!/[A-Z]/.test(newPassword)) {
            showToast('error', 'Invalid Password', 'Must contain at least one uppercase letter.');
            return;
        }
        if (!/[a-z]/.test(newPassword)) {
            showToast('error', 'Invalid Password', 'Must contain at least one lowercase letter.');
            return;
        }
        if (!/[0-9]/.test(newPassword)) {
            showToast('error', 'Invalid Password', 'Must contain at least one number.');
            return;
        }
        
        setIsSettingPassword(true);
        try {
            const { data, error } = await supabase.functions.invoke('manage-users', {
                body: { 
                    action: 'setPassword', 
                    userId: passwordModal.userId, 
                    password: newPassword,
                },
            });
            if (error) throw error;
            if (data.error) throw new Error(data.error);
            
            showToast('success', 'Password Set', `${passwordModal.userName} can now log in with the new password.`);
            setPasswordModal(null);
            setNewPassword('');
        } catch (err: unknown) {
            showToast('error', 'Failed', err instanceof Error ? err.message : 'Failed to set password.');
        } finally {
            setIsSettingPassword(false);
        }
    };

    const handleCancelInvitation = async (invitationId: string, email: string) => {
        if (!window.confirm(`Cancel invitation for ${email}?`)) return;
        try {
            await cancelInvitation(invitationId);
        } catch (err: unknown) {}
    };

    const handleCreateTeam = async (name: string, description: string) => {
        const result = await createTeam(name, description);
        if (result.success) {
            setIsCreateTeamModalOpen(false);
        }
        return result;
    };

    const handleUpdateTeam = async (teamId: string, name: string, description: string) => {
        const result = await updateTeam(teamId, { name, description });
        if (result.success) {
            setEditTeamModal(null);
        }
        return result;
    };

    const handleDeleteTeam = async (teamId: string, teamName: string) => {
        if (!window.confirm(`Delete team "${teamName}"? All members will be removed from this team.`)) return;
        await deleteTeam(teamId);
    };

    const handleExpandTeam = async (teamId: string) => {
        if (expandedTeamId === teamId) {
            setExpandedTeamId(null);
            return;
        }
        
        setExpandedTeamId(teamId);
        
        if (!teamMembersMap[teamId]) {
            setLoadingTeamMembers(teamId);
            const members = await getTeamMembers(teamId);
            setTeamMembersMap(prev => ({ ...prev, [teamId]: members }));
            setLoadingTeamMembers(null);
        }
    };

    const handleAddMemberToTeam = async (userId: string, teamId: string) => {
        const result = await addMemberToTeam(userId, teamId);
        if (result.success) {
            const members = await getTeamMembers(teamId);
            setTeamMembersMap(prev => ({ ...prev, [teamId]: members }));
            setAddMemberModal(null);
        }
    };

    const handleRemoveMemberFromTeam = async (userId: string, teamId: string, userName: string) => {
        if (!window.confirm(`Remove ${userName} from this team?`)) return;
        const result = await removeMemberFromTeam(userId, teamId);
        if (result.success) {
            const members = await getTeamMembers(teamId);
            setTeamMembersMap(prev => ({ ...prev, [teamId]: members }));
        }
    };

    const handleResendInvitation = async (invitation: TeamInvitation) => {
        try {
            // Cancel old and create new invitation
            await cancelInvitation(invitation.id);
            await inviteUser(invitation.email, invitation.role, invitation.team_id || undefined);
            showToast('success', 'Invitation Resent', `New invitation sent to ${invitation.email}`);
        } catch (err: unknown) {
            showToast('error', 'Failed', err instanceof Error ? err.message : 'Failed to resend invitation');
        }
    };

    // ==========================================================================
    // HELPERS
    // ==========================================================================

    const getDisplayName = (user: Profile): string => {
        return user.full_name || user.email?.split('@')[0] || 'Unknown';
    };

    const getInitials = (name: string): string => {
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    };

    const formatDate = (dateString: string | null | undefined): string => {
        if (!dateString) return 'Never';
        return new Date(dateString).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
        });
    };

    const formatDateTime = (dateString: string | null | undefined): string => {
        if (!dateString) return 'Never';
        return new Date(dateString).toLocaleString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const formatRelativeTime = (dateString: string | null | undefined): string => {
        if (!dateString) return 'Never';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return formatDate(dateString);
    };

    const isExpired = (expiresAt: string): boolean => {
        return new Date(expiresAt) < new Date();
    };

    // Filter users by search
    const filteredUsers = sortedUsers.filter(u => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        const name = getDisplayName(u).toLowerCase();
        const email = (u.email || '').toLowerCase();
        return name.includes(query) || email.includes(query);
    });
    
    const pendingInvitations = invitations.filter(i => !i.accepted_at);
    const canManageUsers = hasRoleOrHigher('admin');
    const canManageTeams = hasRoleOrHigher('lead');

    // ==========================================================================
    // RENDER
    // ==========================================================================

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Header */}
            <div className="flex-shrink-0 px-6 lg:px-8 py-5 border-b border-outline-variant/10">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-semibold text-on-surface">User & Team Management</h1>
                        <p className="text-sm text-on-surface-variant/60 mt-1">
                            {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} · {allTeams.length} team{allTeams.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {activeTab === 'teams' && canManageTeams && (
                            <button
                                onClick={() => setIsCreateTeamModalOpen(true)}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-surface-container-high text-on-surface font-medium rounded-xl hover:bg-surface-container-highest transition-all border border-outline-variant/10"
                            >
                                <Icon name="folder-plus" className="w-4 h-4" />
                                Create Team
                            </button>
                        )}
                        {canManageUsers && (
                            <button
                                onClick={() => setIsInviteModalOpen(true)}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-tertiary text-on-tertiary font-medium rounded-xl hover:brightness-110 transition-all shadow-lg shadow-tertiary/20"
                            >
                                <Icon name="user-plus" className="w-4 h-4" />
                                Add User
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex">
                <div className="flex-1 max-w-7xl mx-auto px-6 lg:px-8 py-6 flex flex-col">
                    {/* Tabs & Search */}
                    <div className="flex items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-1 bg-surface-container rounded-xl p-1">
                            {(['users', 'teams', 'invitations'] as TabId[]).map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => { setActiveTab(tab); setSelectedUser(null); }}
                                    className={`
                                        px-4 py-2 text-sm font-medium rounded-lg transition-all capitalize
                                        ${activeTab === tab
                                            ? 'bg-surface-container-highest text-on-surface shadow-sm'
                                            : 'text-on-surface-variant/60 hover:text-on-surface-variant'
                                        }
                                    `}
                                >
                                    {tab}
                                    {tab === 'users' && (
                                        <span className="ml-1.5 text-xs opacity-60">
                                            {filteredUsers.length}
                                        </span>
                                    )}
                                    {tab === 'teams' && (
                                        <span className="ml-1.5 text-xs opacity-60">
                                            {allTeams.length}
                                        </span>
                                    )}
                                    {tab === 'invitations' && pendingInvitations.length > 0 && (
                                        <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-tertiary-container text-on-tertiary-container">
                                            {pendingInvitations.length}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>

                        {activeTab === 'users' && (
                            <div className="relative">
                                <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search users..."
                                    className="w-64 pl-10 pr-4 py-2 bg-surface-container border border-outline-variant/10 rounded-xl text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:border-tertiary/30 transition-colors"
                                />
                            </div>
                        )}
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1 flex gap-6 overflow-hidden">
                        <div className={`bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden flex-1 ${selectedUser ? 'max-w-[calc(100%-400px)]' : ''}`}>
                            {activeTab === 'users' && (
                                <UsersTable
                                    users={filteredUsers}
                                    isLoading={usersLoading}
                                    changingRoleFor={changingRoleFor}
                                    selectedUserId={selectedUser?.id || null}
                                    sortConfig={sortConfig}
                                    onSort={handleSort}
                                    onRoleChange={handleRoleChange}
                                    onSelectUser={setSelectedUser}
                                    onDeactivate={handleDeactivate}
                                    onReactivate={handleReactivate}
                                    onDelete={(user) => setDeleteModal({ userId: user.id, userName: getDisplayName(user), email: user.email || '' })}
                                    onSetPassword={(user) => setPasswordModal({ userId: user.id, userName: getDisplayName(user), email: user.email || '' })}
                                    getDisplayName={getDisplayName}
                                    formatDate={formatDate}
                                    formatRelativeTime={formatRelativeTime}
                                    canManageUsers={canManageUsers}
                                    currentUserId={currentUserId}
                                />
                            )}
                            {activeTab === 'teams' && (
                                <TeamsList
                                    teams={allTeams}
                                    isLoading={teamsLoading}
                                    expandedTeamId={expandedTeamId}
                                    teamMembersMap={teamMembersMap}
                                    loadingTeamMembers={loadingTeamMembers}
                                    onExpandTeam={handleExpandTeam}
                                    onEditTeam={setEditTeamModal}
                                    onDeleteTeam={handleDeleteTeam}
                                    onRemoveMember={handleRemoveMemberFromTeam}
                                    onAddMember={(teamId, teamName) => setAddMemberModal({ teamId, teamName })}
                                    getDisplayName={(m) => m.user ? getDisplayName(m.user) : 'Unknown'}
                                    formatDate={formatDate}
                                    canManageTeams={canManageTeams}
                                />
                            )}
                            {activeTab === 'invitations' && (
                                <InvitationsTable
                                    invitations={pendingInvitations}
                                    isLoading={invitationsLoading}
                                    onCancel={handleCancelInvitation}
                                    onResend={handleResendInvitation}
                                    formatDate={formatDate}
                                    formatDateTime={formatDateTime}
                                    isExpired={isExpired}
                                />
                            )}
                        </div>

                        {/* User Details Panel */}
                        {selectedUser && activeTab === 'users' && (
                            <UserDetailsPanel
                                user={selectedUser}
                                onClose={() => setSelectedUser(null)}
                                onRoleChange={handleRoleChange}
                                onDeactivate={handleDeactivate}
                                onReactivate={handleReactivate}
                                onDelete={() => setDeleteModal({ userId: selectedUser.id, userName: getDisplayName(selectedUser), email: selectedUser.email || '' })}
                                onSetPassword={() => setPasswordModal({ userId: selectedUser.id, userName: getDisplayName(selectedUser), email: selectedUser.email || '' })}
                                isChangingRole={changingRoleFor === selectedUser.id}
                                canManageUsers={canManageUsers}
                                currentUserId={currentUserId}
                                getDisplayName={getDisplayName}
                                formatDate={formatDate}
                                formatRelativeTime={formatRelativeTime}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Modals */}
            <InviteUserModal
                isOpen={isInviteModalOpen}
                onClose={() => setIsInviteModalOpen(false)}
                onInvite={handleInviteUser}
                isInviting={isInviting}
            />

            {isCreateTeamModalOpen && (
                <TeamFormModal
                    mode="create"
                    onClose={() => setIsCreateTeamModalOpen(false)}
                    onSubmit={handleCreateTeam}
                />
            )}

            {editTeamModal && (
                <TeamFormModal
                    mode="edit"
                    team={editTeamModal}
                    onClose={() => setEditTeamModal(null)}
                    onSubmit={(name, desc) => handleUpdateTeam(editTeamModal.id, name, desc)}
                />
            )}

            {addMemberModal && (
                <AddMemberToTeamModal
                    teamId={addMemberModal.teamId}
                    teamName={addMemberModal.teamName}
                    allUsers={allUsers}
                    existingMembers={teamMembersMap[addMemberModal.teamId] || []}
                    onClose={() => setAddMemberModal(null)}
                    onAdd={handleAddMemberToTeam}
                    getDisplayName={getDisplayName}
                />
            )}

            {/* Set Password Modal */}
            {passwordModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-scrim/50 backdrop-blur-sm" onClick={() => setPasswordModal(null)} />
                    <div className="relative w-full max-w-sm bg-surface-container border border-outline-variant/20 rounded-2xl shadow-xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-outline-variant/10">
                            <h3 className="text-base font-semibold text-on-surface">Set Password</h3>
                            <p className="text-xs text-on-surface-variant mt-0.5">
                                Set password for {passwordModal.email}
                            </p>
                        </div>
                        <div className="p-5">
                            <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
                                New Password
                            </label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Enter password (min 6 characters)"
                                className="w-full px-3 py-2 text-sm bg-surface-container-high border border-outline-variant/10 rounded-lg text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:border-tertiary/30"
                                autoFocus
                            />
                        </div>
                        <div className="px-5 py-3 border-t border-outline-variant/10 flex items-center justify-end gap-2 bg-surface-container-low">
                            <button
                                onClick={() => { setPasswordModal(null); setNewPassword(''); }}
                                disabled={isSettingPassword}
                                className="px-3 py-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSetPassword}
                                disabled={isSettingPassword || newPassword.length < 6}
                                className="px-4 py-1.5 text-sm font-medium bg-tertiary text-on-tertiary rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                            >
                                {isSettingPassword ? 'Setting...' : 'Set Password'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-scrim/50 backdrop-blur-sm" onClick={() => !isDeleting && setDeleteModal(null)} />
                    <div className="relative w-full max-w-md bg-surface-container border border-outline-variant/20 rounded-2xl shadow-xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-outline-variant/10">
                            <h3 className="text-base font-semibold text-on-surface">Delete User</h3>
                        </div>
                        <div className="p-5">
                            <div className="flex items-start gap-3 p-4 rounded-xl bg-error-container/30 border border-error/20 mb-4">
                                <Icon name="alert-triangle" className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-on-error-container">This action is irreversible</p>
                                    <p className="text-xs text-on-error-container/70 mt-0.5">
                                        The user will be permanently deleted along with their notifications and activity history. Their detections will be transferred to you.
                                    </p>
                                </div>
                            </div>
                            <p className="text-sm text-on-surface-variant">
                                Are you sure you want to delete <span className="font-medium text-on-surface">{deleteModal.email}</span>?
                            </p>
                        </div>
                        <div className="px-5 py-3 border-t border-outline-variant/10 flex items-center justify-end gap-2 bg-surface-container-low">
                            <button
                                onClick={() => setDeleteModal(null)}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteUser}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm font-medium bg-error text-on-error rounded-lg hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
                            >
                                {isDeleting ? (
                                    <>
                                        <Icon name="spinner" className="w-4 h-4 animate-spin" />
                                        Deleting...
                                    </>
                                ) : (
                                    <>
                                        <Icon name="trash" className="w-4 h-4" />
                                        Delete User
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// =============================================================================
// USERS TABLE (with sortable headers)
// =============================================================================

interface UsersTableProps {
    users: Profile[];
    isLoading: boolean;
    changingRoleFor: string | null;
    selectedUserId: string | null;
    sortConfig: SortConfig;
    onSort: (field: SortField) => void;
    onRoleChange: (userId: string, role: Role) => void;
    onSelectUser: (user: Profile) => void;
    onDeactivate: (userId: string, name: string) => void;
    onReactivate: (userId: string) => void;
    onDelete: (user: Profile) => void;
    onSetPassword: (user: Profile) => void;
    getDisplayName: (u: Profile) => string;
    formatDate: (date: string | null | undefined) => string;
    formatRelativeTime: (date: string | null | undefined) => string;
    canManageUsers: boolean;
    currentUserId: string | null;
}

const UsersTable: React.FC<UsersTableProps> = ({
    users, isLoading, changingRoleFor, selectedUserId, sortConfig,
    onSort, onRoleChange, onSelectUser, onDeactivate, onReactivate, onDelete, onSetPassword,
    getDisplayName, formatDate, formatRelativeTime, canManageUsers, currentUserId
}) => {
    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Icon name="spinner" className="w-8 h-8 animate-spin text-tertiary/50" />
            </div>
        );
    }

    if (users.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-surface-container-highest flex items-center justify-center mb-4">
                    <Icon name="users" className="w-8 h-8 text-on-surface-variant/30" />
                </div>
                <p className="text-on-surface-variant/60 mb-1">No users found</p>
                <p className="text-sm text-on-surface-variant/40">Add your first user to get started</p>
            </div>
        );
    }

    const SortHeader: React.FC<{ field: SortField; label: string; className?: string }> = ({ field, label, className = '' }) => (
        <th 
            className={`px-4 py-3 text-left text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider cursor-pointer hover:text-on-surface-variant transition-colors ${className}`}
            onClick={() => onSort(field)}
        >
            <div className="flex items-center gap-1">
                {label}
                {sortConfig.field === field && (
                    <Icon 
                        name={sortConfig.direction === 'asc' ? 'chevron-up' : 'chevron-down'} 
                        className="w-3 h-3" 
                    />
                )}
            </div>
        </th>
    );

    return (
        <div className="overflow-auto team-scroll h-full">
            <table className="w-full min-w-[900px]">
                <thead className="bg-surface-container-high/50 sticky top-0 z-10">
                    <tr>
                        <SortHeader field="name" label="User" className="w-[280px]" />
                        <SortHeader field="email" label="Email" />
                        <SortHeader field="role" label="Role" className="w-[120px]" />
                        <SortHeader field="status" label="Status" className="w-[100px]" />
                        <SortHeader field="last_active_at" label="Last Active" className="w-[130px]" />
                        <SortHeader field="created_at" label="Joined" className="w-[120px]" />
                        <th className="px-4 py-3 text-right text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider w-[80px]">
                            Actions
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                    {users.map((user) => {
                        const displayName = getDisplayName(user);
                        const isOwner = user.role === 'owner';
                        const isCurrentUser = user.id === currentUserId;
                        const isChangingRole = changingRoleFor === user.id;
                        const isSelected = selectedUserId === user.id;
                        const isDeactivated = user.status === 'deactivated';

                        return (
                            <tr 
                                key={user.id}
                                onClick={() => onSelectUser(user)}
                                className={`
                                    cursor-pointer transition-all
                                    ${isSelected 
                                        ? 'bg-tertiary/10' 
                                        : 'hover:bg-surface-container-high/50'
                                    }
                                    ${isDeactivated ? 'opacity-60' : ''}
                                `}
                            >
                                {/* User */}
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <UserAvatar 
                                            name={displayName}
                                            email={user.email}
                                            avatarUrl={user.avatar_url}
                                            size="md"
                                        />
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-on-surface truncate">{displayName}</p>
                                            {isCurrentUser && (
                                                <span className="text-[10px] text-tertiary">(You)</span>
                                            )}
                                        </div>
                                    </div>
                                </td>

                                {/* Email */}
                                <td className="px-4 py-3">
                                    <span className="text-sm text-on-surface-variant truncate block">{user.email}</span>
                                </td>

                                {/* Role */}
                                <td className="px-4 py-3">
                                    {(isOwner || !canManageUsers || isCurrentUser) ? (
                                        <RoleBadge role={user.role} size="md" />
                                    ) : (
                                        <RoleDropdown
                                            currentRole={user.role}
                                            isLoading={isChangingRole}
                                            onChange={(role) => {
                                                onRoleChange(user.id, role);
                                            }}
                                        />
                                    )}
                                </td>

                                {/* Status */}
                                <td className="px-4 py-3">
                                    <StatusBadge status={user.status || 'active'} />
                                </td>

                                {/* Last Active */}
                                <td className="px-4 py-3">
                                    <span className="text-sm text-on-surface-variant/60">
                                        {formatRelativeTime(user.last_active_at)}
                                    </span>
                                </td>

                                {/* Joined */}
                                <td className="px-4 py-3">
                                    <span className="text-sm text-on-surface-variant/60">
                                        {formatDate(user.created_at)}
                                    </span>
                                </td>

                                {/* Actions */}
                                <td className="px-4 py-3 text-right">
                                    {!isOwner && !isCurrentUser && canManageUsers && (
                                        <UserActionsMenu
                                            user={user}
                                            onDeactivate={() => onDeactivate(user.id, displayName)}
                                            onReactivate={() => onReactivate(user.id)}
                                            onDelete={() => onDelete(user)}
                                            onSetPassword={() => onSetPassword(user)}
                                        />
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

// =============================================================================
// STATUS BADGE (M3 Expressive Colors)
// =============================================================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const config: Record<string, { label: string; className: string }> = {
        active: {
            label: 'Active',
            className: 'bg-tertiary-container/50 text-on-tertiary-container',
        },
        deactivated: {
            label: 'Inactive',
            className: 'bg-error-container/50 text-on-error-container',
        },
        pending: {
            label: 'Pending',
            className: 'bg-secondary-container/50 text-on-secondary-container',
        },
        away: {
            label: 'Away',
            className: 'bg-surface-container-highest text-on-surface-variant',
        },
    };

    const { label, className } = config[status] || config.active;

    return (
        <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-md ${className}`}>
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                status === 'active' ? 'bg-tertiary' : 
                status === 'deactivated' ? 'bg-error' : 
                status === 'pending' ? 'bg-secondary' : 'bg-outline'
            }`} />
            {label}
        </span>
    );
};

// =============================================================================
// USER DETAILS PANEL
// =============================================================================

interface UserDetailsPanelProps {
    user: Profile;
    onClose: () => void;
    onRoleChange: (userId: string, role: Role) => void;
    onDeactivate: (userId: string, name: string) => void;
    onReactivate: (userId: string) => void;
    onDelete: () => void;
    onSetPassword: () => void;
    isChangingRole: boolean;
    canManageUsers: boolean;
    currentUserId: string | null;
    getDisplayName: (u: Profile) => string;
    formatDate: (date: string | null | undefined) => string;
    formatRelativeTime: (date: string | null | undefined) => string;
}

const UserDetailsPanel: React.FC<UserDetailsPanelProps> = ({
    user, onClose, onRoleChange, onDeactivate, onReactivate, onDelete, onSetPassword,
    isChangingRole, canManageUsers, currentUserId, getDisplayName, formatDate, formatRelativeTime
}) => {
    const displayName = getDisplayName(user);
    const isOwner = user.role === 'owner';
    const isCurrentUser = user.id === currentUserId;
    const isDeactivated = user.status === 'deactivated';

    return (
        <div className="w-[380px] flex-shrink-0 bg-surface-container rounded-2xl border border-outline-variant/10 flex flex-col overflow-hidden animate-slide-in-right">
            {/* Header */}
            <div className="flex-shrink-0 p-5 border-b border-outline-variant/10">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <UserAvatar 
                            name={displayName}
                            email={user.email}
                            avatarUrl={user.avatar_url}
                            size="lg"
                        />
                        <div>
                            <h3 className="font-semibold text-on-surface">{displayName}</h3>
                            <p className="text-sm text-on-surface-variant/60">{user.email}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-on-surface-variant/40 hover:text-on-surface-variant hover:bg-surface-container-highest transition-colors"
                    >
                        <Icon name="x" className="w-5 h-5" />
                    </button>
                </div>

                {/* Role & Status */}
                <div className="flex items-center gap-2 mt-4">
                    <RoleBadge role={user.role} size="md" />
                    <StatusBadge status={user.status || 'active'} />
                    {isCurrentUser && (
                        <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-tertiary/20 text-tertiary">
                            You
                        </span>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto team-scroll p-5 space-y-6">
                {/* Details */}
                <div className="space-y-4">
                    <h4 className="text-xs font-semibold text-on-surface-variant/50 uppercase tracking-wider">Details</h4>
                    
                    <div className="space-y-3">
                        <DetailRow icon="mail" label="Email" value={user.email || 'N/A'} />
                        <DetailRow icon="user" label="Display Name" value={displayName} />
                        <DetailRow icon="shield" label="Role" value={user.role} />
                        <DetailRow icon="activity" label="Status" value={user.status || 'active'} />
                        <DetailRow icon="calendar" label="Joined" value={formatDate(user.created_at)} />
                        <DetailRow icon="clock" label="Last Active" value={formatRelativeTime(user.last_active_at)} />
                        {user.timezone && (
                            <DetailRow icon="globe" label="Timezone" value={user.timezone} />
                        )}
                    </div>
                </div>

                {/* Role Management */}
                {canManageUsers && !isOwner && !isCurrentUser && (
                    <div className="space-y-4">
                        <h4 className="text-xs font-semibold text-on-surface-variant/50 uppercase tracking-wider">Change Role</h4>
                        <div className="grid grid-cols-2 gap-2">
                            {(['admin', 'lead', 'analyst', 'viewer'] as Role[]).map((role) => (
                                <button
                                    key={role}
                                    onClick={() => onRoleChange(user.id, role)}
                                    disabled={isChangingRole || user.role === role}
                                    className={`px-3 py-2 text-sm font-medium rounded-xl transition-all capitalize ${
                                        user.role === role
                                            ? 'bg-tertiary/20 text-tertiary border-2 border-tertiary/30'
                                            : 'bg-surface-container-highest text-on-surface-variant hover:bg-surface-container-high border-2 border-transparent'
                                    } disabled:opacity-50`}
                                >
                                    {role}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            {canManageUsers && !isOwner && !isCurrentUser && (
                <div className="flex-shrink-0 p-4 border-t border-outline-variant/10 space-y-2">
                    <button
                        onClick={onSetPassword}
                        className="w-full px-4 py-2.5 text-sm font-medium text-on-surface bg-surface-container-highest hover:bg-surface-container-high rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                        <Icon name="key" className="w-4 h-4" />
                        Set Password
                    </button>
                    
                    {isDeactivated ? (
                        <button
                            onClick={() => onReactivate(user.id)}
                            className="w-full px-4 py-2.5 text-sm font-medium text-tertiary bg-tertiary/10 hover:bg-tertiary/20 rounded-xl transition-colors flex items-center justify-center gap-2"
                        >
                            <Icon name="user-check" className="w-4 h-4" />
                            Reactivate User
                        </button>
                    ) : (
                        <button
                            onClick={() => onDeactivate(user.id, displayName)}
                            className="w-full px-4 py-2.5 text-sm font-medium text-on-surface-variant bg-surface-container-highest hover:bg-surface-container-high rounded-xl transition-colors flex items-center justify-center gap-2"
                        >
                            <Icon name="user-minus" className="w-4 h-4" />
                            Deactivate User
                        </button>
                    )}
                    
                    <button
                        onClick={onDelete}
                        className="w-full px-4 py-2.5 text-sm font-medium text-error bg-error/10 hover:bg-error/20 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                        <Icon name="trash" className="w-4 h-4" />
                        Delete Permanently
                    </button>
                </div>
            )}
        </div>
    );
};

const DetailRow: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => (
    <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center flex-shrink-0">
            <Icon name={icon} className="w-4 h-4 text-on-surface-variant/50" />
        </div>
        <div className="flex-1 min-w-0">
            <p className="text-xs text-on-surface-variant/50">{label}</p>
            <p className="text-sm text-on-surface truncate capitalize">{value}</p>
        </div>
    </div>
);

// =============================================================================
// ROLE DROPDOWN
// =============================================================================

interface RoleDropdownProps {
    currentRole: Role;
    isLoading: boolean;
    onChange: (role: Role) => void;
}

const RoleDropdown: React.FC<RoleDropdownProps> = ({ currentRole, isLoading, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const roles: Role[] = ['admin', 'lead', 'analyst', 'viewer'];

    return (
        <div className="relative">
            <button
                onClick={(e) => { e.stopPropagation(); !isLoading && setIsOpen(!isOpen); }}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-surface-container-highest transition-colors disabled:opacity-50"
            >
                {isLoading ? (
                    <Icon name="spinner" className="w-3.5 h-3.5 animate-spin" />
                ) : (
                    <>
                        <RoleBadge role={currentRole} size="md" />
                        <Icon name="chevron-down" className="w-3.5 h-3.5 text-on-surface-variant/40" />
                    </>
                )}
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-40 py-1 bg-surface-container-highest rounded-xl border border-outline-variant/10 shadow-xl">
                        {roles.map((role) => (
                            <button
                                key={role}
                                onClick={(e) => { e.stopPropagation(); onChange(role); setIsOpen(false); }}
                                className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors ${
                                    role === currentRole ? 'bg-tertiary/10' : 'hover:bg-surface-container-high'
                                }`}
                            >
                                <RoleBadge role={role} size="sm" />
                                {role === currentRole && <Icon name="check" className="w-3.5 h-3.5 text-tertiary" />}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

// =============================================================================
// USER ACTIONS MENU
// =============================================================================

interface UserActionsMenuProps {
    user: Profile;
    onDeactivate: () => void;
    onReactivate: () => void;
    onDelete: () => void;
    onSetPassword: () => void;
}

const UserActionsMenu: React.FC<UserActionsMenuProps> = ({ user, onDeactivate, onReactivate, onDelete, onSetPassword }) => {
    const [isOpen, setIsOpen] = useState(false);
    const isDeactivated = user.status === 'deactivated';

    return (
        <div className="relative">
            <button
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                className="p-2 rounded-lg text-on-surface-variant/40 hover:text-on-surface-variant hover:bg-surface-container-highest transition-colors"
            >
                <Icon name="more-vertical" className="w-4 h-4" />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-48 py-1 bg-surface-container-highest rounded-xl border border-outline-variant/10 shadow-xl">
                        <button
                            onClick={(e) => { e.stopPropagation(); onSetPassword(); setIsOpen(false); }}
                            className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-on-surface-variant hover:bg-surface-container-high transition-colors"
                        >
                            <Icon name="key" className="w-4 h-4" />
                            Set Password
                        </button>
                        
                        {isDeactivated ? (
                            <button
                                onClick={(e) => { e.stopPropagation(); onReactivate(); setIsOpen(false); }}
                                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-tertiary hover:bg-tertiary/10 transition-colors"
                            >
                                <Icon name="user-check" className="w-4 h-4" />
                                Reactivate
                            </button>
                        ) : (
                            <button
                                onClick={(e) => { e.stopPropagation(); onDeactivate(); setIsOpen(false); }}
                                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-on-surface-variant hover:bg-surface-container-high transition-colors"
                            >
                                <Icon name="user-minus" className="w-4 h-4" />
                                Deactivate
                            </button>
                        )}
                        
                        <div className="my-1 border-t border-outline-variant/10" />
                        
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(); setIsOpen(false); }}
                            className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-error hover:bg-error/10 transition-colors"
                        >
                            <Icon name="trash" className="w-4 h-4" />
                            Delete User
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

// =============================================================================
// TEAMS LIST
// =============================================================================

interface TeamsListProps {
    teams: Team[];
    isLoading: boolean;
    expandedTeamId: string | null;
    teamMembersMap: Record<string, TeamMember[]>;
    loadingTeamMembers: string | null;
    onExpandTeam: (teamId: string) => void;
    onEditTeam: (team: Team) => void;
    onDeleteTeam: (teamId: string, teamName: string) => void;
    onRemoveMember: (userId: string, teamId: string, userName: string) => void;
    onAddMember: (teamId: string, teamName: string) => void;
    getDisplayName: (m: TeamMember) => string;
    formatDate: (date: string | null | undefined) => string;
    canManageTeams: boolean;
}

const TeamsList: React.FC<TeamsListProps> = ({
    teams, isLoading, expandedTeamId, teamMembersMap, loadingTeamMembers,
    onExpandTeam, onEditTeam, onDeleteTeam, onRemoveMember, onAddMember, 
    getDisplayName, formatDate, canManageTeams
}) => {
    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Icon name="spinner" className="w-8 h-8 animate-spin text-tertiary/50" />
            </div>
        );
    }

    if (teams.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-surface-container-highest flex items-center justify-center mb-4">
                    <Icon name="users" className="w-8 h-8 text-on-surface-variant/30" />
                </div>
                <p className="text-on-surface-variant/60 mb-1">No teams yet</p>
                <p className="text-sm text-on-surface-variant/40">Create your first team to organize users</p>
            </div>
        );
    }

    return (
        <div className="overflow-auto team-scroll h-full">
            <table className="w-full">
                <thead className="bg-surface-container-high/50 sticky top-0 z-10">
                    <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider">Team</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider w-[100px]">Members</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider w-[150px]">Created</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider w-[120px]">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                    {teams.map((team) => {
                        const isExpanded = expandedTeamId === team.id;
                        const members = teamMembersMap[team.id] || [];
                        const isLoadingMembers = loadingTeamMembers === team.id;

                        return (
                            <React.Fragment key={team.id}>
                                <tr 
                                    onClick={() => onExpandTeam(team.id)}
                                    className="cursor-pointer hover:bg-surface-container-high/50 transition-all"
                                >
                                    {/* Team Info */}
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-secondary-container/50 text-on-secondary-container flex-shrink-0">
                                                <Icon name="users" className="w-5 h-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-medium text-on-surface truncate">{team.name}</p>
                                                {team.description && (
                                                    <p className="text-xs text-on-surface-variant/50 truncate max-w-[300px]">{team.description}</p>
                                                )}
                                            </div>
                                            <Icon 
                                                name={isExpanded ? 'chevron-up' : 'chevron-down'} 
                                                className="w-4 h-4 text-on-surface-variant/40 ml-2" 
                                            />
                                        </div>
                                    </td>

                                    {/* Member Count */}
                                    <td className="px-4 py-3">
                                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-lg bg-surface-container-highest text-on-surface-variant">
                                            {members.length || '—'}
                                        </span>
                                    </td>

                                    {/* Created */}
                                    <td className="px-4 py-3">
                                        <span className="text-sm text-on-surface-variant/60">
                                            {formatDate(team.created_at)}
                                        </span>
                                    </td>

                                    {/* Actions */}
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            {canManageTeams && (
                                                <>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onAddMember(team.id, team.name); }}
                                                        className="p-2 rounded-lg text-tertiary hover:bg-tertiary/10 transition-colors"
                                                        title="Add member"
                                                    >
                                                        <Icon name="user-plus" className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onEditTeam(team); }}
                                                        className="p-2 rounded-lg text-on-surface-variant/50 hover:text-on-surface-variant hover:bg-surface-container-highest transition-colors"
                                                        title="Edit team"
                                                    >
                                                        <Icon name="edit" className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onDeleteTeam(team.id, team.name); }}
                                                        className="p-2 rounded-lg text-on-surface-variant/50 hover:text-error hover:bg-error/10 transition-colors"
                                                        title="Delete team"
                                                    >
                                                        <Icon name="trash" className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>

                                {/* Expanded Members */}
                                {isExpanded && (
                                    <tr>
                                        <td colSpan={4} className="bg-surface-container-low/50 px-4 py-0">
                                            <div className="py-3 pl-12">
                                                {isLoadingMembers ? (
                                                    <div className="flex items-center justify-center py-4">
                                                        <Icon name="spinner" className="w-5 h-5 animate-spin text-tertiary/50" />
                                                    </div>
                                                ) : members.length === 0 ? (
                                                    <p className="py-4 text-sm text-on-surface-variant/40 text-center">
                                                        No members in this team
                                                    </p>
                                                ) : (
                                                    <div className="space-y-1">
                                                        {members.map((member) => {
                                                            const memberName = getDisplayName(member);
                                                            return (
                                                                <div 
                                                                    key={member.id}
                                                                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-container/50 transition-colors"
                                                                >
                                                                    <UserAvatar 
                                                                        name={memberName}
                                                                        email={member.user?.email}
                                                                        avatarUrl={member.user?.avatar_url}
                                                                        size="sm"
                                                                    />
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-sm text-on-surface truncate">{memberName}</p>
                                                                        <p className="text-xs text-on-surface-variant/40 truncate">{member.user?.email}</p>
                                                                    </div>
                                                                    {member.user?.role && (
                                                                        <RoleBadge role={member.user.role} size="sm" />
                                                                    )}
                                                                    {canManageTeams && (
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); onRemoveMember(member.user_id, team.id, memberName); }}
                                                                            className="p-1.5 text-on-surface-variant/40 hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                                                                            title="Remove from team"
                                                                        >
                                                                            <Icon name="x" className="w-4 h-4" />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

// =============================================================================
// INVITATIONS TABLE
// =============================================================================

interface InvitationsTableProps {
    invitations: TeamInvitation[];
    isLoading: boolean;
    onCancel: (id: string, email: string) => void;
    onResend: (invitation: TeamInvitation) => void;
    formatDate: (date: string | null | undefined) => string;
    formatDateTime: (date: string | null | undefined) => string;
    isExpired: (date: string) => boolean;
}

const InvitationsTable: React.FC<InvitationsTableProps> = ({
    invitations, isLoading, onCancel, onResend, formatDate, formatDateTime, isExpired
}) => {
    const { showToast } = useToast();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Icon name="spinner" className="w-8 h-8 animate-spin text-tertiary/50" />
            </div>
        );
    }

    if (invitations.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-surface-container-highest flex items-center justify-center mb-4">
                    <Icon name="mail" className="w-8 h-8 text-on-surface-variant/30" />
                </div>
                <p className="text-on-surface-variant/60 mb-1">No pending invitations</p>
                <p className="text-sm text-on-surface-variant/40">Invitations will appear here until accepted</p>
            </div>
        );
    }

    const handleCopyLink = (invitation: TeamInvitation) => {
        if (invitation.token) {
            navigator.clipboard.writeText(`${window.location.origin}/invite/${invitation.token}`);
            showToast('success', 'Link Copied', 'Invitation link copied to clipboard');
        }
    };

    return (
        <div className="overflow-auto team-scroll h-full">
            <table className="w-full">
                <thead className="bg-surface-container-high/50 sticky top-0 z-10">
                    <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider">Email</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider w-[100px]">Role</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider w-[100px]">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider w-[150px]">Sent</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider w-[150px]">Expires</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider w-[160px]">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                    {invitations.map((invitation) => {
                        const expired = invitation.expires_at ? isExpired(invitation.expires_at) : false;

                        return (
                            <tr key={invitation.id} className={`${expired ? 'opacity-50' : ''}`}>
                                {/* Email */}
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                            expired 
                                                ? 'bg-error-container/50 text-on-error-container' 
                                                : 'bg-secondary-container/50 text-on-secondary-container'
                                        }`}>
                                            <Icon name={expired ? 'clock' : 'mail'} className="w-5 h-5" />
                                        </div>
                                        <span className="font-medium text-on-surface truncate">{invitation.email}</span>
                                    </div>
                                </td>

                                {/* Role */}
                                <td className="px-4 py-3">
                                    <RoleBadge role={invitation.role} size="md" />
                                </td>

                                {/* Status */}
                                <td className="px-4 py-3">
                                    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-md ${
                                        expired 
                                            ? 'bg-error-container/50 text-on-error-container'
                                            : 'bg-secondary-container/50 text-on-secondary-container'
                                    }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${expired ? 'bg-error' : 'bg-secondary'}`} />
                                        {expired ? 'Expired' : 'Pending'}
                                    </span>
                                </td>

                                {/* Sent */}
                                <td className="px-4 py-3">
                                    <span className="text-sm text-on-surface-variant/60">
                                        {formatDate(invitation.created_at)}
                                    </span>
                                </td>

                                {/* Expires */}
                                <td className="px-4 py-3">
                                    <span className={`text-sm ${expired ? 'text-error' : 'text-on-surface-variant/60'}`}>
                                        {formatDateTime(invitation.expires_at)}
                                    </span>
                                </td>

                                {/* Actions */}
                                <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        {!expired && invitation.token && (
                                            <button
                                                onClick={() => handleCopyLink(invitation)}
                                                className="px-2 py-1.5 text-xs font-medium text-on-surface-variant hover:text-tertiary hover:bg-tertiary/10 rounded-lg transition-colors"
                                            >
                                                Copy Link
                                            </button>
                                        )}
                                        <button
                                            onClick={() => onResend(invitation)}
                                            className="px-2 py-1.5 text-xs font-medium text-tertiary hover:bg-tertiary/10 rounded-lg transition-colors"
                                        >
                                            Resend
                                        </button>
                                        <button
                                            onClick={() => onCancel(invitation.id, invitation.email)}
                                            className="px-2 py-1.5 text-xs font-medium text-error hover:bg-error/10 rounded-lg transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

// =============================================================================
// TEAM FORM MODAL (Create / Edit)
// =============================================================================

interface TeamFormModalProps {
    mode: 'create' | 'edit';
    team?: Team;
    onClose: () => void;
    onSubmit: (name: string, description: string) => Promise<{ success: boolean; error?: string }>;
}

const TeamFormModal: React.FC<TeamFormModalProps> = ({ mode, team, onClose, onSubmit }) => {
    const [name, setName] = useState(team?.name || '');
    const [description, setDescription] = useState(team?.description || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setError('Team name is required');
            return;
        }
        
        setIsSubmitting(true);
        setError(null);
        
        const result = await onSubmit(name.trim(), description.trim());
        
        if (!result.success) {
            setError(result.error || `Failed to ${mode} team`);
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-scrim/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-md bg-surface-container border border-outline-variant/20 rounded-2xl shadow-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-outline-variant/10">
                    <h3 className="text-base font-semibold text-on-surface">
                        {mode === 'create' ? 'Create New Team' : 'Edit Team'}
                    </h3>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                        {mode === 'create' 
                            ? 'Teams help organize users for collaborative work'
                            : 'Update team name and description'
                        }
                    </p>
                </div>
                
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
                            Team Name *
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Detection Engineering"
                            className="w-full px-3 py-2 text-sm bg-surface-container-high border border-outline-variant/10 rounded-lg text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:border-tertiary/30"
                            autoFocus
                        />
                    </div>
                    
                    <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
                            Description
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Optional team description..."
                            rows={3}
                            className="w-full px-3 py-2 text-sm bg-surface-container-high border border-outline-variant/10 rounded-lg text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:border-tertiary/30 resize-none"
                        />
                    </div>
                    
                    {error && (
                        <p className="text-sm text-error">{error}</p>
                    )}
                </form>
                
                <div className="px-5 py-3 border-t border-outline-variant/10 flex items-center justify-end gap-2 bg-surface-container-low">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="px-3 py-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !name.trim()}
                        className="px-4 py-1.5 text-sm font-medium bg-tertiary text-on-tertiary rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                    >
                        {isSubmitting ? (mode === 'create' ? 'Creating...' : 'Saving...') : (mode === 'create' ? 'Create Team' : 'Save Changes')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// =============================================================================
// ADD MEMBER TO TEAM MODAL
// =============================================================================

interface AddMemberToTeamModalProps {
    teamId: string;
    teamName: string;
    allUsers: Profile[];
    existingMembers: TeamMember[];
    onClose: () => void;
    onAdd: (userId: string, teamId: string) => void;
    getDisplayName: (u: Profile) => string;
}

const AddMemberToTeamModal: React.FC<AddMemberToTeamModalProps> = ({
    teamId, teamName, allUsers, existingMembers, onClose, onAdd, getDisplayName
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [isAdding, setIsAdding] = useState<string | null>(null);
    
    const existingUserIds = new Set(existingMembers.map(m => m.user_id));
    const availableUsers = allUsers.filter(u => 
        !existingUserIds.has(u.id) && 
        u.status !== 'deactivated'
    );
    
    const filteredUsers = availableUsers.filter(u => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        const name = getDisplayName(u).toLowerCase();
        const email = (u.email || '').toLowerCase();
        return name.includes(query) || email.includes(query);
    });

    const handleAdd = async (userId: string) => {
        setIsAdding(userId);
        await onAdd(userId, teamId);
        setIsAdding(null);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-scrim/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-md bg-surface-container border border-outline-variant/20 rounded-2xl shadow-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-outline-variant/10">
                    <h3 className="text-base font-semibold text-on-surface">Add Members to "{teamName}"</h3>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                        Select users to add to this team
                    </p>
                </div>
                
                <div className="p-4 border-b border-outline-variant/10">
                    <div className="relative">
                        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search users..."
                            className="w-full pl-10 pr-4 py-2 bg-surface-container-high border border-outline-variant/10 rounded-lg text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:border-tertiary/30"
                            autoFocus
                        />
                    </div>
                </div>
                
                <div className="max-h-64 overflow-y-auto team-scroll">
                    {filteredUsers.length === 0 ? (
                        <div className="py-8 text-center text-sm text-on-surface-variant/50">
                            {availableUsers.length === 0 
                                ? 'All users are already in this team'
                                : 'No users match your search'
                            }
                        </div>
                    ) : (
                        <div className="divide-y divide-outline-variant/5">
                            {filteredUsers.map((user) => (
                                <div 
                                    key={user.id}
                                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container-high/50"
                                >
                                    <UserAvatar 
                                        name={getDisplayName(user)}
                                        email={user.email}
                                        avatarUrl={user.avatar_url}
                                        size="md"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-on-surface truncate">{getDisplayName(user)}</p>
                                        <p className="text-xs text-on-surface-variant/40 truncate">{user.email}</p>
                                    </div>
                                    <RoleBadge role={user.role} size="sm" />
                                    <button
                                        onClick={() => handleAdd(user.id)}
                                        disabled={isAdding === user.id}
                                        className="px-3 py-1 text-sm font-medium text-tertiary hover:bg-tertiary/10 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        {isAdding === user.id ? '...' : 'Add'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                <div className="px-5 py-3 border-t border-outline-variant/10 bg-surface-container-low">
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UserManagementPage;