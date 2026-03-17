import React, { useState } from 'react';
import { Icon } from '../Icon';
import { TeamMember, Role } from '../../types';
import { RoleBadge } from './RoleBadge';
import { PERMISSION_CATEGORIES, ROLE_DEFAULT_PERMISSIONS, GranularPermission } from '../../types';

interface UserProfilePanelProps {
    member: TeamMember;
    onClose: () => void;
    onRoleChange: (userId: string, role: Role) => void;
    onDeactivate: (userId: string, name: string) => void;
    onDelete: (userId: string) => void;
    isChangingRole?: boolean;
}

/**
 * User Profile Panel - displays detailed user info and permissions
 * Slides in from the right side
 */
export const UserProfilePanel: React.FC<UserProfilePanelProps> = ({
    member,
    onClose,
    onRoleChange,
    onDeactivate,
    onDelete,
    isChangingRole = false,
}) => {
    const [activeSection, setActiveSection] = useState<'overview' | 'permissions' | 'activity'>('overview');

    const displayName = member.user?.full_name || member.user?.email?.split('@')[0] || 'Unknown';
    const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const userRole = member.user?.role || 'viewer';
    const isOwner = userRole === 'owner';
    
    // Get permissions for current role (from profiles.role)
    const rolePermissions = new Set(ROLE_DEFAULT_PERMISSIONS[userRole] || []);

    const formatDate = (dateString: string): string => {
        return new Date(dateString).toLocaleDateString(undefined, {
            month: 'long', day: 'numeric', year: 'numeric'
        });
    };

    return (
        <div className="w-96 flex-shrink-0 bg-surface-container rounded-2xl border border-outline-variant/10 flex flex-col overflow-hidden animate-slide-in-right">
            {/* Header */}
            <div className="flex-shrink-0 p-5 border-b border-outline-variant/10">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-tertiary/10 text-tertiary flex items-center justify-center text-lg font-semibold">
                            {member.user?.avatar_url ? (
                                <img src={member.user.avatar_url} alt="" className="w-full h-full rounded-2xl object-cover" />
                            ) : (
                                initials
                            )}
                        </div>
                        <div>
                            <h3 className="font-semibold text-on-surface">{displayName}</h3>
                            <p className="text-sm text-on-surface-variant/60">{member.user?.email}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-on-surface-variant/40 hover:text-on-surface-variant hover:bg-surface-container-highest transition-colors"
                    >
                        <Icon name="x" className="w-5 h-5" />
                    </button>
                </div>

                {/* Role Badge */}
                <div className="flex items-center gap-2 mt-4">
                    <RoleBadge role={userRole} size="md" />
                    {member.user?.status === 'active' && (
                        <span className="flex items-center gap-1.5 text-xs text-emerald-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Active
                        </span>
                    )}
                </div>
            </div>

            {/* Section Tabs */}
            <div className="flex-shrink-0 flex items-center gap-1 p-2 border-b border-outline-variant/10">
                {(['overview', 'permissions', 'activity'] as const).map((section) => (
                    <button
                        key={section}
                        onClick={() => setActiveSection(section)}
                        className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors capitalize ${
                            activeSection === section
                                ? 'bg-surface-container-highest text-on-surface'
                                : 'text-on-surface-variant/60 hover:text-on-surface-variant'
                        }`}
                    >
                        {section}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto team-scroll p-5">
                {activeSection === 'overview' && (
                    <OverviewSection
                        member={member}
                        displayName={displayName}
                        formatDate={formatDate}
                    />
                )}

                {activeSection === 'permissions' && (
                    <PermissionsSection
                        role={userRole}
                        permissions={rolePermissions}
                    />
                )}

                {activeSection === 'activity' && (
                    <ActivitySection member={member} />
                )}
            </div>

            {/* Footer Actions */}
            {!isOwner && (
                <div className="flex-shrink-0 p-4 border-t border-outline-variant/10 flex items-center gap-2">
                    <button
                        onClick={() => onDeactivate(member.user_id, displayName)}
                        className="flex-1 px-4 py-2.5 text-sm font-medium text-on-surface-variant bg-surface-container-highest hover:bg-surface-container-high rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                        <Icon name="user-minus" className="w-4 h-4" />
                        Remove
                    </button>
                    <button
                        onClick={() => onDelete(member.user_id)}
                        className="px-4 py-2.5 text-sm font-medium text-error bg-error/10 hover:bg-error/20 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                        <Icon name="trash" className="w-4 h-4" />
                    </button>
                </div>
            )}

            <style>{`
                @keyframes slide-in-right {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                .animate-slide-in-right {
                    animation: slide-in-right 0.2s ease-out;
                }
            `}</style>
        </div>
    );
};

// =============================================================================
// OVERVIEW SECTION
// =============================================================================

interface OverviewSectionProps {
    member: TeamMember;
    displayName: string;
    formatDate: (date: string) => string;
}

const OverviewSection: React.FC<OverviewSectionProps> = ({ member, displayName, formatDate }) => {
    return (
        <div className="space-y-6">
            {/* Details */}
            <div className="space-y-4">
                <h4 className="text-xs font-semibold text-on-surface-variant/50 uppercase tracking-wider">Details</h4>
                
                <div className="space-y-3">
                    <InfoRow icon="mail" label="Email" value={member.user?.email || 'N/A'} />
                    <InfoRow icon="user" label="Display Name" value={displayName} />
                    <InfoRow icon="calendar" label="Joined" value={formatDate(member.joined_at || member.created_at)} />
                    {member.user?.last_active_at && (
                        <InfoRow icon="clock" label="Last Active" value={formatDate(member.user.last_active_at)} />
                    )}
                    {member.user?.timezone && (
                        <InfoRow icon="globe" label="Timezone" value={member.user.timezone} />
                    )}
                </div>
            </div>

            {/* Quick Stats */}
            <div className="space-y-4">
                <h4 className="text-xs font-semibold text-on-surface-variant/50 uppercase tracking-wider">Quick Stats</h4>
                
                <div className="grid grid-cols-2 gap-3">
                    <StatCard icon="file-text" label="Detections" value="--" />
                    <StatCard icon="check-circle" label="Reviews" value="--" />
                    <StatCard icon="message-square" label="Comments" value="--" />
                    <StatCard icon="clock" label="This Week" value="--" />
                </div>
            </div>
        </div>
    );
};

// =============================================================================
// PERMISSIONS SECTION
// =============================================================================

interface PermissionsSectionProps {
    role: Role;
    permissions: Set<GranularPermission>;
}

const PermissionsSection: React.FC<PermissionsSectionProps> = ({ role, permissions }) => {
    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-on-surface-variant/50 uppercase tracking-wider">
                    Permissions for {role}
                </h4>
                <span className="text-xs text-on-surface-variant/40">
                    {permissions.size} enabled
                </span>
            </div>

            {PERMISSION_CATEGORIES.map((category) => {
                const categoryPerms = category.permissions.filter(p => permissions.has(p.key));
                const hasAny = categoryPerms.length > 0;
                
                return (
                    <div key={category.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-on-surface">{category.label}</span>
                            <span className="text-xs text-on-surface-variant/40">
                                {categoryPerms.length}/{category.permissions.length}
                            </span>
                        </div>
                        
                        <div className="space-y-1">
                            {category.permissions.map((perm) => {
                                const hasPermission = permissions.has(perm.key);
                                return (
                                    <div
                                        key={perm.key}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                                            hasPermission
                                                ? 'bg-emerald-500/10 text-on-surface'
                                                : 'bg-surface-container-highest/50 text-on-surface-variant/40'
                                        }`}
                                    >
                                        <Icon
                                            name={hasPermission ? 'check' : 'x'}
                                            className={`w-3.5 h-3.5 ${hasPermission ? 'text-emerald-500' : 'text-on-surface-variant/30'}`}
                                        />
                                        <span className="flex-1">{perm.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// =============================================================================
// ACTIVITY SECTION
// =============================================================================

interface ActivitySectionProps {
    member: TeamMember;
}

const ActivitySection: React.FC<ActivitySectionProps> = ({ member }) => {
    // Placeholder - would fetch from activity_log table
    return (
        <div className="space-y-4">
            <h4 className="text-xs font-semibold text-on-surface-variant/50 uppercase tracking-wider">Recent Activity</h4>
            
            <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-12 h-12 rounded-xl bg-surface-container-highest flex items-center justify-center mb-3">
                    <Icon name="activity" className="w-6 h-6 text-on-surface-variant/30" />
                </div>
                <p className="text-sm text-on-surface-variant/50">Activity tracking</p>
                <p className="text-xs text-on-surface-variant/40 mt-1">Coming soon</p>
            </div>
        </div>
    );
};

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

interface InfoRowProps {
    icon: string;
    label: string;
    value: string;
}

const InfoRow: React.FC<InfoRowProps> = ({ icon, label, value }) => (
    <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center flex-shrink-0">
            <Icon name={icon} className="w-4 h-4 text-on-surface-variant/50" />
        </div>
        <div className="flex-1 min-w-0">
            <p className="text-xs text-on-surface-variant/50">{label}</p>
            <p className="text-sm text-on-surface truncate">{value}</p>
        </div>
    </div>
);

interface StatCardProps {
    icon: string;
    label: string;
    value: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value }) => (
    <div className="p-3 rounded-xl bg-surface-container-highest">
        <div className="flex items-center gap-2 mb-1">
            <Icon name={icon} className="w-4 h-4 text-on-surface-variant/50" />
            <span className="text-xs text-on-surface-variant/50">{label}</span>
        </div>
        <p className="text-lg font-semibold text-on-surface">{value}</p>
    </div>
);

export default UserProfilePanel;
