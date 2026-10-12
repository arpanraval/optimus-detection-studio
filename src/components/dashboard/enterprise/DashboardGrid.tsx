// ============================================================================
// DASHBOARD GRID — react-grid-layout v2 responsive wrapper
// ============================================================================

import React, { useCallback, useMemo } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout/legacy';
import type { Layout, ResponsiveLayouts as RGLResponsiveLayouts } from 'react-grid-layout/legacy';
import { useDashboard } from './DashboardContext';
import WidgetChrome from './WidgetChrome';
import { PagePending } from '@/components/ui/PagePending';
import { LoadError } from '@/components/ui/LoadError';
import { useAppData } from '@/router/AppDataContext';
import type { ResponsiveLayouts } from './widgets/types';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface DashboardGridProps {
  onNavigate: (view: string, filter?: any) => void;
}

const DashboardGrid: React.FC<DashboardGridProps> = ({ onNavigate }) => {
  const { state, dispatch, activeDashboard } = useDashboard();
  const appData = useAppData();

  const layouts = useMemo(() => {
    if (!activeDashboard) return { lg: [], md: [], sm: [], xs: [] } as unknown as RGLResponsiveLayouts;
    return activeDashboard.layouts as unknown as RGLResponsiveLayouts;
  }, [activeDashboard]);

  const handleLayoutChange = useCallback(
    (_currentLayout: Layout, allLayouts: RGLResponsiveLayouts) => {
      if (!state.isEditMode) return;
      dispatch({
        type: 'UPDATE_LAYOUTS',
        layouts: allLayouts as unknown as ResponsiveLayouts,
      });
    },
    [state.isEditMode, dispatch],
  );

  if (state.isLoading && !activeDashboard) return <PagePending layout="dashboard" />;
  if (appData.isLoading && appData.detections.length === 0) return <PagePending layout="dashboard" />;
  if (appData.loadError && appData.detections.length === 0) {
    return <LoadError label={appData.loadError} onRetry={() => window.location.reload()} />;
  }

  if (!activeDashboard || activeDashboard.widgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-[13px] font-brand font-medium text-on-surface-variant/50 mb-3">
          This dashboard is empty
        </p>
        <button
          onClick={() => dispatch({ type: 'OPEN_CATALOG' })}
          className="px-4 py-2 rounded-full text-[12px] font-brand font-medium text-on-primary bg-primary hover:bg-primary/90 transition-colors"
        >
          Add Widgets
        </button>
      </div>
    );
  }

  return (
    <ResponsiveGridLayout
      layouts={layouts}
      breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
      cols={{ lg: 12, md: 8, sm: 4, xs: 2 }}
      rowHeight={80}
      margin={[8, 8]}
      compactType="vertical"
      useCSSTransforms={true}
      isDraggable={state.isEditMode}
      isResizable={state.isEditMode}
      resizeHandles={['se', 's', 'e']}
      draggableHandle=".widget-drag-handle"
      onLayoutChange={handleLayoutChange}
    >
      {activeDashboard.widgets.map(widget => (
        <div key={widget.id} className="relative" data-widget-type={widget.type}>
          <WidgetChrome widget={widget} onNavigate={onNavigate} />
        </div>
      ))}
    </ResponsiveGridLayout>
  );
};

export default DashboardGrid;
