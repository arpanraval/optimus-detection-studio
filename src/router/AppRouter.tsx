// Main router configuration
import React, { useState, useEffect, useCallback, useMemo, lazy } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { Session, User } from '@supabase/supabase-js';
import { Profile } from '../types';
import { supabase } from '../lib/supabaseClient';
import { AuthPage } from '../components/AuthPage';
import { LandingPage } from '../components/LandingPage';
import { SetPasswordPage } from '../components/SetPasswordPage';
import { AppLayout } from './AppLayout';
import { AppDataProvider, useAppData } from './AppDataContext';
import { ToastProvider } from '../context/ToastContext';
import { ThemeProvider } from '../context/ThemeContext';
import { LibraryProvider } from '../context/LibraryContext';
import { PermissionsProvider } from '../context/PermissionsContext';
import { TeamProvider } from '../context/TeamContext';
import { ThreatIntelProvider } from '../context/ThreatIntelContext';
import { NotificationProvider } from '../context/NotificationContext';
import { ScoringProvider } from '../context/ScoringContext';
import { GlobalImportProvider } from '../context/GlobalImportContext';
import { NavigationBlockerProvider } from '../context/NavigationBlockerContext';
import { RealtimeProvider } from '../context/RealtimeContext';
import { logAuditEvent } from '../lib/audit';
import { AppErrorBoundary } from '../components/ErrorBoundary';
import { AppLoader } from '../components/AppLoader';

// ============================================================================
// Capture auth action from URL hash BEFORE Supabase SDK consumes it.
// Supabase invite links: ...#access_token=xxx&type=invite
// Password recovery:     ...#access_token=xxx&type=recovery
// This runs at module-import time (before React renders) so the hash is intact.
// ============================================================================
type PendingAuthAction = 'set-password' | 'reset-password' | null;

function detectPendingAuthAction(): PendingAuthAction {
  // Check sessionStorage first (persists across Supabase's hash cleanup)
  const stored = sessionStorage.getItem('ds_pending_auth_action');
  if (stored === 'set-password' || stored === 'reset-password') return stored;

  // Parse the URL hash for Supabase auth type
  const hash = window.location.hash;
  if (!hash) return null;

  const params = new URLSearchParams(hash.substring(1));
  const type = params.get('type');

  if (type === 'invite' || type === 'magiclink') {
    sessionStorage.setItem('ds_pending_auth_action', 'set-password');
    return 'set-password';
  }
  if (type === 'recovery') {
    sessionStorage.setItem('ds_pending_auth_action', 'reset-password');
    return 'reset-password';
  }

  return null;
}

const initialPendingAction = detectPendingAuthAction();

// Eager-load only the landing page (CommandCenterPage)
import { CommandCenterPage } from './pages';

// Lazy-load all other pages
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const IntelGlobePage = lazy(() => import('./pages/IntelGlobePage').then(m => ({ default: m.IntelGlobePage })));
const DetectionLibraryPage = lazy(() => import('./pages/DetectionLibraryPage').then(m => ({ default: m.DetectionLibraryPage })));
const DetectionDetailPage = lazy(() => import('./pages/DetectionDetailPage').then(m => ({ default: m.DetectionDetailPage })));
const DetectionFormPage = lazy(() => import('./pages/DetectionFormPage').then(m => ({ default: m.DetectionFormPage })));
const GroupsPage = lazy(() => import('./pages/GroupsPage').then(m => ({ default: m.GroupsPage })));
const GroupDetailPage = lazy(() => import('./pages/GroupDetailPage').then(m => ({ default: m.GroupDetailPage })));
const SoftwarePage = lazy(() => import('./pages/SoftwarePage').then(m => ({ default: m.SoftwarePage })));
const SoftwareDetailPage = lazy(() => import('./pages/SoftwareDetailPage').then(m => ({ default: m.SoftwareDetailPage })));
const CampaignsPage = lazy(() => import('./pages/CampaignsPage').then(m => ({ default: m.CampaignsPage })));
const CampaignDetailPage = lazy(() => import('./pages/CampaignDetailPage').then(m => ({ default: m.CampaignDetailPage })));
const MitigationsPage = lazy(() => import('./pages/MitigationsPage').then(m => ({ default: m.MitigationsPage })));
const MitigationDetailPage = lazy(() => import('./pages/MitigationDetailPage').then(m => ({ default: m.MitigationDetailPage })));
const StrategiesPage = lazy(() => import('./pages/StrategiesPage').then(m => ({ default: m.StrategiesPage })));
const StrategyDetailPage = lazy(() => import('./pages/StrategyDetailPage').then(m => ({ default: m.StrategyDetailPage })));
const PacksPage = lazy(() => import('./pages/PacksPage').then(m => ({ default: m.PacksPage })));
const PackDetailPage = lazy(() => import('./pages/PackDetailPage').then(m => ({ default: m.PackDetailPage })));
const MitreMatrixPage = lazy(() => import('./pages/MitreMatrixPage').then(m => ({ default: m.MitreMatrixPage })));
const CoveragePage = lazy(() => import('./pages/CoveragePage').then(m => ({ default: m.CoveragePage })));
const DefensivePosturePage = lazy(() => import('./pages/DefensivePosturePage').then(m => ({ default: m.DefensivePosturePage })));
const SigmaConverterPage = lazy(() => import('./pages/SigmaConverterPage').then(m => ({ default: m.SigmaConverterPage })));
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage').then(m => ({ default: m.IntegrationsPage })));
const IntegrationDetailPage = lazy(() => import('./pages/IntegrationDetailPage').then(m => ({ default: m.IntegrationDetailPage })));
const ScoringPage = lazy(() => import('./pages/ScoringPage').then(m => ({ default: m.ScoringPage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })));
const MitreSyncPage = lazy(() => import('./pages/MitreSyncPage').then(m => ({ default: m.MitreSyncPage })));
const AccountPage = lazy(() => import('./pages/AccountPage').then(m => ({ default: m.AccountPage })));
const SubmissionsPage = lazy(() => import('./pages/SubmissionsPage').then(m => ({ default: m.SubmissionsPage })));
const ApprovalQueuePage = lazy(() => import('./pages/ApprovalQueuePage').then(m => ({ default: m.ApprovalQueuePage })));
const ThreatIntelPage = lazy(() => import('./pages/ThreatIntelPage').then(m => ({ default: m.ThreatIntelPage })));
const ThreatIntelDetailPage = lazy(() => import('./pages/ThreatIntelDetailPage').then(m => ({ default: m.ThreatIntelDetailPage })));
const ImportHistoryPage = lazy(() => import('./pages/ImportHistoryPage').then(m => ({ default: m.ImportHistoryPage })));
const SearchResultsPage = lazy(() => import('./pages/SearchResultsPage').then(m => ({ default: m.SearchResultsPage })));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage').then(m => ({ default: m.AuditLogPage })));
const EnvironmentProfilePage = lazy(() => import('./pages/EnvironmentProfilePage').then(m => ({ default: m.EnvironmentProfilePage })));
const BulkImportPage = lazy(() => import('./pages/BulkImportPage').then(m => ({ default: m.BulkImportPage })));
const EnterpriseDashboardPage = lazy(() => import('./pages/EnterpriseDashboardPage').then(m => ({ default: m.EnterpriseDashboardPage })));
const AIQueryPage = lazy(() => import('./pages/AIQueryPage').then(m => ({ default: m.AIQueryPage })));
const OptimusPage = lazy(() => import('./pages/OptimusPage').then(m => ({ default: m.OptimusPage })));
const OnboardingPage = lazy(() => import('../components/onboarding/OnboardingPage').then(m => ({ default: m.OnboardingPage })));
const PlaybooksPage = lazy(() => import('./pages/PlaybooksPage').then(m => ({ default: m.PlaybooksPage })));
const PipelinePage = lazy(() => import('./pages/PipelinePage').then(m => ({ default: m.PipelinePage })));
const DetectionActionPlanPage = lazy(() => import('./pages/DetectionActionPlanPage').then(m => ({ default: m.DetectionActionPlanPage })));
const StateSponsoredReportPage = lazy(() => import('./pages/StateSponsoredReportPage').then(m => ({ default: m.StateSponsoredReportPage })));
const ThreatIntelFeedsPage = lazy(() => import('./pages/ThreatIntelFeedsPage').then(m => ({ default: m.ThreatIntelFeedsPage })));
const ReportHistoryPage = lazy(() => import('./pages/ReportHistoryPage').then(m => ({ default: m.ReportHistoryPage })));
const ReportDetailPage = lazy(() => import('./pages/ReportDetailPage').then(m => ({ default: m.ReportDetailPage })));
const SiemHealthPage = lazy(() => import('./pages/SiemHealthPage').then(m => ({ default: m.SiemHealthPage })));

// Design System Pages
const DesignOverviewPage = lazy(() => import('../components/design-system/pages/OverviewPage').then(m => ({ default: m.OverviewPage })));
const DesignButtonsPage = lazy(() => import('../components/design-system/pages/ButtonsPage').then(m => ({ default: m.ButtonsPage })));
const DesignInputsPage = lazy(() => import('../components/design-system/pages/InputsPage').then(m => ({ default: m.InputsPage })));
const DesignBadgesPage = lazy(() => import('../components/design-system/pages/BadgesPage').then(m => ({ default: m.BadgesPage })));
const DesignCardsPage = lazy(() => import('../components/design-system/pages/CardsPage').then(m => ({ default: m.CardsPage })));
const DesignNavigationPage = lazy(() => import('../components/design-system/pages/NavigationPage').then(m => ({ default: m.NavigationPage })));
const DesignModalsPage = lazy(() => import('../components/design-system/pages/ModalsPage').then(m => ({ default: m.ModalsPage })));
const DesignDropdownsPage = lazy(() => import('../components/design-system/pages/DropdownsPage').then(m => ({ default: m.DropdownsPage })));
const DesignLoadingPage = lazy(() => import('../components/design-system/pages/LoadingPage').then(m => ({ default: m.LoadingPage })));
const DesignMiscPage = lazy(() => import('../components/design-system/pages/MiscPage').then(m => ({ default: m.MiscPage })));
const DesignColorsPage = lazy(() => import('../components/design-system/pages/ColorsPage').then(m => ({ default: m.ColorsPage })));
const DesignBulkImportPage = lazy(() => import('../components/design-system/pages/BulkImportShowcasePage').then(m => ({ default: m.BulkImportShowcasePage })));
const DesignLogoPage = lazy(() => import('../components/design-system/pages/LogoPage').then(m => ({ default: m.LogoPage })));
const DesignLoginPage = lazy(() => import('../components/design-system/pages/LoginShowcasePage').then(m => ({ default: m.LoginShowcasePage })));
const DesignMitreTooltipPage = lazy(() => import('../components/design-system/pages/MitreTooltipPage').then(m => ({ default: m.MitreTooltipPage })));
const DesignOnboardingAnimationPage = lazy(() => import('../components/design-system/pages/OnboardingAnimationPage').then(m => ({ default: m.OnboardingAnimationPage })));
const DesignIntelCardsPage = lazy(() => import('../components/design-system/pages/IntelCardsPage').then(m => ({ default: m.IntelCardsPage })));
const DesignAIChatCardsPage = lazy(() => import('../components/design-system/pages/AIChatCardsPage').then(m => ({ default: m.AIChatCardsPage })));

// Protected layout wrapper that provides AppDataContext
const ProtectedLayout: React.FC<{ user: User; profile: Profile }> = ({ user, profile }) => {
  const { detections, isLoading, libraryRefreshTrigger } = useAppData();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <NavigationBlockerProvider>
      <RealtimeProvider userId={user.id}>
        <GlobalImportProvider userId={user.id}>
          <PermissionsProvider userId={user.id}>
            <TeamProvider userId={user.id}>
              <ScoringProvider>
                <LibraryProvider userId={user.id} userRole={profile.role} refreshTrigger={libraryRefreshTrigger}>
                  <ThreatIntelProvider userId={user.id} refreshTrigger={libraryRefreshTrigger}>
                    <NotificationProvider userId={user.id}>
                      <AppLayout
                        user={user}
                        profile={profile}
                        detections={detections}
                        isLoading={isLoading}
                        onSignOut={handleSignOut}
                      />
                    </NotificationProvider>
                  </ThreatIntelProvider>
                </LibraryProvider>
              </ScoringProvider>
            </TeamProvider>
          </PermissionsProvider>
        </GlobalImportProvider>
      </RealtimeProvider>
    </NavigationBlockerProvider>
  );
};

// Create router with all routes
const createAppRouter = (user: User, profile: Profile) => createBrowserRouter([
  {
    path: '/',
    element: (
      <AppDataProvider user={user} profile={profile}>
        <ProtectedLayout user={user} profile={profile} />
      </AppDataProvider>
    ),
    children: [
      // Command Center (default)
      { index: true, element: <CommandCenterPage /> },

      // Classic Dashboard
      { path: 'dashboard/classic', element: <DashboardPage /> },

      // Enterprise Dashboard (with optional dashboardId for deep-linking)
      { path: 'dashboard/enterprise', element: <EnterpriseDashboardPage /> },
      { path: 'dashboard/enterprise/:dashboardId', element: <EnterpriseDashboardPage /> },

      // Intelligence Globe
      { path: 'dashboard/globe', element: <IntelGlobePage /> },

      // Detection Library
      { path: 'library', element: <DetectionLibraryPage /> },
      { path: 'library/detections/new', element: <DetectionFormPage mode="new" /> },
      { path: 'library/detections/:id', element: <DetectionDetailPage /> },
      { path: 'library/detections/:id/edit', element: <DetectionFormPage mode="edit" /> },

      // Packs
      { path: 'packs', element: <PacksPage /> },
      { path: 'packs/:id', element: <PackDetailPage /> },

      // Intelligence
      { path: 'intelligence/mitre', element: <MitreMatrixPage /> },
      { path: 'intelligence/coverage', element: <CoveragePage /> },
      { path: 'intelligence/posture', element: <DefensivePosturePage /> },
      { path: 'intelligence/strategies', element: <StrategiesPage /> },
      { path: 'intelligence/strategies/:id', element: <StrategyDetailPage /> },
      { path: 'intelligence/groups', element: <GroupsPage /> },
      { path: 'intelligence/groups/:id', element: <GroupDetailPage /> },
      { path: 'intelligence/software', element: <SoftwarePage /> },
      { path: 'intelligence/software/:id', element: <SoftwareDetailPage /> },
      { path: 'intelligence/campaigns', element: <CampaignsPage /> },
      { path: 'intelligence/campaigns/:id', element: <CampaignDetailPage /> },
      { path: 'intelligence/mitigations', element: <MitigationsPage /> },
      { path: 'intelligence/mitigations/:id', element: <MitigationDetailPage /> },
      { path: 'intelligence/threat-digest', element: <ThreatIntelPage /> },
      { path: 'intelligence/threat-digest/:id', element: <ThreatIntelDetailPage /> },
      { path: 'intelligence/feeds', element: <ThreatIntelFeedsPage /> },
      { path: 'intelligence/reports', element: <ReportHistoryPage /> },
      { path: 'intelligence/reports/:id', element: <ReportDetailPage /> },

      // Arsenal
      { path: 'arsenal/sigma', element: <SigmaConverterPage /> },
      { path: 'arsenal/ai-query', element: <AIQueryPage /> },
      { path: 'arsenal/optimus', element: <OptimusPage /> },
      { path: 'arsenal/bulk-import', element: <BulkImportPage /> },
      { path: 'arsenal/import-history', element: <ImportHistoryPage /> },
      { path: 'arsenal/playbooks', element: <PlaybooksPage /> },

      // Settings
      { path: 'settings/integrations', element: <IntegrationsPage /> },
      { path: 'settings/integrations/:id', element: <IntegrationDetailPage /> },
      { path: 'settings/scoring', element: <ScoringPage /> },
      { path: 'settings/users', element: <UsersPage /> },
      { path: 'settings/mitre-sync', element: <MitreSyncPage /> },
      { path: 'settings/audit-log', element: <AuditLogPage /> },
      { path: 'settings/environment', element: <EnvironmentProfilePage /> },

      // SIEM Health
      { path: 'siem', element: <SiemHealthPage /> },

      // Search
      { path: 'search', element: <SearchResultsPage /> },

      // Action Plan
      { path: 'action-plan', element: <DetectionActionPlanPage /> },

      // Defense Exercises
      { path: 'exercises/state-sponsored', element: <StateSponsoredReportPage /> },

      // Detection Board (under library)
      { path: 'library/board', element: <PipelinePage /> },
      // Legacy redirect from old pipeline route
      { path: 'pipeline', element: <Navigate to="/library/board" replace /> },
      { path: 'onboarding', element: <OnboardingPage /> },

      // Account
      { path: 'account', element: <AccountPage /> },
      { path: 'submissions', element: <SubmissionsPage /> },
      { path: 'approval-queue', element: <ApprovalQueuePage /> },

      // Design System — dev builds only
      ...(import.meta.env.DEV ? [
        { path: 'design-system', element: <DesignOverviewPage /> },
        { path: 'design-system/buttons', element: <DesignButtonsPage /> },
        { path: 'design-system/inputs', element: <DesignInputsPage /> },
        { path: 'design-system/badges', element: <DesignBadgesPage /> },
        { path: 'design-system/cards', element: <DesignCardsPage /> },
        { path: 'design-system/navigation', element: <DesignNavigationPage /> },
        { path: 'design-system/modals', element: <DesignModalsPage /> },
        { path: 'design-system/dropdowns', element: <DesignDropdownsPage /> },
        { path: 'design-system/loading', element: <DesignLoadingPage /> },
        { path: 'design-system/misc', element: <DesignMiscPage /> },
        { path: 'design-system/colors', element: <DesignColorsPage /> },
        { path: 'design-system/bulk-import', element: <DesignBulkImportPage /> },
        { path: 'design-system/logo', element: <DesignLogoPage /> },
        { path: 'design-system/login', element: <DesignLoginPage /> },
        { path: 'design-system/mitre-tooltip', element: <DesignMitreTooltipPage /> },
        { path: 'design-system/onboarding-animation', element: <DesignOnboardingAnimationPage /> },
        { path: 'design-system/intel-cards', element: <DesignIntelCardsPage /> },
        { path: 'design-system/ai-chat-cards', element: <DesignAIChatCardsPage /> },
      ] : []),

      // Catch-all redirect
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

// Main App component with auth handling
export const AppRouter: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAuthAction, setPendingAuthAction] = useState<PendingAuthAction>(initialPendingAction);
  const [showAuth, setShowAuth] = useState(false);

  const dismissLoader = useCallback(() => {
    setLoading(false);
  }, []);

  const clearPendingAction = useCallback(() => {
    sessionStorage.removeItem('ds_pending_auth_action');
    setPendingAuthAction(null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
      } else {
        dismissLoader();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Detect PASSWORD_RECOVERY event (from Supabase dashboard reset)
      if (event === 'PASSWORD_RECOVERY') {
        sessionStorage.setItem('ds_pending_auth_action', 'reset-password');
        setPendingAuthAction('reset-password');
      }

      // Login audit is logged in AuthPage at the actual sign-in call,
      // NOT here — onAuthStateChange fires SIGNED_IN on every page
      // refresh and token refresh, not just real logins.
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
      } else {
        if (event === 'SIGNED_OUT') {
          logAuditEvent({ action: 'user.logout', entity_type: 'user' });
          // Clear any pending action on sign-out
          clearPendingAction();
        }
        setUserProfile(null);
        dismissLoader();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
      }

      if (data) {
        if (data.status === 'deactivated') {
          await supabase.auth.signOut();
          setUserProfile(null);
          return;
        }
        // DB-backed password gate: force setup for invited users
        if (data.password_set === false) {
          setPendingAuthAction('set-password');
        }
        setUserProfile(data as Profile);

        // Update last_active_at for activity tracking
        supabase
          .from('profiles')
          .update({ last_active_at: new Date().toISOString() })
          .eq('id', userId)
          .then();
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      dismissLoader();
    }
  };

  // Re-fetch profile and clear pending action after password is set
  const handlePasswordSetComplete = useCallback(async () => {
    sessionStorage.removeItem('ds_pending_auth_action');
    setPendingAuthAction(null);
    if (session) await fetchProfile(session.user.id);
  }, [session]);

  // Memoize router to avoid recreating on unrelated state changes.
  // Must be called before early returns to satisfy Rules of Hooks.
  // Returns null when session/profile not yet available.
  const router = useMemo(
    () => (session && userProfile) ? createAppRouter(session.user, userProfile) : null,
    [session, userProfile]
  );

  if (loading) {
    return <AppLoader />;
  }

  // Invite or password-recovery flow: user has a session but needs to set a password
  if (pendingAuthAction && session) {
    return (
      <ThemeProvider>
        <ToastProvider>
          <SetPasswordPage
            mode={pendingAuthAction === 'set-password' ? 'invite' : 'recovery'}
            email={session.user.email}
            userId={session.user.id}
            onComplete={handlePasswordSetComplete}
          />
        </ToastProvider>
      </ThemeProvider>
    );
  }

  if (!router) {
    return (
      <ThemeProvider>
        <ToastProvider>
          {showAuth ? (
            <AuthPage onBack={() => setShowAuth(false)} />
          ) : (
            <LandingPage onSignIn={() => setShowAuth(true)} />
          )}
        </ToastProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <AppErrorBoundary>
          <RouterProvider router={router} />
        </AppErrorBoundary>
      </ToastProvider>
    </ThemeProvider>
  );
};

export default AppRouter;
