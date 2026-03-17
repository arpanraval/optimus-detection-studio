// ============================================================================
// WIDGET CATALOG — slide-over drawer for adding widgets to the dashboard
// ============================================================================

import React, { useMemo } from 'react';
import { useDashboard } from './DashboardContext';
import { getWidgetsByCategory, widgetRegistry, CATEGORY_LABELS, type WidgetRegistryEntry } from './widgets/registry';
import type { WidgetCategory, WidgetLayoutItem, WidgetConfig } from './widgets/types';
import { WidgetQueryBuilder } from './engine/WidgetQueryBuilder';
import type { EngineWidgetConfig } from './engine/types';

const SIZE_PRESETS = [
  { label: 'S', w: 3, h: 2, desc: '3×2' },
  { label: 'M', w: 6, h: 3, desc: '6×3' },
  { label: 'L', w: 6, h: 4, desc: '6×4' },
  { label: 'Full', w: 12, h: 4, desc: '12×4' },
];

const WidgetCatalog: React.FC = () => {
  const { state, dispatch, activeDashboard } = useDashboard();
  const [showBuilder, setShowBuilder] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [sizePickerFor, setSizePickerFor] = React.useState<WidgetRegistryEntry | null>(null);

  if (!state.catalogOpen || !activeDashboard) return null;

  const categories = getWidgetsByCategory();
  const existingTypes = new Set(activeDashboard.widgets.map(w => w.type));
  const query = search.toLowerCase().trim();

  const handleAdd = (entry: WidgetRegistryEntry, sizeOverride?: { w: number; h: number }) => {
    const id = `w-${crypto.randomUUID()}`;

    const maxY = activeDashboard!.layouts.lg.reduce(
      (max, l) => Math.max(max, l.y + l.h),
      0,
    );

    const w = sizeOverride?.w ?? entry.defaultSize.w;
    const h = sizeOverride?.h ?? entry.defaultSize.h;

    const layout: WidgetLayoutItem = {
      i: id,
      x: 0,
      y: maxY,
      w,
      h,
      minW: entry.minSize.w,
      minH: entry.minSize.h,
      ...(entry.maxSize ? { maxW: entry.maxSize.w, maxH: entry.maxSize.h } : {}),
    };

    dispatch({
      type: 'ADD_WIDGET',
      widget: {
        id,
        type: entry.type,
        config: { ...entry.defaultConfig } as WidgetConfig,
      },
      layout,
    });
    setSizePickerFor(null);
  };

  const handleBuilderSave = (config: EngineWidgetConfig) => {
    const id = `w-${crypto.randomUUID()}`;
    const maxY = activeDashboard.layouts.lg.reduce((max, l) => Math.max(max, l.y + l.h), 0);
    const layout: WidgetLayoutItem = {
      i: id, x: 0, y: maxY, w: 4, h: 3, minW: 2, minH: 2,
    };
    dispatch({
      type: 'ADD_WIDGET',
      widget: { id, type: 'engine-widget', config },
      layout,
    });
    setShowBuilder(false);
  };

  // Filter entries by search query
  const filterEntry = (entry: WidgetRegistryEntry) => {
    if (!query) return true;
    return (
      entry.displayName.toLowerCase().includes(query) ||
      entry.description.toLowerCase().includes(query) ||
      entry.type.toLowerCase().includes(query)
    );
  };

  const hasResults = Object.values(categories).some(entries => entries.some(filterEntry));

  return (
    <>
      <div className="fixed inset-0 z-50 flex justify-end" onClick={() => dispatch({ type: 'CLOSE_CATALOG' })}>
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/30" />

        {/* Panel */}
        <div
          className="relative w-[340px] bg-surface-container h-full flex flex-col shadow-xl animate-slide-in-right"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10 shrink-0">
            <h3 className="text-[14px] font-brand font-bold text-on-surface">Add Widget</h3>
            <button
              onClick={() => dispatch({ type: 'CLOSE_CATALOG' })}
              className="text-on-surface-variant/40 hover:text-on-surface transition-colors p-1"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Create Custom + Search */}
          <div className="px-4 py-3 space-y-2.5 border-b border-outline-variant/10 shrink-0">
            <button
              onClick={() => setShowBuilder(true)}
              className="w-full py-2 text-[12px] font-medium text-on-primary bg-primary hover:bg-primary/90 rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create Custom Widget
            </button>
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/30" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search widgets..."
                className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-surface-container-lowest border border-outline-variant/20 rounded-lg text-on-surface placeholder:text-on-surface-variant/30 outline-none focus:border-outline-variant/40 transition-colors"
              />
            </div>
          </div>

          {/* Widget list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {!hasResults && query && (
              <div className="text-center py-8">
                <div className="text-[12px] text-on-surface-variant/50">No widgets match &ldquo;{search}&rdquo;</div>
              </div>
            )}

            {(Object.entries(categories) as [WidgetCategory, WidgetRegistryEntry[]][]).map(([category, entries]) => {
              const filtered = entries.filter(filterEntry);
              if (filtered.length === 0) return null;
              return (
                <div key={category}>
                  <div className="text-[9px] font-bold text-on-surface-variant/40 uppercase tracking-wider mb-1.5">
                    {CATEGORY_LABELS[category]}
                  </div>
                  <div className="space-y-1">
                    {filtered.map(entry => {
                      const alreadyExists = existingTypes.has(entry.type);
                      return (
                        <div
                          key={entry.type}
                          className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/10 hover:border-outline-variant/30 transition-colors"
                        >
                          <span className="text-[14px] flex-shrink-0">{entry.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-medium text-on-surface leading-tight">{entry.displayName}</div>
                            <div className="text-[9px] text-on-surface-variant/50 truncate leading-tight mt-0.5">{entry.description}</div>
                            {/* Inline size picker */}
                            {sizePickerFor?.type === entry.type && (
                              <div className="flex gap-1 mt-1.5">
                                {SIZE_PRESETS.map(sp => (
                                  <button
                                    key={sp.label}
                                    onClick={(e) => { e.stopPropagation(); handleAdd(entry, { w: sp.w, h: sp.h }); }}
                                    className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-surface-container-lowest text-on-surface-variant hover:bg-primary hover:text-on-primary border border-outline-variant/20 transition-colors"
                                    title={sp.desc}
                                  >
                                    {sp.label}
                                  </button>
                                ))}
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleAdd(entry); }}
                                  className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-primary/20 text-primary hover:bg-primary hover:text-on-primary border border-primary/30 transition-colors"
                                  title={`Default (${entry.defaultSize.w}×${entry.defaultSize.h})`}
                                >
                                  Default
                                </button>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => sizePickerFor?.type === entry.type ? setSizePickerFor(null) : setSizePickerFor(entry)}
                            className={`px-2 py-0.5 text-[9px] font-bold rounded transition-colors flex-shrink-0 ${
                              alreadyExists
                                ? 'text-on-surface-variant/40 bg-surface-container hover:bg-surface-container-highest hover:text-on-surface'
                                : 'text-on-primary bg-primary hover:bg-primary/90'
                            }`}
                          >
                            {alreadyExists ? '+ Another' : 'Add'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
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

      {/* Query builder opens as a separate centered modal */}
      {showBuilder && (
        <WidgetQueryBuilder
          onSave={handleBuilderSave}
          onCancel={() => setShowBuilder(false)}
        />
      )}
    </>
  );
};

export default WidgetCatalog;
