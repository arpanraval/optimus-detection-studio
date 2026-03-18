import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from './Icon';
import { Detection, Role, Profile } from '../types';
import { useLibrary } from '../context/LibraryContext';
import { useTheme } from '../context/ThemeContext';
import { viewToRoute, ROUTES } from '../router/routes';
import { readDashboardSummaries } from './dashboard/enterprise/dashboardPersistence';

type View = 'dashboard' | 'command-center' | 'dashboard-classic' | 'intel-globe' | 'library' | 'detail' | 'form' | 'mitre' | 'coverage' | 'groups' | 'group-detail' | 'software' | 'software-detail' | 'campaigns' | 'campaign-detail' | 'mitigations' | 'mitigation-detail' | 'detection-strategies' | 'strategy-detail' | 'users' | 'add_selection' | 'sigma_converter' | 'ai_query_gen' | 'ai_agent' | 'bulk_import' | 'integrations' | 'approval_queue' | 'my_submissions' | 'account_settings' | 'mitre_data_sync' | 'packs' | 'pack-detail' | 'workspaces' | 'workspace-detail' | 'defensive-posture' | 'scoring_settings' | 'threat-intel' | 'design-system' | 'design-system-buttons' | 'design-system-inputs' | 'design-system-badges' | 'design-system-cards' | 'design-system-navigation' | 'design-system-modals' | 'design-system-dropdowns' | 'design-system-loading' | 'design-system-misc' | 'design-system-colors' | 'design-system-bulk-import' | 'design-system-logo' | 'design-system-ai-chat-cards' | 'audit_log' | 'environment_profile' | 'pipeline' | 'onboarding' | 'action_plan' | 'exercises-state-sponsored';

// Avatar colors
const AVATAR_COLORS = [
  { bg: 'bg-violet-500/15', text: 'text-violet-400' },
  { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  { bg: 'bg-cyan-500/15', text: 'text-cyan-400' },
  { bg: 'bg-teal-500/15', text: 'text-teal-400' },
  { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  { bg: 'bg-rose-500/15', text: 'text-rose-400' },
  { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-400' },
];

const getAvatarColor = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

interface SidebarProps {
  onNavigate: (view: View) => void;
  onNewDetection: () => void;
  currentView: View;
  detections: Detection[];
  userRole: Role;
  userEmail: string;
  profile?: Profile | null;
  onSignOut: () => void;
  onNavigateToSubmissions?: () => void;
  isMobileOpen?: boolean;
  onMobileToggle?: () => void;
}

interface NavSubItem {
  id: View;
  label: string;
  badge?: number;
  url?: string; // Custom URL (overrides viewToRoute[id])
}

interface NavSection {
  id: string;
  label: string;
  icon: string;
  items: NavSubItem[];
  singleAction?: View;
  activeClass: string;
  inactiveClass?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onNavigate,
  onNewDetection,
  currentView,
  userRole,
  userEmail,
  profile,
  onSignOut,
  onNavigateToSubmissions,
  isMobileOpen = false,
  onMobileToggle,
}) => {
  const { pendingRequests } = useLibrary();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const pendingCount = pendingRequests?.length || 0;
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const userHoveredSectionRef = useRef(false); // tracks if user explicitly hovered a rail item
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // User display info
  const displayName = profile?.full_name || userEmail.split('@')[0];
  const nameParts = displayName.trim().split(/\s+/);
  const initials = nameParts.length >= 2
    ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
    : displayName.slice(0, 2).toUpperCase();
  const avatarColor = getAvatarColor(userEmail);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navSections = getNavSections(userRole, pendingCount);

  // Handle mouse enter - expand immediately
  const handleMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    userHoveredSectionRef.current = false; // reset — auto-expand active section until user hovers a specific item
    setIsHovered(true);
  }, []);

  // Handle mouse leave - collapse with delay to prevent flickering
  const handleMouseLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
      setExpandedSection(null);
    }, 200);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Auto-expand the active section on initial sidebar hover (before user hovers a specific item)
  useEffect(() => {
    if (!isHovered || userHoveredSectionRef.current) return;
    for (const section of navSections) {
      if (section.items.some(item => isItemActive(item.id, currentView, item.url, location.pathname))) {
        setExpandedSection(section.id);
        return;
      }
    }
  }, [currentView, isHovered, navSections]);

  // Handle hovering over a rail item - expand if it has sub-items
  const handleRailItemHover = (section: NavSection) => {
    userHoveredSectionRef.current = true; // user explicitly chose a section — don't auto-override
    if (section.items.length > 0) {
      setExpandedSection(section.id);
    } else {
      setExpandedSection(null);
    }
  };

  // Check if the click is a modified click (Ctrl, Meta, Shift, or middle-click)
  // If so, let the browser handle it natively (open in new tab) and skip programmatic navigation
  const isModifiedClick = (e: React.MouseEvent) =>
    e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1;

  const handleRailClick = (section: NavSection) => {
    if (section.singleAction) {
      if (section.id === 'new-detection') {
        onNewDetection();
      } else {
        onNavigate(section.singleAction);
      }
      setExpandedSection(null);
    } else if (section.items.length > 0) {
      // If clicking on section with items, navigate to first item
      if (section.items[0]) {
        onNavigate(section.items[0].id);
      }
    }
  };

  const handleDrawerItemClick = (item: NavSubItem) => {
    if (!item.url) {
      onNavigate(item.id);
    }
    // Items with custom urls navigate via the Link component's `to` prop
    setExpandedSection(null);
  };

  const isSectionActive = (section: NavSection): boolean => {
    if (section.singleAction) return isItemActive(section.singleAction, currentView);
    return section.items.some(item => isItemActive(item.id, currentView, item.url, location.pathname));
  };

  const expandedSectionData = expandedSection ? navSections.find(s => s.id === expandedSection) : null;

  const getSectionBadge = (section: NavSection): number | undefined => {
    const total = section.items.reduce((sum, item) => sum + (item.badge || 0), 0);
    return total > 0 ? total : undefined;
  };

  // Resolve the route URL for a rail section
  const getRailSectionUrl = (section: NavSection): string => {
    if (section.id === 'new-detection') return ROUTES.DETECTION_NEW;
    if (section.singleAction) return viewToRoute[section.singleAction] || '/';
    if (section.items.length > 0) return viewToRoute[section.items[0].id] || '/';
    return '/';
  };

  const railWidth = 72;
  const drawerWidth = 200;
  const showDrawer = isHovered && expandedSectionData && expandedSectionData.items.length > 0;

  // Close mobile sidebar on navigation
  const handleMobileNavigate = (view: View) => {
    onNavigate(view);
    onMobileToggle?.();
  };

  const handleMobileNewDetection = () => {
    onNewDetection();
    onMobileToggle?.();
  };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onMobileToggle}
          aria-hidden="true"
        />
      )}
    <aside
      className={`
        flex h-full flex-shrink-0 z-40
        md:relative md:translate-x-0
        ${isMobileOpen ? 'fixed inset-y-0 left-0 translate-x-0' : 'hidden md:flex'}
        transition-transform duration-200 ease-out
      `}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label="Main navigation"
    >
      {/* Navigation Rail */}
      <div
        className="flex flex-col h-full bg-surface-container-low flex-shrink-0 transition-all duration-200"
        style={{ width: railWidth }}
      >
        {/* Logo */}
        <div className="flex items-center justify-center pt-3 pb-5">
          <Link
            to={ROUTES.DASHBOARD}
            className="cursor-pointer group no-underline text-inherit flex items-center justify-center"
            onClick={(e) => { if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) { onNavigate('dashboard'); setExpandedSection(null); } }}
          >
            <Icon name="optimus-logo" className="w-11 h-11 group-hover:scale-105 transition-transform" />
          </Link>
        </div>

        {/* Rail Items */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pt-1" aria-label="Primary">
          <div className="flex flex-col gap-1">
            {navSections.map((section) => {
              const isActive = isSectionActive(section);
              const isExpanded = expandedSection === section.id;
              const badge = getSectionBadge(section);

              return (
                <Link
                  key={section.id}
                  to={getRailSectionUrl(section)}
                  onClick={(e) => {
                    if (section.id === 'new-detection') {
                      e.preventDefault();
                      onNewDetection();
                    } else if (!isModifiedClick(e)) {
                      handleRailClick(section);
                    }
                  }}
                  onMouseEnter={() => handleRailItemHover(section)}
                  title={!isHovered ? section.label : undefined}
                  className={`
                    group flex flex-col items-center justify-center no-underline
                    w-full py-2 rounded-xl gap-1 transition-all duration-150
                    ${isActive
                      ? section.activeClass
                      : isExpanded
                        ? 'bg-surface-container-highest/60 text-on-surface'
                        : section.inactiveClass || 'text-on-surface-variant hover:bg-surface-container-high/50 hover:text-on-surface'
                    }
                  `}
                >
                  <div className="relative">
                    <Icon name={section.icon} className="w-5 h-5" />
                    {badge !== undefined && badge > 0 && (
                      <span className="absolute -top-1.5 -right-2.5 min-w-[14px] h-[14px] px-0.5 text-[8px] font-bold bg-error text-on-error rounded-full flex items-center justify-center">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-medium leading-tight text-center">
                    {section.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer - Theme Toggle & User */}
        <div className="px-2 py-4 mb-4 border-t border-outline-variant/20 flex flex-col gap-2">
          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            onMouseEnter={() => setExpandedSection(null)}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-10 h-10 mx-auto rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high/50 transition-colors"
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="w-5 h-5" />
          </button>

          {/* User Dropdown */}
          <div className="relative flex justify-center" ref={userDropdownRef}>
            <button
              onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
              onMouseEnter={() => setExpandedSection(null)}
              title={displayName}
              aria-label={`User menu for ${displayName}`}
              aria-expanded={isUserDropdownOpen}
              aria-haspopup="true"
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold transition-all ${avatarColor.bg} ${avatarColor.text} hover:brightness-110 shadow-sm`}
            >
              {initials}
            </button>

            {isUserDropdownOpen && (
              <div className="absolute left-full bottom-0 ml-2 w-64 bg-surface-container-high rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-left-1 duration-100 border border-outline-variant/10" role="menu" aria-label="User menu">
                {/* Profile */}
                <div className="p-4 bg-surface-container border-b border-outline-variant/10">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold ${avatarColor.bg} ${avatarColor.text}`}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">{displayName}</p>
                      <p className="text-xs text-on-surface-variant/60 truncate">{userEmail}</p>
                    </div>
                  </div>
                  <span className="inline-flex mt-3 px-2 py-0.5 text-[10px] font-medium rounded-md bg-surface-container-highest text-on-surface-variant capitalize border border-outline-variant/20">
                    {userRole}
                  </span>
                </div>

                {/* Menu */}
                <div className="p-1.5">
                  {onNavigateToSubmissions && (
                    <Link
                      to={viewToRoute['my_submissions'] || '/'}
                      onClick={(e) => { setIsUserDropdownOpen(false); if (!isModifiedClick(e)) onNavigateToSubmissions(); }}
                      role="menuitem"
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg text-on-surface hover:bg-surface-container-highest/70 transition-colors no-underline"
                    >
                      <Icon name="send" className="w-4 h-4 opacity-70" />
                      My Submissions
                    </Link>
                  )}
                  <Link
                    to={viewToRoute['account_settings'] || '/'}
                    onClick={(e) => { setIsUserDropdownOpen(false); if (!isModifiedClick(e)) onNavigate('account_settings'); }}
                    role="menuitem"
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg text-on-surface hover:bg-surface-container-highest/70 transition-colors no-underline"
                  >
                    <Icon name="settings" className="w-4 h-4 opacity-70" />
                    Account Settings
                  </Link>
                  <div className="my-1.5 mx-2 h-px bg-outline-variant/10" />
                  <button
                    onClick={() => { setIsUserDropdownOpen(false); onSignOut(); }}
                    role="menuitem"
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg text-error hover:bg-error/10 transition-colors"
                  >
                    <Icon name="logout" className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Drawer Panel - Slides in on hover */}
      <div
        className={`
          flex flex-col h-full bg-surface-container-low border-r border-outline-variant/10
          transition-all duration-200 ease-out overflow-hidden
          ${showDrawer ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        style={{ width: showDrawer ? drawerWidth : 0 }}
      >
        {expandedSectionData && (
          <>
            {/* Section Title - Matches Header Height */}
            <div className="h-16 px-4 flex items-center border-b border-outline-variant/10">
              <span className="text-sm font-semibold text-on-surface whitespace-nowrap">{expandedSectionData.label}</span>
            </div>

            {/* Sub Items */}
            <div className="flex-1 overflow-y-auto px-2 py-2">
              <div className="flex flex-col gap-0.5">
                {expandedSectionData.items.map((item, idx) => {
                  const isActive = isItemActive(item.id, currentView, item.url, location.pathname);
                  return (
                    <Link
                      key={item.url || item.id + '-' + idx}
                      to={item.url || viewToRoute[item.id] || '/'}
                      onClick={(e) => { if (!isModifiedClick(e)) handleDrawerItemClick(item); }}
                      className={`
                        flex items-center w-full h-9 px-3 rounded-lg text-[13px] transition-colors whitespace-nowrap no-underline
                        ${isActive
                          ? expandedSectionData.activeClass
                          : 'text-on-surface-variant hover:bg-surface-container-high/70 hover:text-on-surface'
                        }
                      `}
                    >
                      <span className="flex-1 text-left truncate">{item.label}</span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="ml-2 min-w-[18px] h-[18px] px-1 text-[9px] font-bold bg-amber-500 text-white rounded-full flex items-center justify-center">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
    </>
  );
};

function isItemActive(itemId: View, currentView: View, itemUrl?: string, pathname?: string): boolean {
  // URL-based matching takes priority (for dynamic dashboard items)
  if (itemUrl && pathname) return pathname === itemUrl;
  if (itemId === currentView) return true;
  if (itemId === 'library' && currentView === 'detail') return true;
  if (itemId === 'groups' && currentView === 'group-detail') return true;
  if (itemId === 'software' && currentView === 'software-detail') return true;
  if (itemId === 'campaigns' && currentView === 'campaign-detail') return true;
  if (itemId === 'mitigations' && currentView === 'mitigation-detail') return true;
  if (itemId === 'detection-strategies' && currentView === 'strategy-detail') return true;
  if (itemId === 'packs' && currentView === 'pack-detail') return true;
  if (itemId === 'workspaces' && currentView === 'workspace-detail') return true;
  if (itemId === 'add_selection' && currentView === 'form') return true;
  return false;
}

function getNavSections(userRole: Role, pendingCount: number): NavSection[] {
  const isAdmin = userRole === 'owner' || userRole === 'admin';
  
  const sections: NavSection[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: 'dashboard',
      items: [
        { id: 'command-center' as View, label: 'Command Center' },
        // Dynamic enterprise dashboards from localStorage
        ...readDashboardSummaries().map(d => ({
          id: 'enterprise-dashboard' as View,
          label: d.name,
          url: `/dashboard/enterprise/${d.id}`,
        })),
        { id: 'dashboard-classic' as View, label: 'Classic Dashboard' },
        { id: 'intel-globe' as View, label: 'Intel Globe' },
      ],
      activeClass: 'bg-secondary-container text-on-secondary-container',
    },
    {
      id: 'new-detection',
      label: 'New',
      icon: 'plus-circle',
      singleAction: 'add_selection' as View,
      items: [],
      activeClass: 'bg-primary-container text-on-primary-container',
      inactiveClass: 'text-primary hover:bg-primary-container/20',
    },
    {
      id: 'detections',
      label: 'Detections',
      icon: 'library',
      items: [
        { id: 'library' as View, label: 'Detection Library' },
        { id: 'packs' as View, label: 'Detection Packs' },
        { id: 'onboarding' as View, label: 'Detection Onboarding' },
        ...(isAdmin ? [{ id: 'approval_queue' as View, label: 'Approval Queue', badge: pendingCount }] : []),
      ],
      activeClass: 'bg-[#1a3a4a] text-cyan-200',
    },
    {
      id: 'pipeline',
      label: 'Pipeline',
      icon: 'pipeline',
      singleAction: 'pipeline' as View,
      items: [],
      activeClass: 'bg-[#1a2a4a] text-blue-200',
    },
    {
      id: 'action-plan',
      label: 'Action Plan',
      icon: 'shield',
      singleAction: 'action_plan' as View,
      items: [],
      activeClass: 'bg-[#1a3a2a] text-emerald-200',
    },
    {
      id: 'exercises',
      label: 'Exercises',
      icon: 'crosshairs',
      items: [
        { id: 'exercises-state-sponsored' as View, label: 'State Sponsored Attack', url: '/exercises/state-sponsored' },
      ],
      activeClass: 'bg-[#3a1a1a] text-red-200',
    },
    {
      id: 'mitre',
      label: 'Intelligence',
      icon: 'crosshairs',
      items: [
        { id: 'mitre' as View, label: 'ATT&CK Matrix' },
        { id: 'coverage' as View, label: 'Coverage Analytics' },
        { id: 'defensive-posture' as View, label: 'Defensive Posture' },
        { id: 'detection-strategies' as View, label: 'Detection Strategies' },
        { id: 'groups' as View, label: 'Threat Groups' },
        { id: 'campaigns' as View, label: 'Campaigns' },
        { id: 'software' as View, label: 'Software' },
        { id: 'mitigations' as View, label: 'Mitigations' },
        { id: 'threat-intel' as View, label: 'Intelligence Reports' },
      ],
      activeClass: 'bg-[#1a3a3a] text-teal-200',
    },
    {
      id: 'arsenal',
      label: 'Arsenal',
      icon: 'spark',
      items: [
        { id: 'sigma_converter' as View, label: 'Sigma Converter' },
        { id: 'ai_query_gen' as View, label: 'AI Query Generator' },
        { id: 'ai_agent' as View, label: 'Optimus Prime' },
        { id: 'playbooks' as View, label: 'Playbooks' },
        { id: 'bulk_import' as View, label: 'Bulk Import' },
      ],
      activeClass: 'bg-[#2a2a3a] text-violet-200',
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: 'settings',
      items: [
        { id: 'integrations' as View, label: 'Integrations' },
        { id: 'environment_profile' as View, label: 'Environment' },
        { id: 'scoring_settings' as View, label: 'Defense Impact Intelligence' },
        ...(isAdmin ? [{ id: 'users' as View, label: 'User Management' }] : []),
        ...(isAdmin ? [{ id: 'mitre_data_sync' as View, label: 'Data Sync' }] : []),
        ...(isAdmin ? [{ id: 'audit_log' as View, label: 'Audit Log' }] : []),
      ],
      activeClass: 'bg-[#2a2a2a] text-slate-200',
    },
    {
      id: 'design-system',
      label: 'Design',
      icon: 'palette',
      items: [
        { id: 'design-system' as View, label: 'Overview' },
        { id: 'design-system-buttons' as View, label: 'Buttons' },
        { id: 'design-system-inputs' as View, label: 'Inputs' },
        { id: 'design-system-badges' as View, label: 'Badges & Chips' },
        { id: 'design-system-cards' as View, label: 'Cards' },
        { id: 'design-system-navigation' as View, label: 'Navigation' },
        { id: 'design-system-modals' as View, label: 'Modals' },
        { id: 'design-system-dropdowns' as View, label: 'Dropdowns' },
        { id: 'design-system-loading' as View, label: 'Loading' },
        { id: 'design-system-misc' as View, label: 'Miscellaneous' },
        { id: 'design-system-colors' as View, label: 'Color System' },
        { id: 'design-system-bulk-import' as View, label: 'Bulk Import UI' },
        { id: 'design-system-logo' as View, label: 'Logo Options' },
        { id: 'design-system-mitre-tooltip' as View, label: 'MITRE Tooltip' },
        { id: 'design-system-intel-cards' as View, label: 'Intel Cards' },
        { id: 'design-system-ai-chat-cards' as View, label: 'AI Chat Cards' },
      ],
      activeClass: 'bg-[#2a2a3a] text-pink-200',
    },
  ];

  return sections.filter(s => s.singleAction || s.items.length > 0);
}

export default Sidebar;
