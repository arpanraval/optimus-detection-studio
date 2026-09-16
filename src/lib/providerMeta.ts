import React from 'react';
import {
  SiGithub,
  SiGitlab,
  SiSplunk,
  SiElastic,
  SiJira,
} from '@icons-pack/react-simple-icons';

// SiSlack was removed from @icons-pack/react-simple-icons v13+
// Use inline SVG component instead
const SiSlack: React.FC<React.SVGProps<SVGSVGElement>> = (props) =>
  React.createElement('svg', { viewBox: '0 0 24 24', fill: 'currentColor', ...props },
    React.createElement('path', { d: 'M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z' })
  );
import type { Integration, IntegrationProvider } from '../types';

// =============================================================================
// CUSTOM SVG ICONS (for brands not in simple-icons package)
// =============================================================================

export const AzureDevOpsIcon: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = '#0078D4' }) =>
  React.createElement('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: color },
    React.createElement('path', { d: 'M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 15.707zm24-4.45v14.651l-5.753 4.9-9.303-3.057v3.056l-5.978-7.416 15.057 1.798V5.415z' })
  );

export const SentinelIcon: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = '#0078D4' }) =>
  React.createElement('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: color },
    React.createElement('path', { d: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 3.18l6 2.67v4.59c0 3.83-2.62 7.43-6 8.43-3.38-1-6-4.6-6-8.43V6.85l6-2.67zm-1 5.32v6h2v-6h-2zm0-3v2h2v-2h-2z' })
  );

export const DefenderXdrIcon: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = '#0078D4' }) =>
  React.createElement('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: color },
    React.createElement('path', { d: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z' })
  );

export const CrowdStrikeIcon: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = '#FF0000' }) =>
  React.createElement('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: color },
    React.createElement('path', { d: 'M9.194 0C6.786 1.727 4.678 4.122 4.678 7.479c0 1.986.626 3.263 1.548 4.392-.183-.885-.273-1.7-.273-2.439 0-3.994 2.554-6.186 4.764-7.802l-1.523-1.63zm6.227.472c.107 1.468.16 2.768.16 3.922 0 7.167-3.012 10.676-5.445 12.969-2.447-1.075-5.125-2.96-5.125-7.168 0-.203.009-.413.025-.627-.896 1.629-1.376 3.393-1.376 5.145 0 5.212 4.092 7.779 6.4 8.857l.192.08c.939-.437 2.231-1.148 3.531-2.195 2.996-2.412 5.556-6.323 5.556-12.687 0-3.113-.817-5.72-2.234-7.817l-1.684-.479z' })
  );

export const ChronicleIcon: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = '#4285F4' }) =>
  React.createElement('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: color },
    React.createElement('path', { d: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z' })
  );

// =============================================================================
// PROVIDER METADATA
// =============================================================================

export interface ProviderMeta {
  id: IntegrationProvider;
  name: string;
  description: string;
  category: 'version-control' | 'siem' | 'automation';
  IconComponent: React.ComponentType<{ size?: number; color?: string; className?: string }>;
  brandColor: string;
  useDefaultColor?: boolean;
  comingSoon?: boolean;
  queryLanguages?: string[];
  logoPath: string;
  logoPathLight?: string;
  /** Mirrors the server-owned import provider registry
   *  (`supabase/functions/_shared/siem-providers.ts` — `IMPORT_PROVIDERS`). This flag is a
   *  compiled reflection of what the durable import engine actually supports server-side; the
   *  frontend only *renders* this capability (choosing which panel to show) and never grants
   *  it — the backend independently enforces which providers it will import from regardless of
   *  what this flag says. */
  nativeImportSupported?: boolean;
}

export const PROVIDER_META: ProviderMeta[] = [
  // Version Control
  {
    id: 'github',
    name: 'GitHub',
    description: 'Sync detection rules with GitHub repositories for version control and CI/CD.',
    category: 'version-control',
    IconComponent: SiGithub,
    brandColor: '#181717',
    useDefaultColor: true,
    logoPath: '/logos/integrations/github.svg',
    logoPathLight: '/logos/integrations/github-light.svg',
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'Connect to GitLab for detection-as-code workflows and merge request reviews.',
    category: 'version-control',
    IconComponent: SiGitlab,
    brandColor: '#FC6D26',
    useDefaultColor: true,
    logoPath: '/logos/integrations/gitlab.svg',
  },
  {
    id: 'azure_devops',
    name: 'Azure DevOps',
    description: 'Integrate with Azure Repos and Pipelines for enterprise detection management.',
    category: 'version-control',
    IconComponent: AzureDevOpsIcon,
    brandColor: '#0078D4',
    comingSoon: true,
    logoPath: '/logos/integrations/azure-devops.svg',
  },

  // SIEM & Data Platforms
  {
    id: 'splunk',
    name: 'Splunk',
    description: 'Deploy SPL queries directly to Splunk Enterprise or Splunk Cloud.',
    category: 'siem',
    IconComponent: SiSplunk,
    brandColor: '#000000',
    useDefaultColor: true,
    queryLanguages: ['SPL'],
    logoPath: '/logos/integrations/splunk.svg',
    nativeImportSupported: true,
  },
  {
    id: 'sentinel',
    name: 'Microsoft Sentinel',
    description: 'Push KQL analytics rules to Microsoft Sentinel workspaces.',
    category: 'siem',
    IconComponent: SentinelIcon,
    brandColor: '#0078D4',
    queryLanguages: ['KQL'],
    logoPath: '/logos/integrations/sentinel.svg',
    nativeImportSupported: true,
  },
  {
    id: 'defender_xdr',
    name: 'Microsoft Defender XDR',
    description: 'Deploy custom detection rules to Microsoft Defender XDR advanced hunting.',
    category: 'siem',
    IconComponent: DefenderXdrIcon,
    brandColor: '#0078D4',
    queryLanguages: ['KQL'],
    logoPath: '/logos/integrations/defender-xdr.svg',
    nativeImportSupported: true,
  },
  {
    id: 'elastic',
    name: 'Elastic Security',
    description: 'Export detection rules to Elastic Security in Lucene, EQL, or ES|QL format.',
    category: 'siem',
    IconComponent: SiElastic,
    brandColor: '#005571',
    useDefaultColor: true,
    queryLanguages: ['Lucene', 'EQL', 'ES|QL'],
    logoPath: '/logos/integrations/elastic.svg',
    nativeImportSupported: true,
  },
  {
    id: 'crowdstrike',
    name: 'CrowdStrike Falcon',
    description: 'Deploy CQL correlation rules to CrowdStrike Falcon Next-Gen SIEM.',
    category: 'siem',
    IconComponent: CrowdStrikeIcon,
    brandColor: '#FF0000',
    queryLanguages: ['CQL'],
    logoPath: '/logos/integrations/crowdstrike.svg',
    nativeImportSupported: true,
  },
  {
    id: 'chronicle',
    name: 'Google SecOps',
    description: 'Deploy YARA-L detection rules to Google Security Operations (Chronicle).',
    category: 'siem',
    IconComponent: ChronicleIcon,
    brandColor: '#4285F4',
    queryLanguages: ['YARA-L'],
    logoPath: '/logos/integrations/chronicle.svg',
    nativeImportSupported: true,
  },

  // Automation & Response
  {
    id: 'jira',
    name: 'Jira',
    description: 'Create and track detection engineering tickets in Jira.',
    category: 'automation',
    IconComponent: SiJira,
    brandColor: '#0052CC',
    useDefaultColor: true,
    logoPath: '/logos/integrations/jira.svg',
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Get notifications for detection deployments and coverage changes.',
    category: 'automation',
    IconComponent: SiSlack,
    brandColor: '#4A154B',
    useDefaultColor: true,
    logoPath: '/logos/integrations/slack.svg',
  },
];

// =============================================================================
// HELPERS
// =============================================================================

export function getProviderMeta(id: IntegrationProvider): ProviderMeta | undefined {
  return PROVIDER_META.find(p => p.id === id);
}

/** Whether the native import panel (live inventory + import-into-library) is available for this
 *  provider. This renders a server-owned capability — see `ProviderMeta.nativeImportSupported` —
 *  it never grants one. A provider without this capability keeps its existing legacy tab. */
export function supportsNativeImport(id: IntegrationProvider): boolean {
  return getProviderMeta(id)?.nativeImportSupported === true;
}

export type DisplayStatus = 'connected' | 'configured' | 'error' | 'available' | 'coming-soon';

export function getDisplayStatus(
  providerMeta: ProviderMeta,
  dbIntegration?: Integration
): DisplayStatus {
  if (providerMeta.comingSoon) return 'coming-soon';
  if (!dbIntegration) return 'available';
  const s = dbIntegration.status;
  if (s === 'connected') return 'connected';
  if (s === 'error') return 'error';
  if (s === 'configured' || s === 'testing') return 'configured';
  if (s === 'disabled') return 'available';
  return 'available';
}

// =============================================================================
// STATUS BADGE CONFIG — uses brand design tokens
// =============================================================================

export const STATUS_BADGE_CONFIG: Record<DisplayStatus, { label: string; className: string }> = {
  'connected':   { label: 'Connected',   className: 'bg-[#4D7C6F]/15 text-[#4D7C6F] border-[#4D7C6F]/20' },
  'configured':  { label: 'Configured',  className: 'bg-amber-500/15 text-amber-600 border-amber-500/20' },
  'error':       { label: 'Error',       className: 'bg-[#A63D40]/15 text-[#A63D40] border-[#A63D40]/20' },
  'available':   { label: 'Available',   className: 'bg-surface-container-highest text-on-surface-variant border-outline-variant/20' },
  'coming-soon': { label: 'Coming Soon', className: 'bg-surface-container-highest text-on-surface-variant/60 border-outline-variant/15' },
};
