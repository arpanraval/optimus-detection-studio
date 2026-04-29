import React, { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { MfaEnrollmentWizard } from './MfaEnrollmentWizard';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../hooks/useToast';
import { useBeforeUnload } from '../hooks/useBeforeUnload';
import { Profile } from '../types';
import { getAvatarColor, getInitials } from '../lib/avatar';

// =============================================================================
// CONSTANTS
// =============================================================================

type SettingsSection = 'profile' | 'security' | 'notifications' | 'sessions';

interface AccountSettingsPageProps {
  userId: string;
  userEmail: string;
}

const TABS: { id: SettingsSection; label: string }[] = [
  { id: 'profile',       label: 'Profile' },
  { id: 'security',      label: 'Security' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'sessions',      label: 'Sessions' },
];

const COMMON_TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Shanghai',
  'Australia/Sydney', 'Pacific/Auckland',
];

const PASSWORD_REQUIREMENTS = [
  { test: (p: string) => p.length >= 12, label: '12+ characters' },
  { test: (p: string) => /[A-Z]/.test(p), label: 'Uppercase' },
  { test: (p: string) => /[a-z]/.test(p), label: 'Lowercase' },
  { test: (p: string) => /[0-9]/.test(p), label: 'Number' },
];

// =============================================================================
// CARD CHROME — visible borders + clearly-elevated background. Stronger
// contrast than the AutoDigest pattern so the structure reads in both themes.
// =============================================================================

interface CardProps {
  title: string;
  description?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}

const Card: React.FC<CardProps> = ({ title, description, trailing, children }) => (
  <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low shadow-sm overflow-hidden">
    <div className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-outline-variant/30 bg-surface-container">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
        {description && (
          <p className="text-xs text-on-surface-variant mt-0.5">{description}</p>
        )}
      </div>
      {trailing}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const AccountSettingsPage: React.FC<AccountSettingsPageProps> = ({ userId, userEmail }) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Profile form state
  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState('');

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // MFA state
  const [mfaFactors, setMfaFactors] = useState<
    Array<{ id: string; status: string; friendly_name?: string; created_at?: string }>
  >([]);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [showMfaWizard, setShowMfaWizard] = useState(false);
  const [showMfaDisableConfirm, setShowMfaDisableConfirm] = useState(false);
  const [mfaDisabling, setMfaDisabling] = useState(false);

  const { showToast } = useToast();

  const isProfileDirty =
    profile !== null &&
    (displayName !== (profile.full_name || '') ||
      timezone !== (profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone));

  const isPasswordDirty =
    currentPassword.length > 0 || newPassword.length > 0 || confirmPassword.length > 0;

  useBeforeUnload(isProfileDirty || isPasswordDirty);

  // ==========================================================================
  // DATA FETCH
  // ==========================================================================

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (error) throw error;
        if (cancelled) return;
        setProfile(data);
        setDisplayName(data.full_name || '');
        setTimezone(data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
      } catch {
        if (!cancelled) showToast('error', 'Error', 'Failed to load profile');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, showToast]);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: displayName.trim() || null,
          timezone,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
      if (error) throw error;
      showToast('success', 'Saved', 'Profile updated successfully');
      setProfile((prev) => (prev ? { ...prev, full_name: displayName, timezone } : null));
    } catch (err) {
      showToast('error', 'Error', err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleDiscardProfile = () => {
    if (!profile) return;
    setDisplayName(profile.full_name || '');
    setTimezone(profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      showToast('error', 'Error', 'Passwords do not match');
      return;
    }
    const failedRequirement = PASSWORD_REQUIREMENTS.find((r) => !r.test(newPassword));
    if (failedRequirement) {
      showToast('error', 'Error', `Password missing: ${failedRequirement.label}`);
      return;
    }
    if (!currentPassword) {
      showToast('error', 'Error', 'Current password is required');
      return;
    }

    setIsChangingPassword(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: profile?.email || userEmail,
        password: currentPassword,
      });
      if (verifyError) {
        showToast('error', 'Error', 'Current password is incorrect');
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      showToast('success', 'Success', 'Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      showToast('error', 'Error', err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleCopyId = async () => {
    if (!profile?.id) return;
    try {
      await navigator.clipboard.writeText(profile.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1500);
    } catch {
      /* clipboard might be unavailable; silently ignore */
    }
  };

  // ==========================================================================
  // MFA
  // ==========================================================================

  const fetchMfaFactors = async () => {
    setMfaLoading(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      setMfaFactors(data?.totp?.filter((f) => f.status === 'verified') || []);
    } catch {
      /* silent */
    } finally {
      setMfaLoading(false);
    }
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
    } catch (err) {
      showToast('error', 'Error', err instanceof Error ? err.message : 'Failed to disable MFA');
    } finally {
      setMfaDisabling(false);
      setShowMfaDisableConfirm(false);
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  const avatar = getAvatarColor(userEmail);
  const initials = getInitials(profile?.full_name || displayName, userEmail);
  const displayLine = (profile?.full_name || displayName || userEmail.split('@')[0]).trim();
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null;
  const lastActive = profile?.last_active_at
    ? new Date(profile.last_active_at).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;
  const hasMfa = mfaFactors.length > 0;

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 animate-page-enter">
      {/* ───── Identity hero — full-width header card ───────────────────── */}
      <div className="flex items-center gap-4 px-5 py-4 rounded-xl border border-outline-variant/30 bg-surface-container-low shadow-sm mb-6">
        <div className={`w-14 h-14 rounded-full ${avatar.bg} flex items-center justify-center flex-shrink-0`}>
          <span className={`text-base font-bold ${avatar.text}`}>{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold text-on-surface truncate">{displayLine}</span>
            {profile?.role && (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-tertiary/15 text-tertiary">
                {profile.role}
              </span>
            )}
          </div>
          <div className="text-sm text-on-surface-variant truncate">{userEmail}</div>
          {memberSince && (
            <div className="text-[11px] text-on-surface-variant/60 mt-0.5">Member since {memberSince}</div>
          )}
        </div>
      </div>

      {/* ───── Two-column layout: vertical sub-nav rail + content ───────── */}
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        {/* Sub-nav rail */}
        <nav className="md:sticky md:top-6 md:self-start">
          <div className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest mb-2 px-3">
            Settings
          </div>
          <div className="flex flex-col gap-0.5">
            {TABS.map((tab) => {
              const active = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSection(tab.id)}
                  className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    active
                      ? 'bg-surface-container-high text-on-surface font-medium'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Section content column */}
        <div className="min-w-0 space-y-5">
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-16 rounded-xl border border-outline-variant/30 bg-surface-container-low">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* PROFILE */}
          {!isLoading && activeSection === 'profile' && (
            <>
              <Card title="Personal Information" description="Your name, email, and timezone">
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Display Name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Enter your name"
                      fullWidth
                    />
                    <Input
                      label="Email Address"
                      type="email"
                      value={userEmail}
                      readOnly
                      helperText="Email cannot be changed"
                      fullWidth
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-on-surface mb-1.5">Timezone</label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full h-10 px-4 rounded-xl bg-surface-container-high border border-outline-variant/40 text-sm text-on-surface focus:outline-none focus:border-[#783264] focus:ring-2 focus:ring-[#783264]/20 transition-all appearance-none cursor-pointer"
                    >
                      {COMMON_TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </Card>

              {/* Account meta — read-only at-a-glance info gives the page weight */}
              <Card title="Account Details" description="Read-only account metadata">
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                  <MetaRow label="Role" value={profile?.role ? capitalize(profile.role) : '—'} />
                  <MetaRow label="Member since" value={memberSince ?? '—'} />
                  <MetaRow label="Last active" value={lastActive ?? 'Now'} />
                  <MetaRow label="Status" value={profile?.status ? capitalize(profile.status) : 'Active'} />
                  <div className="md:col-span-2">
                    <dt className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-1">
                      Account ID
                    </dt>
                    <dd className="flex items-center gap-2">
                      <code className="text-xs font-mono text-on-surface-variant px-2 py-1 rounded bg-surface-container-high border border-outline-variant/30 truncate flex-1 min-w-0">
                        {profile?.id ?? userId}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyId}
                        className="text-xs text-on-surface-variant hover:text-on-surface px-2 py-1 rounded-md hover:bg-surface-container-high transition-colors flex-shrink-0"
                        title="Copy account ID"
                      >
                        {copiedId ? 'Copied' : 'Copy'}
                      </button>
                    </dd>
                  </div>
                </dl>
              </Card>
            </>
          )}

          {/* SECURITY */}
          {!isLoading && activeSection === 'security' && (
            <>
              <Card title="Password" description="Change the password you use to sign in">
                <form
                  className="space-y-4 max-w-md"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleChangePassword();
                  }}
                  // Hint to browsers/password managers that this is a password-change form,
                  // not a sign-in form, so they offer to update the saved credential.
                  aria-label="Change password"
                >
                  {/*
                    Hidden username field — required by the Chrome warning at
                    https://goo.gl/9p2vKq. Lets password managers associate the
                    new password with the correct account when saving it.
                  */}
                  <input
                    type="text"
                    name="username"
                    autoComplete="username"
                    value={profile?.email || userEmail}
                    readOnly
                    hidden
                  />
                  <Input
                    label="Current Password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    autoComplete="current-password"
                    fullWidth
                  />
                  <div>
                    <Input
                      label="New Password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      autoComplete="new-password"
                      fullWidth
                    />
                    {newPassword.length > 0 && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                        {PASSWORD_REQUIREMENTS.map((req) => {
                          const met = req.test(newPassword);
                          return (
                            <span
                              key={req.label}
                              className={`text-xs flex items-center gap-1 ${
                                met ? 'text-emerald-500' : 'text-on-surface-variant/50'
                              }`}
                            >
                              <span
                                className={`w-3 h-3 rounded-full flex items-center justify-center text-[8px] ${
                                  met ? 'bg-emerald-500/15' : 'bg-on-surface-variant/10'
                                }`}
                              >
                                {met ? '✓' : '·'}
                              </span>
                              {req.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <Input
                    label="Confirm New Password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    autoComplete="new-password"
                    fullWidth
                  />
                  <div className="pt-1">
                    <Button
                      type="submit"
                      color="primary"
                      size="md"
                      loading={isChangingPassword}
                      disabled={!newPassword || !confirmPassword || !currentPassword}
                    >
                      Change Password
                    </Button>
                  </div>
                </form>
              </Card>

              <Card
                title="Two-Factor Authentication"
                description="Add an extra layer of security with an authenticator app"
                trailing={
                  mfaLoading ? (
                    <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        hasMfa
                          ? 'bg-emerald-500/15 text-emerald-500'
                          : 'bg-on-surface-variant/10 text-on-surface-variant'
                      }`}
                    >
                      {hasMfa ? 'Enabled' : 'Not enabled'}
                    </span>
                  )
                }
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-on-surface">Authenticator App</div>
                    <div className="text-xs text-on-surface-variant mt-0.5">
                      {hasMfa && mfaFactors[0].created_at
                        ? `Enrolled ${new Date(mfaFactors[0].created_at).toLocaleDateString()}`
                        : 'Use Google Authenticator, Authy, or 1Password to generate one-time codes.'}
                    </div>
                  </div>
                  {hasMfa ? (
                    <Button color="error" variant="tonal" size="md" onClick={() => setShowMfaDisableConfirm(true)}>
                      Disable
                    </Button>
                  ) : (
                    <Button color="primary" size="md" onClick={() => setShowMfaWizard(true)}>
                      Enable
                    </Button>
                  )}
                </div>
              </Card>
            </>
          )}

          {/* NOTIFICATIONS */}
          {!isLoading && activeSection === 'notifications' && (
            <Card title="Notification Channels" description="Where and how you'll be reached">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-on-surface">In-app</div>
                    <div className="text-xs text-on-surface-variant mt-0.5">
                      Bell-icon feed for review requests, assignments, status changes, promotion decisions.
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500">
                    Always on
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 py-2 border-t border-outline-variant/20">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-on-surface">Email</div>
                    <div className="text-xs text-on-surface-variant mt-0.5">
                      Digest emails for high-priority events.
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-on-surface-variant/10 text-on-surface-variant">
                    Coming soon
                  </span>
                </div>
              </div>
            </Card>
          )}

          {/* SESSIONS */}
          {!isLoading && activeSection === 'sessions' && (
            <>
              <Card title="Current Session" description="The device you're signed in on right now">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-on-surface">This Device</div>
                    <div className="text-xs text-on-surface-variant mt-0.5">
                      {detectBrowser()} · {navigator.platform || 'Unknown platform'}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500">
                    Active Now
                  </span>
                </div>
              </Card>

              <Card title="Sign Out All Devices" description="Sign out from all other active sessions">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-xs text-on-surface-variant">
                    Session management arrives in a future update.
                  </div>
                  <Button color="error" variant="tonal" size="md" disabled>
                    Sign Out All
                  </Button>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* ───── Floating save bar (Profile only) ─────────────────────────── */}
      {isProfileDirty && activeSection === 'profile' && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-page-enter">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-surface-container-highest border border-outline-variant/40 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            <span className="text-xs text-on-surface-variant">Unsaved changes</span>
            <button
              onClick={handleDiscardProfile}
              className="text-xs text-on-surface-variant hover:text-on-surface transition-colors px-2 py-1 rounded-lg hover:bg-surface-container-high"
            >
              Discard
            </button>
            <Button color="primary" size="sm" loading={isSavingProfile} onClick={handleSaveProfile}>
              Save Changes
            </Button>
          </div>
        </div>
      )}

      {/* ───── MFA Enrollment Wizard ─────────────────────────────────────── */}
      <MfaEnrollmentWizard
        isOpen={showMfaWizard}
        onClose={() => setShowMfaWizard(false)}
        onEnrolled={() => {
          fetchMfaFactors();
          showToast('success', 'Enabled', 'Two-factor authentication is now active');
        }}
      />

      {/* ───── MFA Disable Confirmation ──────────────────────────────────── */}
      {showMfaDisableConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowMfaDisableConfirm(false)}
        >
          <div
            className="bg-surface-container rounded-2xl border border-outline-variant/30 p-5 max-w-sm w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-base font-semibold text-on-surface mb-2">Disable Two-Factor?</div>
            <p className="text-sm text-on-surface-variant mb-5">
              This removes the authenticator app from your account. Your account will only be protected by your password.
            </p>
            <div className="flex gap-2 justify-end">
              <Button color="surface" variant="text" size="md" onClick={() => setShowMfaDisableConfirm(false)}>
                Cancel
              </Button>
              <Button color="error" size="md" loading={mfaDisabling} onClick={handleDisableMfa}>
                Disable
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// HELPERS
// =============================================================================

const MetaRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <dt className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-1">{label}</dt>
    <dd className="text-sm text-on-surface">{value}</dd>
  </div>
);

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/')) return 'Safari';
  return 'Browser';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default AccountSettingsPage;
