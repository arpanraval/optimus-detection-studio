// ============================================================================
// WIDGET CHROME — wrapper providing drag handle, title bar, settings, remove
// ============================================================================

import React, { Component, Suspense } from 'react';
import { useDashboard } from './DashboardContext';
import { widgetRegistry } from './widgets/registry';
import type { WidgetInstance, WidgetComponentProps, WidgetConfig } from './widgets/types';
import { isEngineConfig } from './engine/types';
import { ConfigurableWidget } from './engine/ConfigurableWidget';
import WidgetErrorFallback from './widgets/WidgetErrorFallback';

// ---------------------------------------------------------------------------
// Error Boundary
// ---------------------------------------------------------------------------

interface EBProps { children: React.ReactNode; widgetId: string }
interface EBState { error: Error | null }

class WidgetErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <WidgetErrorFallback
          error={this.state.error}
          resetErrorBoundary={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

interface WidgetChromeProps {
  widget: WidgetInstance;
  onNavigate: (view: string, filter?: any) => void;
}

const WidgetChrome: React.FC<WidgetChromeProps> = ({ widget, onNavigate }) => {
  const { state, dispatch, resolvedTimeRange } = useDashboard();
  const engineWidget = isEngineConfig(widget.config);
  const entry = engineWidget ? null : widgetRegistry[widget.type];
  const isEditMode = state.isEditMode;

  if (!engineWidget && !entry) {
    return (
      <div className="h-full flex items-center justify-center text-[11px] text-on-surface-variant/40 font-brand">
        Unknown widget: {widget.type}
      </div>
    );
  }

  // Narrow config type for each branch
  const specializedConfig = !engineWidget ? widget.config as WidgetConfig : null;
  const title = engineWidget && isEngineConfig(widget.config)
    ? widget.config.title
    : (specializedConfig!.titleOverride || entry!.displayName);
  const WidgetComponent = entry?.component;

  return (
    <div className={`h-full flex flex-col bg-surface-container-lowest rounded-2xl transition-shadow ${isEditMode ? 'overflow-visible' : 'overflow-hidden'}`}
      data-widget-type={widget.type}
      style={{
        ...('accentColor' in widget.config && widget.config.accentColor ? { '--widget-accent': widget.config.accentColor } as React.CSSProperties : {}),
        ...(isEditMode ? { boxShadow: '0 0 0 1px rgb(var(--md-sys-color-outline-variant) / 0.3)', position: 'relative' as const, zIndex: 0 } : {}),
      }}
    >
      {/* Header — always visible title; drag/settings/remove only in edit mode */}
      <div className={`flex items-center gap-2 px-3 flex-shrink-0 ${isEditMode ? 'py-2 border-b border-outline-variant/10' : 'pt-3 pb-0'}`}>
        <div className={`flex items-center gap-1 flex-1 min-w-0 ${isEditMode ? 'widget-drag-handle cursor-grab active:cursor-grabbing' : ''}`}>
          {isEditMode && <span className="text-on-surface-variant/30 text-[14px] select-none">⠿</span>}
          <span className="text-[13px] font-brand font-extrabold text-on-surface truncate uppercase tracking-wider">
            {title}
          </span>
        </div>
        {isEditMode && (
          <>
            <button
              onClick={() => dispatch({ type: 'OPEN_SETTINGS', widgetId: widget.id })}
              className="text-on-surface-variant/40 hover:text-on-surface transition-colors p-0.5"
              title="Widget settings"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <button
              onClick={() => dispatch({ type: 'REMOVE_WIDGET', widgetId: widget.id })}
              className="text-on-surface-variant/40 hover:text-error transition-colors p-0.5"
              title="Remove widget"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Widget content */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <WidgetErrorBoundary widgetId={widget.id}>
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
              </div>
            }
          >
            {engineWidget && isEngineConfig(widget.config) ? (
              <ConfigurableWidget
                key={`${widget.id}-engine-${state.refreshTick}`}
                config={widget.config}
                timeRange={resolvedTimeRange}
                onNavigate={onNavigate}
              />
            ) : WidgetComponent && specializedConfig ? (
              <WidgetComponent
                key={`${widget.id}-${specializedConfig.accentColor || ''}-${specializedConfig.chartVariant || ''}-${specializedConfig.titleOverride || ''}-${specializedConfig.maxItems ?? ''}-${specializedConfig.fontSize || ''}-${specializedConfig.alignment || ''}-${specializedConfig.numberFormat || ''}-${state.refreshTick}`}
                widgetId={widget.id}
                config={specializedConfig}
                isEditMode={isEditMode}
                onNavigate={onNavigate}
                timeRange={resolvedTimeRange}
              />
            ) : null}
          </Suspense>
        </WidgetErrorBoundary>
      </div>
    </div>
  );
};

export default WidgetChrome;
