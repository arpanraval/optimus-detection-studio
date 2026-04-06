import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { MfaEnrollmentWizard } from './MfaEnrollmentWizard';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../hooks/useToast';
import { useBeforeUnload } from '../hooks/useBeforeUnload';
import { Profile } from '../types';

// =============================================================================
// STYLES
// =============================================================================

const customStyles = `
.settings-scroll::-webkit-scrollbar { width: 5px; height: 5px; }
.settings-scroll::-webkit-scrollbar-track { background: transparent; }
.settings-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
.settings-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
.settings-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent; }
[data-theme="light"] .settings-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); }
[data-theme="light"] .settings-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }
`;

// =============================================================================
// TYPES
// =============================================================================

type SettingsSection = 'profile' | 'security' | 'notifications' | 'sessions';

interface AccountSettingsPageProps {
    userId: string;
    userEmail: string;
    onBack?: () => void;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const AccountSettingsPage: React.FC<AccountSettingsPageProps> = ({
    userId,
    userEmail,
    onBack,
}) => {
    const [activeSection, setActiveSection] = useState<SettingsSection>('profile');
    const [profile, setProfile] = useState<Profile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Form states
    const [displayName, setDisplayName] = useState('');
    const [timezone, setTimezone] = useState('');

    // Password form states
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    // MFA state
    const [mfaFactors, setMfaFactors] = useState<Array<{ id: string; status: string; friendly_name?: string; created_at?: string }>>([]);
    const [mfaLoading, setMfaLoading] = useState(false);
    const [showMfaWizard, setShowMfaWizard] = useState(false);
    const [showMfaDisableConfirm, setShowMfaDisableConfirm] = useState(false);
    const [mfaDisabling, setMfaDisabling] = useState(false);

    const { showToast } = useToast();

    // Dirty tracking: profile changed or password fields filled
    const hasUnsavedChanges = (
        (profile !== null && (
            displayName !== (profile.full_name || '') ||
            timezone !== (profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)
        )) ||
        currentPassword.length > 0 ||
        newPassword.length > 0 ||
        confirmPassword.length > 0
    );

    useBeforeUnload(hasUnsavedChanges);

    // Inject styles
    useEffect(() => {
        const styleId = 'account-settings-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = customStyles;
            document.head.appendChild(style);
        }
    }, []);

    // Fetch profile
    useEffect(() => {
        const fetchProfile = async () => {
            setIsLoading(true);
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .single();

                if (error) throw error;

                setProfile(data);
                setDisplayName(data.full_name || '');
                setTimezone(data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
            } catch (err: unknown) {
                showToast('error', 'Error', 'Failed to load profile');
            } finally {
                setIsLoading(false);
            }
        };

        fetchProfile();
    }, [userId]);

    // ==========================================================================
    // HANDLERS
    // ==========================================================================

    const handleSaveProfile = async () => {
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: displayName.trim() || null,
                    timezone: timezone,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', userId);

            if (error) throw error;

            showToast('success', 'Saved', 'Profile updated successfully');
            setProfile(prev => prev ? { ...prev, full_name: displayName, timezone } : null);
        } catch (err: unknown) {
            showToast('error', 'Error', err instanceof Error ? err.message : 'Failed to save profile');
        } finally {
            setIsSaving(false);
        }
    };

    const handleChangePassword = async () => {
        if (newPassword !== confirmPassword) {
            showToast('error', 'Error', 'Passwords do not match');
            return;
        }

        if (newPassword.length < 12) {
            showToast('error', 'Error', 'Password must be at least 12 characters.');
            return;
        }
        if (!/[A-Z]/.test(newPassword)) {
            showToast('error', 'Error', 'Must contain at least one uppercase letter.');
            return;
        }
        if (!/[a-z]/.test(newPassword)) {
            showToast('error', 'Error', 'Must contain at least one lowercase letter.');
            return;
        }
        if (!/[0-9]/.test(newPassword)) {
            showToast('error', 'Error', 'Must contain at least one number.');
            return;
        }

        if (!currentPassword) {
            showToast('error', 'Error', 'Current password is required.');
            return;
        }

        setIsChangingPassword(true);
        try {
            // Verify current password first
            const { error: verifyError } = await supabase.auth.signInWithPassword({
                email: profile?.email || userEmail,
                password: currentPassword,
            });

            if (verifyError) {
                showToast('error', 'Error', 'Current password is incorrect.');
                return;
            }

            const { error } = await supabase.auth.updateUser({
                password: newPassword,
            });

            if (error) throw error;

            showToast('success', 'Success', 'Password changed successfully');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: unknown) {
            showToast('error', 'Error', err instanceof Error ? err.message : 'Failed to change password');
        } finally {
            setIsChangingPassword(false);
        }
    };

    // ==========================================================================
    // MFA
    // ==========================================================================

    const fetchMfaFactors = async () => {
        setMfaLoading(true);
        try {
            const { data } = await supabase.auth.mfa.listFactors();
            setMfaFactors(data?.totp?.filter(f => f.status === 'verified') || []);
        } catch { /* silent */ } finally { setMfaLoading(false); }
    };

    useEffect(() => {
        if (activeSection === 'security') fetchMfaFactors();
    }, [activeSection]);

    const handleDisableMfa = async () => {
        if (!mfaFactors[0]) return;
        setMfaDisabling(true);
        try {
            const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaFactors[0].id });
            if (error) throw error;
            showToast('success', 'Disabled', 'Two-factor authentication has been disabled');
            await fetchMfaFactors();
        } catch (err: unknown) {
            showToast('error', 'Error', err instanceof Error ? err.message : 'Failed to disable MFA');
        } finally { setMfaDisabling(false); setShowMfaDisableConfirm(false); }
    };

    // ==========================================================================
    // NAVIGATION
    // ==========================================================================

    const navItems: { id: SettingsSection; label: string; icon: string }[] = [
        { id: 'profile', label: 'Profile', icon: 'user' },
        { id: 'security', label: 'Security', icon: 'shield-check' },
        { id: 'notifications', label: 'Notifications', icon: 'bell' },
        { id: 'sessions', label: 'Sessions', icon: 'monitor' },
    ];

    // ==========================================================================
    // RENDER
    // ==========================================================================

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Header */}
            <div className="flex-shrink-0 px-6 lg:px-8 py-5 border-b border-outline-variant/10">
                <div className="max-w-5xl mx-auto flex items-center gap-4">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="p-2 rounded-lg text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                        >
                            <Icon name="arrow-left" className="w-5 h-5" />
                        </button>
                    )}
                    <div>
                        <h1 className="text-xl font-semibold text-on-surface">Account Settings</h1>
                        <p className="text-sm text-on-surface-variant/60 mt-0.5">{userEmail}</p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
                <div className="h-full max-w-5xl mx-auto px-6 lg:px-8 py-6 flex gap-6">
                    {/* Sidebar Navigation */}
                    <nav className="w-56 flex-shrink-0">
                        <div className="space-y-1">
                            {navItems.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveSection(item.id)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                                        activeSection === item.id
                                            ? 'bg-tertiary/10 text-tertiary'
                                            : 'text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container-highest'
                                    }`}
                                >
                                    <Icon name={item.icon} className="w-5 h-5" />
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </nav>

                    {/* Main Content */}
                    <div className="flex-1 overflow-y-auto settings-scroll">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-16">
                                <Icon name="spinner" className="w-8 h-8 animate-spin text-tertiary/50" />
                            </div>
                        ) : (
                            <>
                                {activeSection === 'profile' && (
                                    <ProfileSection
                                        displayName={displayName}
                                        setDisplayName={setDisplayName}
                                        timezone={timezone}
                                        setTimezone={setTimezone}
                                        userEmail={userEmail}
                                        isSaving={isSaving}
                                        onSave={handleSaveProfile}
                                    />
                                )}

                                {activeSection === 'security' && (
                                    <SecuritySection
                                        currentPassword={currentPassword}
                                        setCurrentPassword={setCurrentPassword}
                                        newPassword={newPassword}
                                        setNewPassword={setNewPassword}
                                        confirmPassword={confirmPassword}
                                        setConfirmPassword={setConfirmPassword}
                                        isChangingPassword={isChangingPassword}
                                        onChangePassword={handleChangePassword}
                                        mfaFactors={mfaFactors}
                                        mfaLoading={mfaLoading}
                                        onEnableMfa={() => setShowMfaWizard(true)}
                                        onDisableMfa={() => setShowMfaDisableConfirm(true)}
                                    />
                                )}

                                {activeSection === 'notifications' && (
                                    <NotificationsSection />
                                )}

                                {activeSection === 'sessions' && (
                                    <SessionsSection userEmail={userEmail} />
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* MFA Enrollment Wizard */}
            <MfaEnrollmentWizard
                isOpen={showMfaWizard}
                onClose={() => setShowMfaWizard(false)}
                onEnrolled={() => {
                    fetchMfaFactors();
                    showToast('success', 'Enabled', 'Two-factor authentication is now active');
                }}
            />

            {/* MFA Disable Confirmation */}
            {showMfaDisableConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6 max-w-sm w-full mx-4 shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center">
                                <Icon name="shield-off" className="w-5 h-5 text-error" />
                            </div>
                            <h3 className="text-base font-semibold text-on-surface">Disable Two-Factor?</h3>
                        </div>
                        <p className="text-sm text-on-surface-variant/70 mb-6">
                            This will remove the authenticator app from your account. Your account will only be protected by your password.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowMfaDisableConfirm(false)}
                                className="px-4 py-2 text-sm font-medium text-on-surface-variant rounded-xl hover:bg-surface-container-highest transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDisableMfa}
                                disabled={mfaDisabling}
                                className="px-4 py-2 text-sm font-medium text-white bg-error rounded-xl hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
                            >
                                {mfaDisabling ? (
                                    <>
                                        <Icon name="spinner" className="w-4 h-4 animate-spin" />
                                        Disabling...
                                    </>
                                ) : (
                                    'Disable'
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
// PROFILE SECTION
// =============================================================================

interface ProfileSectionProps {
    displayName: string;
    setDisplayName: (v: string) => void;
    timezone: string;
    setTimezone: (v: string) => void;
    userEmail: string;
    isSaving: boolean;
    onSave: () => void;
}

const ProfileSection: React.FC<ProfileSectionProps> = ({
    displayName,
    setDisplayName,
    timezone,
    setTimezone,
    userEmail,
    isSaving,
    onSave,
}) => {
    const commonTimezones = [
        'America/New_York',
        'America/Chicago',
        'America/Denver',
        'America/Los_Angeles',
        'America/Sao_Paulo',
        'Europe/London',
        'Europe/Paris',
        'Europe/Berlin',
        'Asia/Dubai',
        'Asia/Kolkata',
        'Asia/Singapore',
        'Asia/Tokyo',
        'Asia/Shanghai',
        'Australia/Sydney',
        'Pacific/Auckland',
    ];

    return (
        <div className="space-y-8">
            {/* Section Header */}
            <div>
                <h2 className="text-lg font-semibold text-on-surface">Profile Information</h2>
                <p className="text-sm text-on-surface-variant/60 mt-1">
                    Update your personal information and preferences
                </p>
            </div>

            {/* Avatar */}
            <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-2xl bg-tertiary/10 text-tertiary flex items-center justify-center text-2xl font-semibold">
                    {displayName ? displayName.charAt(0).toUpperCase() : userEmail.charAt(0).toUpperCase()}
                </div>
                <div>
                    <p className="text-sm font-medium text-on-surface">Profile Photo</p>
                    <p className="text-xs text-on-surface-variant/50 mt-1">Avatar upload coming soon</p>
                </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Display Name */}
                <div>
                    <label className="block text-sm font-medium text-on-surface-variant mb-2">
                        Display Name
                    </label>
                    <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Enter your name"
                        className="w-full px-4 py-3 bg-surface-container border border-outline-variant/10 rounded-xl text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:border-tertiary/30 transition-colors"
                    />
                </div>

                {/* Email (read-only) */}
                <div>
                    <label className="block text-sm font-medium text-on-surface-variant mb-2">
                        Email Address
                    </label>
                    <input
                        type="email"
                        value={userEmail}
                        disabled
                        className="w-full px-4 py-3 bg-surface-container-highest border border-outline-variant/10 rounded-xl text-on-surface-variant/50 cursor-not-allowed"
                    />
                    <p className="text-xs text-on-surface-variant/40 mt-1">Email cannot be changed</p>
                </div>

                {/* Timezone */}
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-on-surface-variant mb-2">
                        Timezone
                    </label>
                    <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="w-full px-4 py-3 bg-surface-container border border-outline-variant/10 rounded-xl text-on-surface focus:outline-none focus:border-tertiary/30 transition-colors appearance-none cursor-pointer"
                    >
                        {commonTimezones.map((tz) => (
                            <option key={tz} value={tz}>
                                {tz.replace(/_/g, ' ')}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-4 border-t border-outline-variant/10">
                <button
                    onClick={onSave}
                    disabled={isSaving}
                    className="px-6 py-2.5 bg-tertiary text-on-tertiary font-medium rounded-xl hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                    {isSaving ? (
                        <>
                            <Icon name="spinner" className="w-4 h-4 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        'Save Changes'
                    )}
                </button>
            </div>
        </div>
    );
};

// =============================================================================
// SECURITY SECTION
// =============================================================================

interface SecuritySectionProps {
    currentPassword: string;
    setCurrentPassword: (v: string) => void;
    newPassword: string;
    setNewPassword: (v: string) => void;
    confirmPassword: string;
    setConfirmPassword: (v: string) => void;
    isChangingPassword: boolean;
    onChangePassword: () => void;
    mfaFactors: Array<{ id: string; status: string; friendly_name?: string; created_at?: string }>;
    mfaLoading: boolean;
    onEnableMfa: () => void;
    onDisableMfa: () => void;
}

const REQUIREMENTS = [
    { test: (p: string) => p.length >= 12, label: '12+ characters' },
    { test: (p: string) => /[A-Z]/.test(p), label: 'Uppercase' },
    { test: (p: string) => /[a-z]/.test(p), label: 'Lowercase' },
    { test: (p: string) => /[0-9]/.test(p), label: 'Number' },
];

const SecuritySection: React.FC<SecuritySectionProps> = ({
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    isChangingPassword,
    onChangePassword,
    mfaFactors,
    mfaLoading,
    onEnableMfa,
    onDisableMfa,
}) => {
    const [showPasswords, setShowPasswords] = useState(false);
    const hasMfa = mfaFactors.length > 0;

    return (
        <div className="space-y-8">
            {/* Section Header */}
            <div>
                <h2 className="text-lg font-semibold text-on-surface">Security</h2>
                <p className="text-sm text-on-surface-variant/60 mt-1">
                    Manage your password and security settings
                </p>
            </div>

            {/* Security Status Banner */}
            <div
                className="rounded-2xl border border-outline-variant/10 p-5"
                style={{ background: 'linear-gradient(135deg, rgba(120,50,100,0.08), rgba(0,80,145,0.05))' }}
            >
                <div className="flex items-center gap-4">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${hasMfa ? 'bg-emerald-500/15' : 'bg-amber-500/15'}`}>
                        <Icon name="shield-check" className={`w-6 h-6 ${hasMfa ? 'text-emerald-500' : 'text-amber-500'}`} />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-semibold text-on-surface">
                            Protection: {hasMfa ? 'Enhanced' : 'Standard'}
                        </p>
                        <p className="text-xs text-on-surface-variant/60 mt-0.5">
                            {hasMfa
                                ? 'Password and two-factor authentication active'
                                : 'Enable 2FA for enhanced protection'}
                        </p>
                    </div>
                    {/* Two-segment bar indicator */}
                    <div className="flex gap-1.5">
                        <div className="w-10 h-2 rounded-full bg-emerald-500" />
                        <div className={`w-10 h-2 rounded-full ${hasMfa ? 'bg-emerald-500' : 'bg-surface-container-highest'}`} />
                    </div>
                </div>
            </div>

            {/* Password Card */}
            <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
                <h3 className="text-base font-medium text-on-surface mb-4">Change Password</h3>

                <div className="space-y-4 max-w-md">
                    {/* Current Password */}
                    <div>
                        <label className="block text-sm font-medium text-on-surface-variant mb-2">
                            Current Password
                        </label>
                        <input
                            type={showPasswords ? 'text' : 'password'}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="Enter current password"
                            className="w-full px-4 py-3 bg-surface-container-highest border border-outline-variant/10 rounded-xl text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:border-tertiary/30 transition-colors"
                        />
                    </div>

                    {/* New Password */}
                    <div>
                        <label className="block text-sm font-medium text-on-surface-variant mb-2">
                            New Password
                        </label>
                        <input
                            type={showPasswords ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Enter new password"
                            className="w-full px-4 py-3 bg-surface-container-highest border border-outline-variant/10 rounded-xl text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:border-tertiary/30 transition-colors"
                        />

                        {/* Requirements checklist */}
                        {newPassword.length > 0 && (
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                                {REQUIREMENTS.map((req) => {
                                    const met = req.test(newPassword);
                                    return (
                                        <span key={req.label} className={`text-xs flex items-center gap-1 ${met ? 'text-emerald-500' : 'text-on-surface-variant/40'}`}>
                                            <Icon name={met ? 'check-circle' : 'circle'} className="w-3.5 h-3.5" />
                                            {req.label}
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Confirm Password */}
                    <div>
                        <label className="block text-sm font-medium text-on-surface-variant mb-2">
                            Confirm New Password
                        </label>
                        <input
                            type={showPasswords ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Confirm new password"
                            className="w-full px-4 py-3 bg-surface-container-highest border border-outline-variant/10 rounded-xl text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:border-tertiary/30 transition-colors"
                        />
                    </div>

                    {/* Show Password Toggle */}
                    <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showPasswords}
                            onChange={(e) => setShowPasswords(e.target.checked)}
                            className="w-4 h-4 rounded border-outline-variant/30"
                        />
                        Show passwords
                    </label>

                    {/* Change Button */}
                    <button
                        onClick={onChangePassword}
                        disabled={isChangingPassword || !newPassword || !confirmPassword}
                        className="px-6 py-2.5 text-white font-medium rounded-xl hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
                        style={{ backgroundColor: '#783264' }}
                    >
                        {isChangingPassword ? (
                            <>
                                <Icon name="spinner" className="w-4 h-4 animate-spin" />
                                Changing...
                            </>
                        ) : (
                            'Change Password'
                        )}
                    </button>
                </div>
            </div>

            {/* MFA Card */}
            <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-medium text-on-surface">Two-Factor Authentication</h3>
                    {mfaLoading ? (
                        <Icon name="spinner" className="w-4 h-4 animate-spin text-on-surface-variant/40" />
                    ) : (
                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                            hasMfa
                                ? 'bg-emerald-500/10 text-emerald-500'
                                : 'bg-on-surface-variant/5 text-on-surface-variant/50'
                        }`}>
                            {hasMfa ? 'Enabled' : 'Not enabled'}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-4 p-4 rounded-xl bg-surface-container-highest/50 border border-outline-variant/10">
                    <div className="w-10 h-10 rounded-xl bg-tertiary/10 flex items-center justify-center flex-shrink-0">
                        <Icon name="shield-check" className="w-5 h-5 text-tertiary" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-on-surface">Authenticator App</p>
                        <p className="text-xs text-on-surface-variant/50 mt-0.5">
                            {hasMfa && mfaFactors[0].created_at
                                ? `Enrolled ${new Date(mfaFactors[0].created_at).toLocaleDateString()}`
                                : 'Google Authenticator, Authy, 1Password'}
                        </p>
                    </div>
                    <button
                        onClick={hasMfa ? onDisableMfa : onEnableMfa}
                        className={`px-4 py-2 text-sm font-medium rounded-xl transition-all flex-shrink-0 ${
                            hasMfa
                                ? 'text-error bg-error/10 hover:bg-error/15'
                                : 'text-white hover:brightness-110'
                        }`}
                        style={hasMfa ? undefined : { backgroundColor: '#783264' }}
                    >
                        {hasMfa ? 'Disable' : 'Enable'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// =============================================================================
// NOTIFICATIONS SECTION
// =============================================================================

const NotificationsSection: React.FC = () => {
    return (
        <div className="space-y-8">
            {/* Section Header */}
            <div>
                <h2 className="text-lg font-semibold text-on-surface">Notifications</h2>
                <p className="text-sm text-on-surface-variant/60 mt-1">
                    Choose what notifications you want to receive
                </p>
            </div>

            {/* In-App Notifications Info */}
            <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
                <div className="flex items-start gap-3">
                    <Icon name="bell" className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                        <h3 className="text-base font-medium text-on-surface">In-App Notifications</h3>
                        <p className="text-sm text-on-surface-variant mt-1">
                            You receive real-time notifications for review requests, assignments, status changes, and promotion decisions.
                            View all notifications from the bell icon in the header.
                        </p>
                        <p className="text-xs text-on-surface-variant/60 mt-3">
                            Email notifications coming in a future update.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// =============================================================================
// SESSIONS SECTION
// =============================================================================

interface SessionsSectionProps {
    userEmail: string;
}

const SessionsSection: React.FC<SessionsSectionProps> = ({ userEmail }) => {
    return (
        <div className="space-y-8">
            {/* Section Header */}
            <div>
                <h2 className="text-lg font-semibold text-on-surface">Active Sessions</h2>
                <p className="text-sm text-on-surface-variant/60 mt-1">
                    Manage your active sessions across devices
                </p>
            </div>

            {/* Current Session */}
            <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
                <h3 className="text-base font-medium text-on-surface mb-4">Current Session</h3>

                <div className="flex items-center gap-4 p-4 rounded-xl bg-surface-container-highest">
                    <div className="w-12 h-12 rounded-xl bg-tertiary/10 flex items-center justify-center">
                        <Icon name="monitor" className="w-6 h-6 text-tertiary" />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-medium text-on-surface">This Device</p>
                        <p className="text-xs text-on-surface-variant/60 mt-0.5">
                            {navigator.userAgent.includes('Chrome') ? 'Chrome' :
                             navigator.userAgent.includes('Firefox') ? 'Firefox' :
                             navigator.userAgent.includes('Safari') ? 'Safari' : 'Browser'}
                            {' · '}
                            {navigator.platform}
                        </p>
                    </div>
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-500">
                        Active Now
                    </span>
                </div>
            </div>

            {/* Sign Out All Sessions (Placeholder) */}
            <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-base font-medium text-on-surface">Sign Out All Devices</h3>
                        <p className="text-sm text-on-surface-variant/60 mt-1">
                            Sign out from all other active sessions
                        </p>
                    </div>
                    <button
                        disabled
                        className="px-4 py-2 text-sm font-medium text-error bg-error/10 rounded-xl opacity-50 cursor-not-allowed"
                    >
                        Sign Out All
                    </button>
                </div>
                <p className="text-xs text-on-surface-variant/40 mt-3">
                    Session management will be available in a future update
                </p>
            </div>
        </div>
    );
};

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

interface ToggleSwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onChange }) => (
    <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
            checked ? 'bg-tertiary' : 'bg-surface-container-highest'
        }`}
    >
        <span
            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                checked ? 'translate-x-5' : 'translate-x-0'
            }`}
        />
    </button>
);

interface NotificationToggleProps {
    label: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

const NotificationToggle: React.FC<NotificationToggleProps> = ({
    label,
    description,
    checked,
    onChange,
}) => (
    <div className="flex items-center justify-between py-3 border-b border-outline-variant/10 last:border-0">
        <div>
            <p className="text-sm font-medium text-on-surface">{label}</p>
            <p className="text-xs text-on-surface-variant/50 mt-0.5">{description}</p>
        </div>
        <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
);

export default AccountSettingsPage;
