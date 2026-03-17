// ============================================================================
// WIDGET SETTINGS PANEL — right-side slide-over for per-widget config
// ============================================================================

import React from 'react';
import { useDashboard } from './DashboardContext';
import { widgetRegistry } from './widgets/registry';
import type { ChartVariant, WidgetFontSize, WidgetAlignment, WidgetNumberFormat } from './widgets/types';
import { isEngineConfig } from './engine/types';
import type { EngineWidgetConfig } from './engine/types';
import type { WidgetConfig } from './widgets/types';
import { WidgetQueryBuilder } from './engine/WidgetQueryBuilder';

const COLOR_SWATCHES = [
  { name: 'Blue', value: 'rgb(var(--md-ext-color-blue))' },
  { name: 'Green', value: 'rgb(var(--md-ext-color-green))' },
  { name: 'Amber', value: 'rgb(var(--md-ext-color-amber))' },
  { name: 'Coral', value: 'rgb(var(--md-ext-color-coral))' },
  { name: 'Indigo', value: 'rgb(var(--md-ext-color-indigo))' },
  { name: 'Teal', value: 'rgb(var(--md-ext-color-teal))' },
  { name: 'Orange', value: 'rgb(var(--md-ext-color-orange))' },
  { name: 'Violet', value: 'rgb(var(--md-ext-color-violet))' },
  { name: 'Cyan', value: 'rgb(var(--md-ext-color-cyan))' },
  { name: 'Rose', value: 'rgb(var(--md-ext-color-rose))' },
];

const CHART_LABELS: Record<ChartVariant, string> = {
  bar: 'Bar',
  line: 'Line',
  area: 'Area',
  pie: 'Pie',
  donut: 'Donut',
  radar: 'Radar',
  heatmap: 'Heatmap',
  sparkline: 'Sparkline',
};

const FONT_SIZES: { value: WidgetFontSize; label: string }[] = [
  { value: 'sm', label: 'S' },
  { value: 'md', label: 'M' },
  { value: 'lg', label: 'L' },
  { value: 'xl', label: 'XL' },
];

const ALIGNMENTS: { value: WidgetAlignment; label: string; icon: React.ReactNode }[] = [
  {
    value: 'left',
    label: 'Left',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="18" y2="18" /></svg>,
  },
  {
    value: 'center',
    label: 'Center',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg>,
  },
  {
    value: 'right',
    label: 'Right',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="9" y1="12" x2="21" y2="12" /><line x1="6" y1="18" x2="21" y2="18" /></svg>,
  },
];

// ---------------------------------------------------------------------------
// Shared display settings section (used by both specialized + engine)
// ---------------------------------------------------------------------------

const DisplaySettings: React.FC<{
  fontSize?: WidgetFontSize;
  alignment?: WidgetAlignment;
  numberFormat?: WidgetNumberFormat;
  showComparison?: boolean;
  hasComparison: boolean;
  onUpdate: (updates: Record<string, unknown>) => void;
}> = ({ fontSize, alignment, numberFormat, showComparison, hasComparison, onUpdate }) => (
  <div className="space-y-4">
    <div className="text-[10px] font-brand font-bold text-on-surface-variant/40 uppercase tracking-wider">
      Display
    </div>

    {/* Font Size */}
    <div>
      <label className="text-[10px] font-brand font-bold text-on-surface-variant/40 uppercase tracking-wider">
        Font Size
      </label>
      <div className="flex gap-1.5 mt-1.5">
        {FONT_SIZES.map(fs => (
          <button
            key={fs.value}
            onClick={() => onUpdate({ fontSize: fs.value })}
            className={`flex-1 py-1.5 text-[12px] font-brand font-bold rounded-lg transition-all ${
              (fontSize || 'xl') === fs.value
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface border border-outline-variant/20'
            }`}
          >
            {fs.label}
          </button>
        ))}
      </div>
    </div>

    {/* Alignment */}
    <div>
      <label className="text-[10px] font-brand font-bold text-on-surface-variant/40 uppercase tracking-wider">
        Alignment
      </label>
      <div className="flex gap-1.5 mt-1.5">
        {ALIGNMENTS.map(a => (
          <button
            key={a.value}
            onClick={() => onUpdate({ alignment: a.value })}
            className={`flex-1 flex items-center justify-center py-1.5 rounded-lg transition-all ${
              (alignment || 'center') === a.value
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface border border-outline-variant/20'
            }`}
            title={a.label}
          >
            {a.icon}
          </button>
        ))}
      </div>
    </div>

    {/* Number Format */}
    <div>
      <label className="text-[10px] font-brand font-bold text-on-surface-variant/40 uppercase tracking-wider">
        Number Format
      </label>
      <div className="flex gap-1.5 mt-1.5">
        <button
          onClick={() => onUpdate({ numberFormat: 'full' })}
          className={`flex-1 py-1.5 text-[11px] font-brand font-medium rounded-lg transition-all ${
            (numberFormat || 'full') === 'full'
              ? 'bg-primary text-on-primary'
              : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface border border-outline-variant/20'
          }`}
        >
          1,234
        </button>
        <button
          onClick={() => onUpdate({ numberFormat: 'compact' })}
          className={`flex-1 py-1.5 text-[11px] font-brand font-medium rounded-lg transition-all ${
            numberFormat === 'compact'
              ? 'bg-primary text-on-primary'
              : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface border border-outline-variant/20'
          }`}
        >
          1.2K
        </button>
      </div>
    </div>

    {/* Show Comparison */}
    {hasComparison && (
      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={showComparison !== false}
          onChange={e => onUpdate({ showComparison: e.target.checked })}
          className="accent-primary w-4 h-4 rounded"
        />
        <span className="text-[11px] font-brand font-medium text-on-surface">
          Show comparison vs previous period
        </span>
      </label>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Widget size controls
// ---------------------------------------------------------------------------

const SizeControls: React.FC<{
  widgetId: string;
}> = ({ widgetId }) => {
  const { activeDashboard, dispatch } = useDashboard();
  if (!activeDashboard) return null;

  const layout = activeDashboard.layouts.lg.find(l => l.i === widgetId);
  if (!layout) return null;

  const setSize = (w: number, h: number) => {
    const newLayouts = {
      lg: activeDashboard.layouts.lg.map(l => l.i === widgetId ? { ...l, w, h } : l),
      md: activeDashboard.layouts.md.map(l => l.i === widgetId ? { ...l, w: Math.min(w, 8), h } : l),
      sm: activeDashboard.layouts.sm.map(l => l.i === widgetId ? { ...l, w: Math.min(w, 4), h } : l),
      xs: activeDashboard.layouts.xs.map(l => l.i === widgetId ? { ...l, w: 2, h } : l),
    };
    dispatch({ type: 'UPDATE_LAYOUTS', layouts: newLayouts });
  };

  return (
    <div>
      <label className="text-[10px] font-brand font-bold text-on-surface-variant/40 uppercase tracking-wider">
        Widget Size
      </label>
      <div className="grid grid-cols-2 gap-2 mt-1.5">
        <div>
          <span className="text-[9px] font-brand text-on-surface-variant/40 uppercase tracking-wider">Width</span>
          <div className="flex items-center gap-1 mt-1">
            <input
              type="range"
              min={layout.minW || 2}
              max={12}
              value={layout.w}
              onChange={e => setSize(parseInt(e.target.value), layout.h)}
              className="flex-1 accent-primary h-1.5"
            />
            <span className="text-[11px] font-brand font-medium text-on-surface w-6 text-right">{layout.w}</span>
          </div>
        </div>
        <div>
          <span className="text-[9px] font-brand text-on-surface-variant/40 uppercase tracking-wider">Height</span>
          <div className="flex items-center gap-1 mt-1">
            <input
              type="range"
              min={layout.minH || 1}
              max={8}
              value={layout.h}
              onChange={e => setSize(layout.w, parseInt(e.target.value))}
              className="flex-1 accent-primary h-1.5"
            />
            <span className="text-[11px] font-brand font-medium text-on-surface w-6 text-right">{layout.h}</span>
          </div>
        </div>
      </div>
      {/* Quick presets */}
      <div className="flex gap-1.5 mt-2">
        {[
          { label: 'Small', w: 3, h: 2 },
          { label: 'Medium', w: 6, h: 3 },
          { label: 'Large', w: 6, h: 4 },
          { label: 'Full', w: 12, h: 4 },
        ].map(p => (
          <button
            key={p.label}
            onClick={() => setSize(p.w, p.h)}
            className={`flex-1 py-1 text-[9px] font-brand font-bold rounded-lg transition-all uppercase tracking-wider ${
              layout.w === p.w && layout.h === p.h
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface border border-outline-variant/20'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

const WidgetSettingsPanel: React.FC = () => {
  const { state, dispatch, activeDashboard } = useDashboard();
  const widgetId = state.settingsWidgetId;
  const [editingQuery, setEditingQuery] = React.useState(false);

  React.useEffect(() => {
    setEditingQuery(false);
  }, [widgetId]);

  if (!widgetId || !activeDashboard) return null;

  const widget = activeDashboard.widgets.find(w => w.id === widgetId);
  if (!widget) return null;

  const engineWidget = isEngineConfig(widget.config);
  const entry = engineWidget ? null : widgetRegistry[widget.type];
  if (!engineWidget && !entry) return null;

  const config = widget.config;
  const specializedConfig = !engineWidget ? config as WidgetConfig : null;
  const engineConfig = engineWidget ? config as EngineWidgetConfig : null;

  const updateConfig = (updates: Record<string, unknown>) => {
    dispatch({ type: 'UPDATE_WIDGET_CONFIG', widgetId, config: updates });
  };

  // Determine if widget has comparison capability
  const hasComparison = engineWidget
    ? (engineConfig?.visualization === 'single-metric' || engineConfig?.visualization === 'progress-bar')
    : Boolean(widget.type.startsWith('counter-'));

  return (
    <>
      <div className="fixed inset-0 z-50 flex justify-end" onClick={() => dispatch({ type: 'CLOSE_SETTINGS' })}>
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/30" />

        {/* Panel */}
        <div
          className="relative w-80 bg-surface-container h-full overflow-y-auto shadow-xl animate-slide-in-right"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
            <div>
              <h3 className="text-[13px] font-brand font-bold text-on-surface">Widget Settings</h3>
              <span className="text-[9px] font-brand text-on-surface-variant/40 tracking-wide">Changes apply instantly</span>
            </div>
            <button
              onClick={() => dispatch({ type: 'CLOSE_SETTINGS' })}
              className="text-on-surface-variant/40 hover:text-on-surface transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {engineWidget ? (
            <div className="px-5 py-4 space-y-6">
              <div>
                <div className="text-[10px] font-brand font-bold text-on-surface-variant/40 uppercase tracking-wider mb-1">Custom Widget</div>
                <div className="text-[13px] font-brand font-medium text-on-surface">{engineConfig!.title || 'Untitled'}</div>
              </div>
              <button
                onClick={() => setEditingQuery(true)}
                className="w-full py-2.5 text-[12px] font-brand font-bold text-on-primary bg-primary hover:bg-primary/90 rounded-lg transition-colors"
              >
                Edit Query
              </button>

              {/* Accent Color (for engine widgets too) */}
              <div>
                <label className="text-[10px] font-brand font-bold text-on-surface-variant/40 uppercase tracking-wider">
                  Accent Color
                </label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  <button
                    onClick={() => updateConfig({ accentColor: undefined })}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      !engineConfig?.accentColor ? 'border-on-surface scale-110' : 'border-outline-variant/30 hover:scale-105'
                    }`}
                    style={{ background: 'linear-gradient(135deg, rgb(var(--md-sys-color-primary)), rgb(var(--md-sys-color-tertiary)))' }}
                    title="Default"
                  />
                  {COLOR_SWATCHES.map(c => (
                    <button
                      key={c.name}
                      onClick={() => updateConfig({ accentColor: c.value })}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        engineConfig?.accentColor === c.value ? 'border-on-surface scale-110' : 'border-outline-variant/30 hover:scale-105'
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              {/* Display settings */}
              <DisplaySettings
                fontSize={engineConfig?.fontSize}
                alignment={engineConfig?.alignment}
                numberFormat={engineConfig?.numberFormat}
                showComparison={engineConfig?.showComparison}
                hasComparison={hasComparison}
                onUpdate={updateConfig}
              />

              {/* Widget Size */}
              <SizeControls widgetId={widgetId} />

              <div className="pt-4 border-t border-outline-variant/10">
                <button
                  onClick={() => { dispatch({ type: 'REMOVE_WIDGET', widgetId }); dispatch({ type: 'CLOSE_SETTINGS' }); }}
                  className="w-full py-2.5 text-[12px] font-brand font-bold text-error/70 hover:text-error bg-error/5 hover:bg-error/10 rounded-lg transition-colors"
                >
                  Remove Widget
                </button>
              </div>
            </div>
          ) : (
            <div className="px-5 py-4 space-y-6">
              {/* Widget info */}
              <div>
                <div className="text-[10px] font-brand font-bold text-on-surface-variant/40 uppercase tracking-wider mb-1">Widget</div>
                <div className="text-[13px] font-brand font-medium text-on-surface">{entry!.displayName}</div>
                <div className="text-[11px] font-brand text-on-surface-variant/50 mt-0.5">{entry!.description}</div>
              </div>

              {/* Title Override */}
              <div>
                <label className="text-[10px] font-brand font-bold text-on-surface-variant/40 uppercase tracking-wider">
                  Custom Title
                </label>
                <input
                  value={specializedConfig?.titleOverride || ''}
                  onChange={e => updateConfig({ titleOverride: e.target.value || undefined })}
                  placeholder={entry!.displayName}
                  className="w-full mt-1 px-3 py-2 text-[12px] font-brand bg-surface-container-lowest border border-outline-variant/20 rounded-lg text-on-surface outline-none focus:border-primary transition-colors"
                />
              </div>

              {/* Chart Type Switcher */}
              {entry!.supportedChartVariants.length > 1 && (
                <div>
                  <label className="text-[10px] font-brand font-bold text-on-surface-variant/40 uppercase tracking-wider">
                    Chart Type
                  </label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {entry!.supportedChartVariants.map(variant => (
                      <button
                        key={variant}
                        onClick={() => updateConfig({ chartVariant: variant })}
                        className={`px-3 py-1.5 text-[11px] font-brand font-medium rounded-lg transition-all ${
                          (specializedConfig?.chartVariant || entry!.supportedChartVariants[0]) === variant
                            ? 'bg-primary text-on-primary'
                            : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface border border-outline-variant/20'
                        }`}
                      >
                        {CHART_LABELS[variant]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Accent Color */}
              <div>
                <label className="text-[10px] font-brand font-bold text-on-surface-variant/40 uppercase tracking-wider">
                  Accent Color
                </label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  <button
                    onClick={() => updateConfig({ accentColor: undefined })}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      !specializedConfig?.accentColor ? 'border-on-surface scale-110' : 'border-outline-variant/30 hover:scale-105'
                    }`}
                    style={{ background: 'linear-gradient(135deg, rgb(var(--md-sys-color-primary)), rgb(var(--md-sys-color-tertiary)))' }}
                    title="Default"
                  />
                  {COLOR_SWATCHES.map(c => (
                    <button
                      key={c.name}
                      onClick={() => updateConfig({ accentColor: c.value })}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        specializedConfig?.accentColor === c.value ? 'border-on-surface scale-110' : 'border-outline-variant/30 hover:scale-105'
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              {/* Display settings */}
              <DisplaySettings
                fontSize={specializedConfig?.fontSize}
                alignment={specializedConfig?.alignment}
                numberFormat={specializedConfig?.numberFormat}
                showComparison={specializedConfig?.showComparison}
                hasComparison={hasComparison}
                onUpdate={updateConfig}
              />

              {/* Widget Size */}
              <SizeControls widgetId={widgetId} />

              {/* Max Items */}
              <div>
                <label className="text-[10px] font-brand font-bold text-on-surface-variant/40 uppercase tracking-wider">
                  Max Items
                </label>
                <input
                  type="number"
                  min={1}
                  max={25}
                  value={specializedConfig?.maxItems ?? ''}
                  onChange={e => {
                    const v = parseInt(e.target.value, 10);
                    updateConfig({ maxItems: isNaN(v) ? undefined : Math.max(1, Math.min(25, v)) });
                  }}
                  placeholder="Default"
                  className="w-full mt-1 px-3 py-2 text-[12px] font-brand bg-surface-container-lowest border border-outline-variant/20 rounded-lg text-on-surface outline-none focus:border-primary transition-colors"
                />
              </div>

              {/* Remove widget */}
              <div className="pt-4 border-t border-outline-variant/10">
                <button
                  onClick={() => { dispatch({ type: 'REMOVE_WIDGET', widgetId }); dispatch({ type: 'CLOSE_SETTINGS' }); }}
                  className="w-full py-2.5 text-[12px] font-brand font-bold text-error/70 hover:text-error bg-error/5 hover:bg-error/10 rounded-lg transition-colors"
                >
                  Remove Widget
                </button>
              </div>
            </div>
          )}
        </div>

        <style>{`
          @keyframes slide-in-right {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
          .animate-slide-in-right {
            animation: slide-in-right 200ms ease-out;
          }
        `}</style>
      </div>

      {/* Query builder opens as a separate centered modal (above the panel z-index) */}
      {editingQuery && engineWidget && (
        <WidgetQueryBuilder
          initialConfig={widget.config as EngineWidgetConfig}
          onSave={(newConfig) => {
            dispatch({ type: 'UPDATE_WIDGET_CONFIG', widgetId, config: newConfig });
            setEditingQuery(false);
          }}
          onCancel={() => setEditingQuery(false)}
        />
      )}

    </>
  );
};

export default WidgetSettingsPanel;
