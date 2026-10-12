import { matchPath } from 'react-router-dom';
import type { LoadingLayout } from '@/components/ui/PagePending';

// Keep route fallback metadata independent of lazy page imports.
export const loadingLayouts: ReadonlyArray<{ path: string; layout: LoadingLayout }> = [
  {
    path: '/dashboard/enterprise',
    layout: 'dashboard',
  },
  {
    path: '/dashboard/enterprise/:dashboardId',
    layout: 'dashboard',
  },
  {
    path: '/library',
    layout: 'list',
  },
  {
    path: '/library/detections/new',
    layout: 'form',
  },
  {
    path: '/library/detections/:id',
    layout: 'detail',
  },
  {
    path: '/library/detections/:id/edit',
    layout: 'form',
  },
  {
    path: '/packs',
    layout: 'list',
  },
  {
    path: '/packs/:id',
    layout: 'detail',
  },
  {
    path: '/intelligence/mitre',
    layout: 'matrix',
  },
  {
    path: '/intelligence/posture',
    layout: 'dashboard',
  },
  {
    path: '/intelligence/strategies',
    layout: 'list',
  },
  {
    path: '/intelligence/strategies/:id',
    layout: 'detail',
  },
  {
    path: '/intelligence/groups',
    layout: 'list',
  },
  {
    path: '/intelligence/groups/:id',
    layout: 'detail',
  },
  {
    path: '/intelligence/software',
    layout: 'list',
  },
  {
    path: '/intelligence/software/:id',
    layout: 'detail',
  },
  {
    path: '/intelligence/campaigns',
    layout: 'list',
  },
  {
    path: '/intelligence/campaigns/:id',
    layout: 'detail',
  },
  {
    path: '/intelligence/mitigations',
    layout: 'list',
  },
  {
    path: '/intelligence/mitigations/:id',
    layout: 'detail',
  },
  {
    path: '/intelligence/threat-digest',
    layout: 'list',
  },
  {
    path: '/intelligence/threat-digest/campaign/:id',
    layout: 'detail',
  },
  {
    path: '/intelligence/threat-digest/:id',
    layout: 'detail',
  },
  {
    path: '/intelligence/research',
    layout: 'list',
  },
  {
    path: '/intelligence/research/:id',
    layout: 'detail',
  },
  {
    path: '/intelligence/feeds',
    layout: 'list',
  },
  {
    path: '/intelligence/reports',
    layout: 'list',
  },
  {
    path: '/intelligence/reports/:id',
    layout: 'detail',
  },
  {
    path: '/arsenal/sigma',
    layout: 'detail',
  },
  {
    path: '/arsenal/ai-query',
    layout: 'detail',
  },
  {
    path: '/arsenal/optimus',
    layout: 'detail',
  },
  {
    path: '/arsenal/bulk-import',
    layout: 'detail',
  },
  {
    path: '/arsenal/import-history',
    layout: 'list',
  },
  {
    path: '/arsenal/playbooks',
    layout: 'detail',
  },
  {
    path: '/settings/integrations',
    layout: 'list',
  },
  {
    path: '/settings/integrations/:id',
    layout: 'detail',
  },
  {
    path: '/settings/scoring',
    layout: 'form',
  },
  {
    path: '/settings/users',
    layout: 'list',
  },
  {
    path: '/settings/data-sync',
    layout: 'list',
  },
  {
    path: '/settings/audit-log',
    layout: 'list',
  },
  {
    path: '/settings/environment',
    layout: 'form',
  },
  {
    path: '/settings/auto-digest',
    layout: 'form',
  },
  {
    path: '/settings/cost-center',
    layout: 'dashboard',
  },
  {
    path: '/siem',
    layout: 'list',
  },
  {
    path: '/siem/:id',
    layout: 'detail',
  },
  {
    path: '/search',
    layout: 'list',
  },
  {
    path: '/action-plan',
    layout: 'dashboard',
  },
  {
    path: '/action-plan/preview',
    layout: 'dashboard',
  },
  {
    path: '/action-plan/technology/:slug',
    layout: 'dashboard',
  },
  {
    path: '/action-plan/threat/:slug',
    layout: 'dashboard',
  },
  {
    path: '/exercises/state-sponsored',
    layout: 'list',
  },
  {
    path: '/library/board',
    layout: 'board',
  },
  {
    path: '/onboarding',
    layout: 'detail',
  },
  {
    path: '/new-landing',
    layout: 'detail',
  },
  {
    path: '/account',
    layout: 'form',
  },
  {
    path: '/account/ai-usage',
    layout: 'dashboard',
  },
  {
    path: '/submissions',
    layout: 'list',
  },
  {
    path: '/approval-queue',
    layout: 'list',
  },
  {
    path: '/notifications',
    layout: 'list',
  },
];

export function getLoadingLayout(pathname: string): LoadingLayout {
  return loadingLayouts.find((route) => matchPath({ path: route.path, end: true }, pathname))?.layout ?? 'list';
}
