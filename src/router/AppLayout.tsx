// Main layout component with Sidebar + Header + Outlet
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { Profile, Detection } from '../types';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { ROUTES, routeHeaders, viewToRoute, routeHelpers } from './routes';
import { matchRouteToNavItem } from './utils';
import { ensureLocalDashboardsExist } from '../components/dashboard/enterprise/dashboardPersistence';
import { GlobalImportBar } from '../components/global/GlobalImportBar';
import { ImportNavigationModal } from '../components/global/ImportNavigationModal';
import { InterruptedImportBanner } from '../components/global/InterruptedImportBanner';
import { useGlobalImport } from '../context/GlobalImportContext';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { supabase } from '../lib/supabaseClient';
import { BudgetIndicator } from '../components/BudgetIndicator';

// Routes where AI calls happen — show the BudgetIndicator chip in the header.
const AI_ROUTE_PREFIXES = [
  '/arsenal/optimus',
  '/arsenal/ai-query',
  '/arsenal/sigma',
  '/arsenal/playbooks',
  '/library/detections',
];

interface AppLayoutProps {
  user: User;
  profile: Profile;
  detections: Detection[];
  isLoading: boolean;
  onSignOut: () => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  user,
  profile,
  detections,
  isLoading,
  onSignOut,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const { navigationBlocker, minimize, abortImport } = useGlobalImport();

  // Global keyboard shortcuts (Ctrl+K search, Ctrl+N new detection)
  useKeyboardShortcuts();

  // Ensure enterprise dashboards are seeded in localStorage (for sidebar nav items)
  useEffect(() => { ensureLocalDashboardsExist(); }, []);

  // Auto-redirect first-time users with empty libraries to onboarding
  useEffect(() => {
    const hasCompleted = localStorage.getItem('optimus:onboarding:completed');
    const hasSkipped = localStorage.getItem('optimus:onboarding:skipped');

    if (hasCompleted || hasSkipped) return;
    if (location.pathname === ROUTES.ONBOARDING) return;

    const checkLibrary = async () => {
      try {
        const { count } = await supabase
          .from('detections')
          .select('id', { count: 'exact', head: true });
        if (count === 0) {
          navigate(ROUTES.ONBOARDING);
        }
      } catch {
        // Silently fail — don't block the app if this check fails
      }
    };
    checkLibrary();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Get current page header based on route
  const pageHeader = useMemo(() => {
    const pathname = location.pathname;

    // Check for exact matches first
    if (routeHeaders[pathname]) {
      return routeHeaders[pathname];
    }

    // Check for pattern matches (routes with :id)
    if (pathname.startsWith('/library/detections/') && pathname.endsWith('/edit')) {
      return { title: 'Edit Detection', description: undefined };
    }
    if (pathname.startsWith('/library/detections/')) {
      return { title: 'Detection Details', description: undefined };
    }
    if (pathname.startsWith('/packs/')) {
      return { title: 'Pack Details', description: undefined };
    }
    if (pathname.startsWith('/intelligence/strategies/')) {
      return { title: 'Strategy Details', description: undefined };
    }
    if (pathname.startsWith('/intelligence/groups/')) {
      return { title: 'Group Profile', description: undefined };
    }
    if (pathname.startsWith('/intelligence/software/')) {
      return { title: 'Software Profile', description: undefined };
    }
    if (pathname.startsWith('/intelligence/campaigns/')) {
      return { title: 'Campaign Profile', description: undefined };
    }
    if (pathname.startsWith('/intelligence/mitigations/')) {
      return { title: 'Mitigation Details', description: undefined };
    }
    if (pathname.startsWith('/intelligence/threat-digest/')) {
      return { title: 'Report Analysis', description: undefined };
    }
    if (pathname.startsWith('/dashboard/enterprise')) {
      return routeHeaders[ROUTES.ENTERPRISE_DASHBOARD];
    }

    return { title: 'Optimus', description: undefined };
  }, [location.pathname]);

  // Map current route to view for sidebar
  const currentView = useMemo(() => {
    return matchRouteToNavItem(location.pathname) || 'dashboard';
  }, [location.pathname]);

  // Handle sidebar navigation
  const handleNavigate = (view: string) => {
    const route = viewToRoute[view];
    if (route) {
      navigate(route);
    }
  };

  // Handle new detection
  const handleNewDetection = () => {
    navigate(ROUTES.DETECTION_NEW);
  };

  // Handle search navigation
  const handleSearchNavigation = (type: 'detection' | 'group' | 'software' | 'campaign' | 'technique', id: string) => {
    switch (type) {
      case 'detection':
        navigate(routeHelpers.detectionDetail(id));
        break;
      case 'group':
        navigate(routeHelpers.groupDetail(id));
        break;
      case 'software':
        navigate(routeHelpers.softwareDetail(id));
        break;
      case 'campaign':
        navigate(routeHelpers.campaignDetail(id));
        break;
      case 'technique':
        navigate(routeHelpers.libraryWithFilter(id));
        break;
    }
  };

  // Handle detection navigation by ID
  const handleNavigateToDetectionById = async (detectionId: string) => {
    navigate(routeHelpers.detectionDetail(detectionId));
  };

  // Handle submissions navigation
  const handleNavigateToSubmissions = () => {
    navigate(ROUTES.SUBMISSIONS);
  };

  return (
    <div className="flex h-screen bg-background text-on-background">
      {/* Skip to content link for keyboard/screen reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-on-primary focus:rounded-xl focus:text-sm focus:font-medium focus:shadow-lg"
      >
        Skip to main content
      </a>
      <Sidebar
        onNavigate={handleNavigate}
        onNewDetection={handleNewDetection}
        currentView={currentView as any}
        detections={detections}
        userRole={profile.role}
        userEmail={user.email!}
        profile={profile}
        onSignOut={onSignOut}
        onNavigateToSubmissions={handleNavigateToSubmissions}
        isMobileOpen={isMobileSidebarOpen}
        onMobileToggle={() => setIsMobileSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          title={pageHeader.title}
          description={pageHeader.description}
          detections={detections}
          onNavigate={handleSearchNavigation}
          onNavigateToDetection={handleNavigateToDetectionById}
          onNavigateToNotifications={() => navigate(ROUTES.NOTIFICATIONS)}
          onMobileMenuToggle={() => setIsMobileSidebarOpen(true)}
          rightSlot={
            AI_ROUTE_PREFIXES.some(p => location.pathname.startsWith(p))
              ? <BudgetIndicator />
              : undefined
          }
        />
        <div className="flex-1 overflow-hidden relative">
          {/* Concave corners: SVG overlays matching header bg, creates inward curves at top of content */}
          <svg
            className="absolute top-0 left-0 z-[70] pointer-events-none"
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M28 0H0V28C0 12.536 12.536 0 28 0Z"
              style={{ fill: 'rgb(var(--md-sys-color-surface-container-low))' }}
            />
          </svg>
          <svg
            className="absolute top-0 right-0 z-[70] pointer-events-none"
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M0 0H28V28C28 12.536 15.464 0 0 0Z"
              style={{ fill: 'rgb(var(--md-sys-color-surface-container-low))' }}
            />
          </svg>
          <main id="main-content" className="h-full overflow-y-auto scroll-smooth scrollbar-page" role="main">
            <InterruptedImportBanner />
            <div key={location.pathname} className="animate-page-enter h-full">
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
                <Outlet />
              </Suspense>
            </div>
          </main>
          {/* Individual pages handle their own loading/skeleton states */}
          <GlobalImportBar />
          <ImportNavigationModal
            isOpen={navigationBlocker.isBlocked}
            onStay={() => navigationBlocker.reset()}
            onBackground={() => {
              minimize();
              navigationBlocker.proceed();
            }}
            onStop={() => {
              // For onboarding processing: just proceed — OnboardingProvider unmounts and cleans up
              // For global import: abort the import first
              if (navigationBlocker.activeBlockerId !== 'onboarding-processing') {
                abortImport();
              }
              navigationBlocker.proceed();
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
