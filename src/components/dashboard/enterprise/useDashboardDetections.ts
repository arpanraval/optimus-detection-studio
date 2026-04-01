// Centralized hook for scope-filtered detections in enterprise dashboards.
// All dashboard widgets should use this instead of useAppData() directly.

import { useMemo } from 'react';
import { useAppData } from '../../../router/AppDataContext';
import { useDashboard } from './DashboardContext';

export function useDashboardDetections() {
  const { detections } = useAppData();
  const { state } = useDashboard();

  const filtered = useMemo(() => {
    if (state.scopeFilter === 'all') return detections;
    return detections.filter(d => d.library_type !== 'development');
  }, [detections, state.scopeFilter]);

  return { detections: filtered, scopeFilter: state.scopeFilter };
}
