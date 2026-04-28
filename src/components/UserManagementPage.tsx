import React, { useState, useMemo } from 'react';
import { Icon } from './Icon';
import { Role, Profile, UserInvitation } from '../types';
import { useToast } from '../hooks/useToast';
import { useUserManagement } from '../context/UserManagementContext';
import { usePermissions } from '../context/PermissionsContext';
import { RoleBadge } from './rbac/RoleBadge';
import { InviteUserModal } from './rbac/InviteUserModal';
import { supabase } from '../lib/supabaseClient';

// =============================================================================
// AVATAR
// =============================================================================

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

const getAvatarColor = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const UserAvatar: React.FC<{
    name?: string | null; email?: string | null; avatarUrl?: string | null; size?: 'sm' | 'md' | 'lg';
}> = ({ name, email, avatarUrl, size = 'md' }) => {
    const dn = name || email?.split('@')[0] || '?';
    const init = dn.split(/\s+/).length >= 2
        ? (dn.split(/\s+/)[0][0] + dn.split(/\s+/).slice(-1)[0][0]).toUpperCase()
        : dn.slice(0, 2).toUpperCase();
    const { bg, text } = getAvatarColor(email || name || '');
    const s = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-lg' };
    const r = { sm: 'rounded-[10px]', md: 'rounded-xl', lg: 'rounded-xl' };
    if (avatarUrl) return <img src={avatarUrl} alt={dn} className={`${s[size]} ${r[size]} object-cover`} />;
    return <div className={`${s[size]} ${r[size]} flex items-center justify-center font-semibold ${bg} ${text}`}>{init}</div>;
};

// =============================================================================
// TYPES
// =============================================================================

type TabId = 'users' | 'invitations';
type SortField = 'name' | 'email' | 'role' | 'status' | 'created_at' | 'last_active_at';
interface SortConfig { field: SortField; direction: 'asc' | 'desc'; }

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const UserManagementPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabId>('users');
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [isInviting, setIsInviting] = useState(false);
    const [changingRoleFor, setChangingRoleFor] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
    const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'name', direction: 'asc' });
    const [passwordModal, setPasswordModal] = useState<{ userId: string; userName: string; email: string } | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [isSettingPassword, setIsSettingPassword] = useState(false);
    const [deleteModal, setDeleteModal] = useState<{ userId: string; userName: string; email: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [activeStat, setActiveStat] = useState('members');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const { showToast } = useToast();
    const { hasRoleOrHigher, userId: currentUserId } = usePermissions();
    const {
        allUsers, invitations, usersLoading, invitationsLoading,
        inviteUser, changeUserRole, deactivateUser, reactivateUser,
        cancelInvitation, refreshAllUsers, refreshInvitations,
    } = useUserManagement();

    const handleSort = (field: SortField) => setSortConfig(prev => ({ field, direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc' }));

    const sortedUsers = useMemo(() => {
        return [...allUsers].sort((a, b) => {
            let av: string | number, bv: string | number;
            switch (sortConfig.field) {
                case 'name': av = a.full_name || a.email || ''; bv = b.full_name || b.email || ''; break;
                case 'email': av = a.email || ''; bv = b.email || ''; break;
                case 'role': { const o: Record<string, number> = { owner: 0, admin: 1, lead: 2, analyst: 3, viewer: 4 }; av = o[a.role] ?? 5; bv = o[b.role] ?? 5; break; }
                case 'status': av = a.status || 'active'; bv = b.status || 'active'; break;
                case 'created_at': av = new Date(a.created_at || 0).getTime(); bv = new Date(b.created_at || 0).getTime(); break;
                case 'last_active_at': av = new Date(a.last_active_at || a.updated_at || a.created_at || 0).getTime(); bv = new Date(b.last_active_at || b.updated_at || b.created_at || 0).getTime(); break;
                default: av = ''; bv = '';
            }
            if (typeof av === 'string') { const c = av.toLowerCase().localeCompare(bv as string); return sortConfig.direction === 'asc' ? c : -c; }
            return sortConfig.direction === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
        });
    }, [allUsers, sortConfig]);

    // Handlers
    const handleInviteUser = async (email: string, role: Role) => {
        setIsInviting(true);
        try { await inviteUser(email, role); setIsInviteModalOpen(false); await Promise.all([refreshAllUsers(), refreshInvitations()]); }
        catch (err) { throw err; } finally { setIsInviting(false); }
    };
    const handleRoleChange = async (userId: string, newRole: Role) => {
        setChangingRoleFor(userId);
        try { await changeUserRole(userId, newRole); if (selectedUser?.id === userId) setSelectedUser(p => p ? { ...p, role: newRole } : null); }
        finally { setChangingRoleFor(null); }
    };
    const handleDeactivate = async (userId: string, userName: string) => {
        if (!window.confirm(`Deactivate ${userName}?`)) return;
        try { await deactivateUser(userId); if (selectedUser?.id === userId) setSelectedUser(p => p ? { ...p, status: 'deactivated' } : null); } catch {}
    };
    const handleReactivate = async (userId: string) => {
        try { await reactivateUser(userId); if (selectedUser?.id === userId) setSelectedUser(p => p ? { ...p, status: 'active' } : null); } catch {}
    };
    const handleDeleteUser = async () => {
        if (!deleteModal) return;
        setIsDeleting(true);
        try {
            const { error: ce } = await supabase.rpc('cleanup_user_data', { target_user_id: deleteModal.userId });
            if (ce) {
                await supabase.from('activity_log').delete().eq('user_id', deleteModal.userId);
                await supabase.from('user_notifications').delete().or(`user_id.eq.${deleteModal.userId},source_user_id.eq.${deleteModal.userId}`);
                await supabase.from('detection_comments').delete().eq('user_id', deleteModal.userId);
                if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deleteModal.userId)) throw new Error('Invalid user ID');
                await supabase.from('detection_reviews').delete().or(`reviewer_id.eq.${deleteModal.userId},requested_by.eq.${deleteModal.userId}`);
                await supabase.from('user_invitations').delete().eq('invited_by', deleteModal.userId);
                await supabase.from('detections').update({ assigned_to: null }).eq('assigned_to', deleteModal.userId);
                await supabase.from('detections').update({ user_id: currentUserId }).eq('user_id', deleteModal.userId);
            }
            const { data, error } = await supabase.functions.invoke('manage-users', { body: { action: 'delete', userId: deleteModal.userId } });
            if (error) throw error; if (data.error) throw new Error(data.error);
            showToast('success', 'User Deleted', `${deleteModal.email} has been permanently deleted.`);
            setDeleteModal(null); setSelectedUser(null); await refreshAllUsers();
        } catch (err: unknown) { showToast('error', 'Delete Failed', err instanceof Error ? err.message : 'Failed to delete user.'); }
        finally { setIsDeleting(false); }
    };
    const handleSetPassword = async () => {
        if (!passwordModal || !newPassword) return;
        if (newPassword.length < 12) { showToast('error', 'Invalid Password', 'Password must be at least 12 characters.'); return; }
        if (!/[A-Z]/.test(newPassword)) { showToast('error', 'Invalid Password', 'Must contain at least one uppercase letter.'); return; }
        if (!/[a-z]/.test(newPassword)) { showToast('error', 'Invalid Password', 'Must contain at least one lowercase letter.'); return; }
        if (!/[0-9]/.test(newPassword)) { showToast('error', 'Invalid Password', 'Must contain at least one number.'); return; }
        setIsSettingPassword(true);
        try {
            const { data, error } = await supabase.functions.invoke('manage-users', { body: { action: 'setPassword', userId: passwordModal.userId, password: newPassword } });
            if (error) throw error; if (data.error) throw new Error(data.error);
            showToast('success', 'Password Set', `${passwordModal.userName} can now log in with the new password.`);
            setPasswordModal(null); setNewPassword('');
        } catch (err: unknown) { showToast('error', 'Failed', err instanceof Error ? err.message : 'Failed to set password.'); }
        finally { setIsSettingPassword(false); }
    };
    const handleCancelInvitation = async (id: string, email: string) => {
        if (!window.confirm(`Cancel invitation for ${email}?`)) return;
        try { await cancelInvitation(id); } catch {}
    };
    const handleResendInvitation = async (inv: UserInvitation) => {
        try { await cancelInvitation(inv.id); await inviteUser(inv.email, inv.role); showToast('success', 'Invitation Resent', `New invitation sent to ${inv.email}`); }
        catch (err: unknown) { showToast('error', 'Failed', err instanceof Error ? err.message : 'Failed to resend invitation'); }
    };

    // Helpers
    const getDisplayName = (u: Profile) => u.full_name || u.email?.split('@')[0] || 'Unknown';
    const fmtDate = (d: string | null | undefined) => { if (!d) return '—'; return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
    const fmtDateTime = (d: string | null | undefined) => { if (!d) return '—'; return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
    const getLastActive = (u: Profile) => {
        const d = u.last_active_at || u.updated_at || u.created_at;
        if (!d) return '—';
        const ms = Date.now() - new Date(d).getTime();
        const m = Math.floor(ms / 60000), h = Math.floor(ms / 3600000), dy = Math.floor(ms / 86400000);
        if (m < 1) return 'Just now'; if (m < 60) return `${m} min ago`; if (h < 24) return `${h} hours ago`;
        if (dy === 1) return 'Yesterday'; if (dy < 7) return `${dy} days ago`;
        return fmtDate(d);
    };
    const isExpired = (d: string) => new Date(d) < new Date();

    const filteredUsers = sortedUsers.filter(u => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return getDisplayName(u).toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
    });

    const canManageUsers = hasRoleOrHigher('admin');
    const activeCount = allUsers.filter(u => u.status !== 'deactivated').length;
    const deactivatedCount = allUsers.length - activeCount;
    const existingEmails = useMemo(() => new Set(allUsers.map(u => u.email?.toLowerCase()).filter(Boolean)), [allUsers]);
    const pendingInvitations = useMemo(() => invitations.filter(i => !i.accepted_at && !existingEmails.has(i.email.toLowerCase())), [invitations, existingEmails]);

    return (
        <div className="h-full overflow-y-auto bg-background scrollbar-page animate-page-enter">
            {/* FULL WIDTH - no max-w constraint */}
            <div className="px-8 py-8">

                {/* HEADER ROW */}
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-2xl font-bold text-on-surface">Members</h1>
                    <div className="flex items-center gap-3">
                        {canManageUsers && (
                            <button onClick={() => setIsInviteModalOpen(true)}
                                className="inline-flex items-center gap-2 h-10 px-5 bg-primary text-on-primary text-sm font-medium rounded-xl hover:bg-primary/90 active:scale-[0.98] transition-all">
                                <Icon name="plus" className="w-4 h-4" />
                                Invite members
                            </button>
                        )}
                    </div>
                </div>

                {/* STATS ROW - horizontal with visible dividers */}
                <div className="flex items-stretch rounded-xl border border-outline-variant/40 mb-8 overflow-hidden">
                    {[
                        { label: 'Members', value: allUsers.length, id: 'members', tab: 'users' as TabId },
                        { label: 'Active', value: activeCount, id: 'active', tab: 'users' as TabId },
                        { label: 'Pending', value: pendingInvitations.length, id: 'pending', tab: 'invitations' as TabId },
                        { label: 'Deactivated', value: deactivatedCount, id: 'deactivated', tab: 'users' as TabId },
                    ].map((stat, i) => (
                        <button
                            key={stat.id}
                            onClick={() => { setActiveStat(stat.id); setActiveTab(stat.tab); setSelectedUser(null); }}
                            className={`flex-1 py-5 text-center transition-colors ${
                                activeStat === stat.id ? 'bg-surface-container-highest' : 'hover:bg-surface-container-high/50'
                            } ${i > 0 ? 'border-l border-outline-variant/40' : ''}`}
                        >
                            <p className="text-3xl font-bold text-on-surface tabular-nums">{stat.value}</p>
                            <p className="text-sm text-on-surface-variant mt-1">{stat.label}</p>
                        </button>
                    ))}
                </div>

                {/* SEARCH BAR - full width */}
                <div className="flex items-center gap-4 mb-6">
                    <div className="relative flex-1">
                        <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant/40" />
                        <input
                            type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            placeholder={activeTab === 'users' ? 'Search members...' : 'Search invitations...'}
                            className="w-full h-11 pl-12 pr-4 bg-surface-container-high border border-outline-variant/40 rounded-xl text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                    </div>
                </div>

                {/* BULK ACTIONS BAR */}
                {selectedIds.size > 0 && (
                    <div className="flex items-center gap-4 mb-4 px-4 py-3 bg-surface-container-high border border-outline-variant/40 rounded-xl">
                        <span className="text-sm font-medium text-on-surface">{selectedIds.size} selected</span>
                        <div className="flex items-center gap-2 ml-auto">
                            <button onClick={() => {
                                if (window.confirm(`Deactivate ${selectedIds.size} users?`)) {
                                    selectedIds.forEach(id => handleDeactivate(id, ''));
                                    setSelectedIds(new Set());
                                }
                            }} className="h-8 px-3 text-xs font-medium text-on-surface-variant border border-outline-variant/30 hover:bg-surface-container-highest rounded-lg transition-colors">
                                Deactivate
                            </button>
                            <button onClick={() => setSelectedIds(new Set())} className="h-8 px-3 text-xs font-medium text-on-surface-variant hover:text-on-surface rounded-lg transition-colors">
                                Clear
                            </button>
                        </div>
                    </div>
                )}

                {/* TABLE AREA */}
                <div className="flex gap-6">
                    <div className={`flex-1 min-w-0 ${selectedUser ? 'max-w-[calc(100%-500px)]' : ''}`}>

                        {/* TABLE HEADER ROW */}
                        {activeTab === 'users' && (
                            <UsersTable
                                users={filteredUsers} isLoading={usersLoading} changingRoleFor={changingRoleFor}
                                selectedUserId={selectedUser?.id || null} sortConfig={sortConfig}
                                onSort={handleSort} onRoleChange={handleRoleChange} onSelectUser={setSelectedUser}
                                onDeactivate={handleDeactivate} onReactivate={handleReactivate}
                                onDelete={u => setDeleteModal({ userId: u.id, userName: getDisplayName(u), email: u.email || '' })}
                                onSetPassword={u => setPasswordModal({ userId: u.id, userName: getDisplayName(u), email: u.email || '' })}
                                getDisplayName={getDisplayName} fmtDate={fmtDate} getLastActive={getLastActive}
                                canManageUsers={canManageUsers} currentUserId={currentUserId}
                                selectedIds={selectedIds}
                                onToggleSelect={(id) => setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; })}
                                onToggleAll={(ids) => setSelectedIds(prev => { const allSelected = ids.every(id => prev.has(id)); return allSelected ? new Set() : new Set(ids); })}
                            />
                        )}
                        {activeTab === 'invitations' && (
                            <InvitationsTable
                                invitations={pendingInvitations} isLoading={invitationsLoading}
                                onCancel={handleCancelInvitation} onResend={handleResendInvitation}
                                fmtDate={fmtDate} fmtDateTime={fmtDateTime} isExpired={isExpired}
                            />
                        )}
                    </div>

                    {selectedUser && activeTab === 'users' && (
                        <DetailPanel
                            user={selectedUser} onClose={() => setSelectedUser(null)}
                            onRoleChange={handleRoleChange} onDeactivate={handleDeactivate} onReactivate={handleReactivate}
                            onDelete={() => setDeleteModal({ userId: selectedUser.id, userName: getDisplayName(selectedUser), email: selectedUser.email || '' })}
                            onSetPassword={() => setPasswordModal({ userId: selectedUser.id, userName: getDisplayName(selectedUser), email: selectedUser.email || '' })}
                            isChangingRole={changingRoleFor === selectedUser.id} canManageUsers={canManageUsers}
                            currentUserId={currentUserId} getDisplayName={getDisplayName} fmtDate={fmtDate} getLastActive={getLastActive}
                        />
                    )}
                </div>
            </div>

            {/* MODALS */}
            <InviteUserModal isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} onInvite={handleInviteUser} isInviting={isInviting} />

            {passwordModal && (
                <ModalOverlay onClose={() => setPasswordModal(null)}>
                    <div className="px-6 py-5 border-b border-outline-variant/20"><h3 className="text-lg font-semibold text-on-surface">Set Password</h3><p className="text-sm text-on-surface-variant mt-1">for {passwordModal.email}</p></div>
                    <div className="p-6">
                        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 12 chars, upper, lower, number"
                            className="w-full h-11 px-4 text-sm bg-surface-container-high border border-outline-variant/40 rounded-xl text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all" autoFocus />
                    </div>
                    <div className="px-6 py-4 border-t border-outline-variant/15 flex justify-end gap-3">
                        <button onClick={() => { setPasswordModal(null); setNewPassword(''); }} className="h-10 px-5 text-sm font-medium text-on-surface-variant hover:text-on-surface rounded-xl border border-outline-variant/30 hover:bg-surface-container-highest transition-all">Cancel</button>
                        <button onClick={handleSetPassword} disabled={isSettingPassword || newPassword.length < 6} className="h-10 px-5 text-sm font-medium bg-primary text-on-primary rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-all">{isSettingPassword ? 'Setting...' : 'Set Password'}</button>
                    </div>
                </ModalOverlay>
            )}

            {deleteModal && (
                <ModalOverlay onClose={() => !isDeleting && setDeleteModal(null)}>
                    <div className="px-6 py-5 border-b border-outline-variant/20"><h3 className="text-lg font-semibold text-on-surface">Delete User</h3></div>
                    <div className="p-6">
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-error/10 border border-error/20 mb-4">
                            <Icon name="alert-triangle" className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
                            <div><p className="text-sm font-medium text-on-surface">This action is irreversible</p><p className="text-xs text-on-surface-variant mt-1">Their detections will be transferred to you.</p></div>
                        </div>
                        <p className="text-sm text-on-surface-variant">Delete <span className="font-semibold text-on-surface">{deleteModal.email}</span>?</p>
                    </div>
                    <div className="px-6 py-4 border-t border-outline-variant/15 flex justify-end gap-3">
                        <button onClick={() => setDeleteModal(null)} disabled={isDeleting} className="h-10 px-5 text-sm font-medium text-on-surface-variant hover:text-on-surface rounded-xl border border-outline-variant/30 hover:bg-surface-container-highest transition-all">Cancel</button>
                        <button onClick={handleDeleteUser} disabled={isDeleting} className="h-10 px-5 text-sm font-medium bg-error text-on-error rounded-xl hover:brightness-110 disabled:opacity-50 transition-all flex items-center gap-2">
                            {isDeleting ? <><Icon name="spinner" className="w-4 h-4 animate-spin" />Deleting...</> : <><Icon name="trash" className="w-4 h-4" />Delete</>}
                        </button>
                    </div>
                </ModalOverlay>
            )}
        </div>
    );
};

const ModalOverlay: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-scrim/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-md bg-surface-container-highest border border-outline-variant/40 rounded-2xl shadow-2xl overflow-hidden">{children}</div>
    </div>
);

// =============================================================================
// TABLE CHECKBOX — inline, no label wrapper, proper alignment
// =============================================================================

const TableCheckbox: React.FC<{ checked: boolean; indeterminate?: boolean; onChange: () => void }> = ({ checked, indeterminate, onChange }) => (
    <button
        onClick={e => { e.stopPropagation(); onChange(); }}
        className={`w-4 h-4 rounded flex items-center justify-center transition-all ${
            checked || indeterminate
                ? 'bg-primary border border-primary'
                : 'border border-zinc-600 hover:border-zinc-400 bg-transparent'
        }`}
    >
        {checked && <svg width="9" height="7" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        {indeterminate && !checked && <svg width="7" height="2" viewBox="0 0 8 2" fill="none"><path d="M1 1H7" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>}
    </button>
);

// =============================================================================
// USERS TABLE
// =============================================================================

const UsersTable: React.FC<{
    users: Profile[]; isLoading: boolean; changingRoleFor: string | null;
    selectedUserId: string | null; sortConfig: SortConfig;
    onSort: (f: SortField) => void; onRoleChange: (id: string, r: Role) => void;
    onSelectUser: (u: Profile) => void; onDeactivate: (id: string, n: string) => void;
    onReactivate: (id: string) => void; onDelete: (u: Profile) => void; onSetPassword: (u: Profile) => void;
    getDisplayName: (u: Profile) => string; fmtDate: (d: string | null | undefined) => string;
    getLastActive: (u: Profile) => string; canManageUsers: boolean; currentUserId: string | null;
    selectedIds: Set<string>; onToggleSelect: (id: string) => void; onToggleAll: (userIds: string[]) => void;
}> = ({ users, isLoading, changingRoleFor, selectedUserId, sortConfig, onSort, onRoleChange, onSelectUser, onDeactivate, onReactivate, onDelete, onSetPassword, getDisplayName, fmtDate, getLastActive, canManageUsers, currentUserId, selectedIds, onToggleSelect, onToggleAll }) => {
    if (isLoading) return <div className="flex items-center justify-center py-24"><Icon name="spinner" className="w-8 h-8 animate-spin text-primary/40" /></div>;
    if (users.length === 0) return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
            <Icon name="user-circle" className="w-12 h-12 text-on-surface-variant/20 mb-3" />
            <p className="text-on-surface-variant/60">No users found</p>
        </div>
    );

    const Th: React.FC<{ field: SortField; children: string; center?: boolean }> = ({ field, children, center }) => (
        <th className={`px-4 py-2.5 text-[13px] font-semibold text-on-surface-variant cursor-pointer hover:text-on-surface select-none whitespace-nowrap ${center ? 'text-center' : 'text-left'}`} onClick={() => onSort(field)}>
            <span className={`inline-flex items-center gap-1 ${center ? 'justify-center' : ''}`}>{children}{sortConfig.field === field && <Icon name={sortConfig.direction === 'asc' ? 'chevron-up' : 'chevron-down'} className="w-3 h-3" />}</span>
        </th>
    );

    const allChecked = users.length > 0 && users.every(u => selectedIds.has(u.id));
    const someChecked = selectedIds.size > 0 && !allChecked;

    return (
        <div className="border border-outline-variant/40 rounded-xl overflow-hidden">
            <table className="w-full table-fixed">
                <colgroup>
                    <col className="w-[40px]" />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '9%' }} />
                    {canManageUsers && <col style={{ width: '7%' }} />}
                </colgroup>
                <thead>
                    <tr className="border-b border-zinc-700/60 bg-surface-container-high">
                        <th className="px-3 py-2.5 text-center">
                            <TableCheckbox checked={allChecked} indeterminate={someChecked} onChange={() => onToggleAll(users.map(u => u.id))} />
                        </th>
                        <Th field="name">Name</Th>
                        <Th field="email">Email</Th>
                        <Th field="role" center>Role</Th>
                        <Th field="created_at">Created On</Th>
                        <Th field="last_active_at">Last Login</Th>
                        <th className="px-3 py-2.5 text-center text-[13px] font-semibold text-on-surface-variant">2FA</th>
                        <Th field="status" center>Status</Th>
                        {canManageUsers && <th className="px-3 py-2.5 text-center text-[13px] font-semibold text-on-surface-variant">Action</th>}
                    </tr>
                </thead>
                <tbody>
                    {users.map(user => {
                        const name = getDisplayName(user);
                        const isOwner = user.role === 'owner';
                        const isSelf = user.id === currentUserId;
                        const selected = selectedUserId === user.id;
                        const deactivated = user.status === 'deactivated';

                        return (
                            <tr key={user.id} onClick={() => onSelectUser(user)}
                                className={`border-b border-zinc-700/40 cursor-pointer transition-colors ${selected ? 'bg-primary/8' : 'hover:bg-surface-container-high/60'} ${deactivated ? 'opacity-50' : ''}`}>

                                <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                                    <div className="flex justify-center"><TableCheckbox checked={selectedIds.has(user.id)} onChange={() => onToggleSelect(user.id)} /></div>
                                </td>

                                <td className="px-4 py-2">
                                    <div className="flex items-center gap-2.5">
                                        <UserAvatar name={name} email={user.email} avatarUrl={user.avatar_url} size="sm" />
                                        <span className="text-[13px] text-on-surface truncate">
                                            {name}
                                            {isSelf && <span className="ml-1 text-[11px] text-on-surface-variant/50">You</span>}
                                        </span>
                                    </div>
                                </td>

                                <td className="px-4 py-2"><span className="text-[13px] text-on-surface-variant/70 truncate block">{user.email}</span></td>

                                <td className="px-3 py-2 text-center">
                                    {(isOwner || !canManageUsers || isSelf) ? <RoleBadge role={user.role} size="sm" />
                                        : <RoleDropdown currentRole={user.role} isLoading={changingRoleFor === user.id} onChange={r => onRoleChange(user.id, r)} />}
                                </td>

                                <td className="px-4 py-2"><span className="text-[13px] text-on-surface-variant/60">{fmtDate(user.created_at)}</span></td>

                                <td className="px-4 py-2"><span className="text-[13px] text-on-surface-variant/60">{getLastActive(user)}</span></td>

                                <td className="px-3 py-2 text-center">
                                    <span className="text-[11px] text-on-surface-variant/40">—</span>
                                </td>

                                {/* Status */}
                                <td className="px-3 py-2 text-center">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full ${
                                        deactivated ? 'bg-red-500/15 text-red-400' : 'bg-teal-500/15 text-teal-400'
                                    }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${deactivated ? 'bg-red-400' : 'bg-teal-400'}`} />
                                        {deactivated ? 'Disabled' : 'Active'}
                                    </span>
                                </td>

                                {canManageUsers && (
                                    <td className="px-2 py-2">
                                        {!isOwner && !isSelf && (
                                            <div className="flex items-center justify-center gap-0">
                                                <button onClick={e => { e.stopPropagation(); onSelectUser(user); }} title="View"
                                                    className="p-1 rounded text-on-surface-variant/40 hover:text-on-surface-variant hover:bg-surface-container-highest transition-colors">
                                                    <Icon name="eye" className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={e => { e.stopPropagation(); onSetPassword(user); }} title="Edit"
                                                    className="p-1 rounded text-on-surface-variant/40 hover:text-on-surface-variant hover:bg-surface-container-highest transition-colors">
                                                    <Icon name="edit" className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={e => { e.stopPropagation(); onDelete(user); }} title="Delete"
                                                    className="p-1 rounded text-on-surface-variant/40 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                                    <Icon name="trash" className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

// =============================================================================
// DETAIL PANEL
// =============================================================================

const DetailPanel: React.FC<{
    user: Profile; onClose: () => void; onRoleChange: (id: string, r: Role) => void;
    onDeactivate: (id: string, n: string) => void; onReactivate: (id: string) => void;
    onDelete: () => void; onSetPassword: () => void; isChangingRole: boolean;
    canManageUsers: boolean; currentUserId: string | null; getDisplayName: (u: Profile) => string;
    fmtDate: (d: string | null | undefined) => string; getLastActive: (u: Profile) => string;
}> = ({ user, onClose, onRoleChange, onDeactivate, onReactivate, onDelete, onSetPassword, isChangingRole, canManageUsers, currentUserId, getDisplayName, fmtDate, getLastActive }) => {
    const name = getDisplayName(user);
    const isOwner = user.role === 'owner';
    const isSelf = user.id === currentUserId;

    return (
        <div className="w-[480px] flex-shrink-0 border border-outline-variant/40 rounded-xl bg-surface-container-high flex flex-col overflow-hidden animate-page-enter">
            <div className="p-5 border-b border-outline-variant/20">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <UserAvatar name={name} email={user.email} avatarUrl={user.avatar_url} size="lg" />
                        <div className="min-w-0">
                            <h3 className="font-semibold text-on-surface truncate">{name}</h3>
                            <p className="text-sm text-on-surface-variant/60 truncate">{user.email}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-on-surface-variant/40 hover:text-on-surface-variant hover:bg-surface-container-highest transition-colors">
                        <Icon name="x" className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex items-center gap-2 mt-4">
                    <RoleBadge role={user.role} size="md" />
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${
                        user.status === 'deactivated' ? 'bg-red-500/15 text-red-400' : 'bg-teal-500/15 text-teal-400'
                    }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'deactivated' ? 'bg-red-400' : 'bg-teal-400'}`} />
                        {user.status === 'deactivated' ? 'Disabled' : 'Active'}
                    </span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-page p-5 space-y-5">
                <div>
                    <p className="text-xs font-semibold text-on-surface-variant/50 uppercase tracking-wider mb-3">Personal details</p>
                    <div className="border border-outline-variant/20 rounded-lg divide-y divide-outline-variant/15">
                        <KV label="Full name" value={name} />
                        <KV label="Email" value={user.email || '—'} />
                        <KV label="Role" value={user.role} capitalize />
                        <KV label="Date added" value={fmtDate(user.created_at)} />
                        <KV label="Last active" value={getLastActive(user)} />
                        {user.timezone && <KV label="Timezone" value={user.timezone} />}
                    </div>
                </div>

                {canManageUsers && !isOwner && !isSelf && (
                    <div>
                        <p className="text-xs font-semibold text-on-surface-variant/50 uppercase tracking-wider mb-3">Change Role</p>
                        <div className="grid grid-cols-2 gap-2">
                            {(['admin', 'lead', 'analyst', 'viewer'] as Role[]).map(role => (
                                <button key={role} onClick={() => onRoleChange(user.id, role)} disabled={isChangingRole || user.role === role}
                                    className={`h-9 text-sm font-medium rounded-lg transition-all capitalize ${user.role === role ? 'bg-primary/15 text-primary ring-1 ring-primary/30' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-highest border border-outline-variant/20'} disabled:opacity-50`}>
                                    {role}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {canManageUsers && !isOwner && !isSelf && (
                    <div>
                        <p className="text-xs font-semibold text-on-surface-variant/50 uppercase tracking-wider mb-3">Account Status</p>
                        <div className="space-y-0 border border-outline-variant/20 rounded-lg divide-y divide-outline-variant/15">
                            <div className="flex items-center justify-between p-3">
                                <div>
                                    <p className="text-sm font-medium text-on-surface">User Account Status</p>
                                    <p className="text-xs text-on-surface-variant/50">Enable or disable user account</p>
                                </div>
                                <button
                                    onClick={() => user.status === 'deactivated' ? onReactivate(user.id) : onDeactivate(user.id, name)}
                                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${user.status === 'deactivated' ? 'bg-zinc-600' : 'bg-teal-500'}`}
                                >
                                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${user.status === 'deactivated' ? 'left-0.5' : 'left-[22px]'}`} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between p-3">
                                <div>
                                    <p className="text-sm font-medium text-on-surface">2FA Authentication</p>
                                    <p className="text-xs text-on-surface-variant/50">Two-factor authentication status</p>
                                </div>
                                <span className="text-xs font-medium text-on-surface-variant/40 bg-surface-container px-2 py-1 rounded">OFF</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {canManageUsers && !isOwner && !isSelf && (
                <div className="p-4 border-t border-outline-variant/20 space-y-2">
                    <button onClick={onSetPassword} className="w-full h-10 text-sm font-medium text-on-surface border border-outline-variant/30 hover:bg-surface-container-highest rounded-lg transition-colors flex items-center justify-center gap-2">
                        <Icon name="key" className="w-4 h-4" /> Set Password
                    </button>
                    <button onClick={onDelete} className="w-full h-10 text-sm font-medium text-red-400 border border-red-500/20 hover:bg-red-500/10 rounded-lg transition-colors flex items-center justify-center gap-2">
                        <Icon name="trash" className="w-4 h-4" /> Delete User
                    </button>
                </div>
            )}
        </div>
    );
};

const KV: React.FC<{ label: string; value: string; capitalize?: boolean }> = ({ label, value, capitalize }) => (
    <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm text-on-surface-variant/60">{label}</span>
        <span className={`text-sm text-on-surface ${capitalize ? 'capitalize' : ''}`}>{value}</span>
    </div>
);

// =============================================================================
// ROLE DROPDOWN
// =============================================================================

const RoleDropdown: React.FC<{ currentRole: Role; isLoading: boolean; onChange: (r: Role) => void }> = ({ currentRole, isLoading, onChange }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative inline-flex">
            <button onClick={e => { e.stopPropagation(); !isLoading && setOpen(!open); }} disabled={isLoading}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-surface-container-highest transition-colors disabled:opacity-50">
                {isLoading ? <Icon name="spinner" className="w-3.5 h-3.5 animate-spin" /> : <><RoleBadge role={currentRole} size="sm" /><Icon name="chevron-down" className="w-3.5 h-3.5 text-on-surface-variant/40" /></>}
            </button>
            {open && <>
                <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setOpen(false); }} />
                <div className="absolute right-0 top-full mt-1 z-50 w-40 py-1 bg-surface-container-highest rounded-xl border border-outline-variant/40 shadow-xl">
                    {(['admin', 'lead', 'analyst', 'viewer'] as Role[]).map(r => (
                        <button key={r} onClick={e => { e.stopPropagation(); onChange(r); setOpen(false); }}
                            className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors ${r === currentRole ? 'bg-primary/10' : 'hover:bg-surface-container-high'}`}>
                            <RoleBadge role={r} size="sm" />{r === currentRole && <Icon name="check" className="w-3.5 h-3.5 text-primary" />}
                        </button>
                    ))}
                </div>
            </>}
        </div>
    );
};

// =============================================================================
// INVITATIONS TABLE
// =============================================================================

const InvitationsTable: React.FC<{
    invitations: UserInvitation[]; isLoading: boolean;
    onCancel: (id: string, email: string) => void; onResend: (inv: UserInvitation) => void;
    fmtDate: (d: string | null | undefined) => string; fmtDateTime: (d: string | null | undefined) => string;
    isExpired: (d: string) => boolean;
}> = ({ invitations, isLoading, onCancel, onResend, fmtDate, fmtDateTime, isExpired }) => {
    const { showToast } = useToast();

    if (isLoading) return <div className="flex items-center justify-center py-24"><Icon name="spinner" className="w-8 h-8 animate-spin text-primary/40" /></div>;
    if (invitations.length === 0) return (
        <div className="flex flex-col items-center justify-center py-24 text-center border border-outline-variant/40 rounded-xl">
            <Icon name="mail" className="w-12 h-12 text-on-surface-variant/20 mb-3" />
            <p className="text-on-surface-variant/60">No pending invitations</p>
            <p className="text-xs text-on-surface-variant/40 mt-1">All invitations have been accepted</p>
        </div>
    );

    const copyLink = (inv: UserInvitation) => {
        if (inv.token) { navigator.clipboard.writeText(`${window.location.origin}/invite/${inv.token}`); showToast('success', 'Link Copied', 'Invitation link copied to clipboard'); }
    };

    return (
        <div className="border border-outline-variant/40 rounded-xl overflow-hidden">
            <table className="w-full">
                <thead>
                    <tr className="border-b border-zinc-700/60 bg-surface-container-high">
                        <th className="px-4 py-3.5 text-left text-xs font-medium text-on-surface-variant">Email</th>
                        <th className="px-4 py-3.5 text-left text-xs font-medium text-on-surface-variant w-[100px]">Role</th>
                        <th className="px-4 py-3.5 text-left text-xs font-medium text-on-surface-variant w-[100px]">Status</th>
                        <th className="px-4 py-3.5 text-left text-xs font-medium text-on-surface-variant w-[130px]">Sent</th>
                        <th className="px-4 py-3.5 text-left text-xs font-medium text-on-surface-variant w-[150px]">Expires</th>
                        <th className="px-4 py-3.5 text-center text-xs font-medium text-on-surface-variant w-[140px]">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {invitations.map(inv => {
                        const exp = inv.expires_at ? isExpired(inv.expires_at) : false;
                        return (
                            <tr key={inv.id} className={`border-b border-outline-variant/20 ${exp ? 'opacity-50' : ''}`}>
                                <td className="px-4 py-3"><span className="text-sm font-medium text-on-surface">{inv.email}</span></td>
                                <td className="px-4 py-3"><RoleBadge role={inv.role} size="md" /></td>
                                <td className="px-4 py-3"><span className={`text-sm font-medium ${exp ? 'text-red-400' : 'text-amber-400'}`}>{exp ? 'Expired' : 'Pending'}</span></td>
                                <td className="px-4 py-3"><span className="text-sm text-on-surface-variant/60">{fmtDate(inv.created_at)}</span></td>
                                <td className="px-4 py-3"><span className={`text-sm ${exp ? 'text-red-400' : 'text-on-surface-variant/60'}`}>{fmtDateTime(inv.expires_at)}</span></td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center justify-center gap-1">
                                        {!exp && inv.token && <button onClick={() => copyLink(inv)} className="p-1.5 rounded-lg text-on-surface-variant/40 hover:text-on-surface-variant hover:bg-surface-container-highest transition-colors" title="Copy Link"><Icon name="copy" className="w-4 h-4" /></button>}
                                        <button onClick={() => onResend(inv)} className="p-1.5 rounded-lg text-on-surface-variant/40 hover:text-primary hover:bg-primary/10 transition-colors" title="Resend"><Icon name="refresh-cw" className="w-4 h-4" /></button>
                                        <button onClick={() => onCancel(inv.id, inv.email)} className="p-1.5 rounded-lg text-on-surface-variant/40 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Cancel"><Icon name="trash" className="w-4 h-4" /></button>
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

export default UserManagementPage;
