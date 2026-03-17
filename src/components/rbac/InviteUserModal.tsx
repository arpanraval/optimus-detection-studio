import React, { useState, useMemo } from 'react';
import { Icon } from '../Icon';
import { Role } from '../../types';
import { 
    PERMISSION_CATEGORIES, 
    ROLE_DEFAULT_PERMISSIONS, 
    GranularPermission 
} from '../../types';

interface InviteUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onInvite: (email: string, role: Role, customPermissions?: GranularPermission[]) => Promise<void>;
    isInviting?: boolean;
}

const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
    { value: 'admin', label: 'Admin', description: 'Full access, manages users' },
    { value: 'lead', label: 'Lead', description: 'Assigns and reviews work' },
    { value: 'analyst', label: 'Analyst', description: 'Creates and edits detections' },
    { value: 'viewer', label: 'Viewer', description: 'Read-only access' },
];

/**
 * Enhanced Invite Modal with granular permission controls
 */
export const InviteUserModal: React.FC<InviteUserModalProps> = ({
    isOpen,
    onClose,
    onInvite,
    isInviting = false,
}) => {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<Role>('analyst');
    const [showPermissions, setShowPermissions] = useState(false);
    const [customOverrides, setCustomOverrides] = useState<{
        granted: GranularPermission[];
        revoked: GranularPermission[];
    }>({ granted: [], revoked: [] });
    const [error, setError] = useState<string | null>(null);

    // Calculate effective permissions
    const effectivePermissions = useMemo(() => {
        const rolePerms = new Set<GranularPermission>(ROLE_DEFAULT_PERMISSIONS[role] || []);
        customOverrides.granted.forEach(p => rolePerms.add(p));
        customOverrides.revoked.forEach(p => rolePerms.delete(p));
        return rolePerms;
    }, [role, customOverrides]);

    // Check if user has customized permissions
    const hasCustomizations = customOverrides.granted.length > 0 || customOverrides.revoked.length > 0;

    const handleRoleChange = (newRole: Role) => {
        setRole(newRole);
        // Reset customizations when role changes
        setCustomOverrides({ granted: [], revoked: [] });
    };

    const togglePermission = (permission: GranularPermission) => {
        const roleDefault = ROLE_DEFAULT_PERMISSIONS[role]?.includes(permission) || false;
        const isCurrentlyGranted = effectivePermissions.has(permission);

        if (isCurrentlyGranted) {
            // Turning OFF
            if (roleDefault) {
                // Add to revoked
                setCustomOverrides(prev => ({
                    granted: prev.granted.filter(p => p !== permission),
                    revoked: [...prev.revoked, permission],
                }));
            } else {
                // Remove from granted
                setCustomOverrides(prev => ({
                    granted: prev.granted.filter(p => p !== permission),
                    revoked: prev.revoked,
                }));
            }
        } else {
            // Turning ON
            if (roleDefault) {
                // Remove from revoked
                setCustomOverrides(prev => ({
                    granted: prev.granted,
                    revoked: prev.revoked.filter(p => p !== permission),
                }));
            } else {
                // Add to granted
                setCustomOverrides(prev => ({
                    granted: [...prev.granted, permission],
                    revoked: prev.revoked.filter(p => p !== permission),
                }));
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!email || !email.includes('@')) {
            setError('Please enter a valid email address');
            return;
        }

        try {
            // For now, just pass role - custom permissions would be stored in DB
            await onInvite(email, role);
            resetForm();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to send invitation');
        }
    };

    const resetForm = () => {
        setEmail('');
        setRole('analyst');
        setShowPermissions(false);
        setCustomOverrides({ granted: [], revoked: [] });
        setError(null);
    };

    const handleClose = () => {
        if (!isInviting) {
            resetForm();
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className={`bg-surface-container rounded-2xl border border-outline-variant/10 w-full shadow-2xl transition-all duration-300 ${
                showPermissions ? 'max-w-3xl' : 'max-w-md'
            }`}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10">
                    <div>
                        <h3 className="text-lg font-semibold text-on-surface">Add User</h3>
                        <p className="text-sm text-on-surface-variant/60 mt-0.5">
                            Send an email invitation to add new user to application
                        </p>
                    </div>
                    <button
                        onClick={handleClose}
                        disabled={isInviting}
                        className="p-2 rounded-lg text-on-surface-variant/40 hover:text-on-surface-variant hover:bg-surface-container-highest transition-colors disabled:opacity-50"
                    >
                        <Icon name="x" className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className={`flex ${showPermissions ? 'divide-x divide-outline-variant/10' : ''}`}>
                        {/* Left Panel - Basic Info */}
                        <div className={`p-6 space-y-5 ${showPermissions ? 'w-1/2' : 'w-full'}`}>
                            {/* Error */}
                            {error && (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-error/10 border border-error/20">
                                    <Icon name="alert-circle" className="w-4 h-4 text-error flex-shrink-0" />
                                    <p className="text-sm text-error">{error}</p>
                                </div>
                            )}

                            {/* Email Input */}
                            <div>
                                <label className="block text-sm font-medium text-on-surface-variant mb-2">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="colleague@company.com"
                                    required
                                    disabled={isInviting}
                                    className="w-full px-4 py-2.5 bg-surface-container-highest border border-outline-variant/10 rounded-xl text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:border-tertiary/30 transition-colors disabled:opacity-50"
                                    autoFocus
                                />
                            </div>

                            {/* Role Selection */}
                            <div>
                                <label className="block text-sm font-medium text-on-surface-variant mb-2">
                                    Role
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {ROLE_OPTIONS.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => handleRoleChange(option.value)}
                                            disabled={isInviting}
                                            className={`p-3 rounded-xl text-left transition-all ${
                                                role === option.value
                                                    ? 'bg-tertiary/10 border-2 border-tertiary/30'
                                                    : 'bg-surface-container-highest border-2 border-transparent hover:border-outline-variant/20'
                                            } ${isInviting ? 'opacity-50' : ''}`}
                                        >
                                            <p className={`text-sm font-medium ${
                                                role === option.value ? 'text-tertiary' : 'text-on-surface'
                                            }`}>
                                                {option.label}
                                            </p>
                                            <p className="text-xs text-on-surface-variant/50 mt-0.5">
                                                {option.description}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Customize Permissions Toggle */}
                            <button
                                type="button"
                                onClick={() => setShowPermissions(!showPermissions)}
                                className="flex items-center gap-2 text-sm text-tertiary hover:text-tertiary/80 transition-colors"
                            >
                                <Icon name={showPermissions ? 'chevron-left' : 'shield'} className="w-4 h-4" />
                                {showPermissions ? 'Hide permissions' : 'Customize permissions'}
                                {hasCustomizations && (
                                    <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-tertiary/20">
                                        Modified
                                    </span>
                                )}
                            </button>
                        </div>

                        {/* Right Panel - Permissions */}
                        {showPermissions && (
                            <div className="w-1/2 p-6 max-h-[60vh] overflow-y-auto team-scroll">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-medium text-on-surface">Permissions</h4>
                                        <span className="text-xs text-on-surface-variant/50">
                                            {effectivePermissions.size} enabled
                                        </span>
                                    </div>

                                    {PERMISSION_CATEGORIES.map((category) => (
                                        <div key={category.id} className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-semibold text-on-surface-variant/60 uppercase tracking-wider">
                                                    {category.label}
                                                </span>
                                            </div>

                                            <div className="space-y-1">
                                                {category.permissions.map((perm) => {
                                                    const isEnabled = effectivePermissions.has(perm.key);
                                                    const isRoleDefault = ROLE_DEFAULT_PERMISSIONS[role]?.includes(perm.key);
                                                    const isModified = isEnabled !== isRoleDefault;

                                                    return (
                                                        <label
                                                            key={perm.key}
                                                            className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                                                                isEnabled
                                                                    ? 'bg-emerald-500/10 hover:bg-emerald-500/15'
                                                                    : 'bg-surface-container-highest/50 hover:bg-surface-container-highest'
                                                            }`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={isEnabled}
                                                                onChange={() => togglePermission(perm.key)}
                                                                className="w-4 h-4 rounded border-outline-variant/30 text-tertiary focus:ring-tertiary/30"
                                                            />
                                                            <div className="flex-1 min-w-0">
                                                                <span className={`text-sm ${isEnabled ? 'text-on-surface' : 'text-on-surface-variant/60'}`}>
                                                                    {perm.label}
                                                                </span>
                                                                {isModified && (
                                                                    <span className="ml-2 text-[10px] text-tertiary">
                                                                        (modified)
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant/10">
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={isInviting}
                            className="px-4 py-2.5 text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest rounded-xl transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isInviting || !email}
                            className="px-5 py-2.5 text-sm font-semibold bg-tertiary text-on-tertiary rounded-xl hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-tertiary/20"
                        >
                            {isInviting ? (
                                <>
                                    <Icon name="spinner" className="w-4 h-4 animate-spin" />
                                    Sending...
                                </>
                            ) : (
                                <>
                                    <Icon name="send" className="w-4 h-4" />
                                    Send Invitation
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            <style>{`
                .team-scroll::-webkit-scrollbar { width: 5px; }
                .team-scroll::-webkit-scrollbar-track { background: transparent; }
                .team-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
            `}</style>
        </div>
    );
};

export default InviteUserModal;