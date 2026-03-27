// ============================================================================
// DASHBOARD TOOLBAR — tabs, edit toggle, undo/redo, add widget, export
// ============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from './DashboardContext';
import { DASHBOARD_PRESETS } from './presets';
import type { DashboardDefinition, WidgetInstance, WidgetLayoutItem } from './widgets/types';
import { saveDashboard, deleteDashboard } from './dashboardPersistence';
import TimeRangeDropdown from './TimeRangeBar';

interface DashboardToolbarProps {
  userId: string | null;
}

const DashboardToolbar: React.FC<DashboardToolbarProps> = ({ userId }) => {
  const navigate = useNavigate();
  const { state, dispatch, activeDashboard } = useDashboard();
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createPreset, setCreatePreset] = useState(DASHBOARD_PRESETS[0].id);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showDashMenu, setShowDashMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dashMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingNameId && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingNameId]);

  // Close dashboard menu on outside click
  useEffect(() => {
    if (!showDashMenu) return;
    const handler = (e: MouseEvent) => {
      if (dashMenuRef.current && !dashMenuRef.current.contains(e.target as Node)) {
        setShowDashMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDashMenu]);

  // Close export menu on outside click
  useEffect(() => {
    if (!showExportMenu) return;
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExportMenu]);

  const handleCreate = () => {
    const preset = DASHBOARD_PRESETS.find(p => p.id === createPreset) || DASHBOARD_PRESETS[0];
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const def: DashboardDefinition = {
      id,
      ...preset.create(id),
      name: createName.trim() || preset.name,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    dispatch({ type: 'CREATE_DASHBOARD', dashboard: def });
    setShowCreate(false);
    setCreateName('');
  };

  const handleDelete = (dashId: string) => {
    if (state.dashboards.length <= 1) return;
    if (!confirm('Delete this dashboard?')) return;
    dispatch({ type: 'DELETE_DASHBOARD', id: dashId });
    deleteDashboard(dashId, userId);
  };

  const handleRenameSubmit = () => {
    if (editingNameId && editingName.trim()) {
      dispatch({ type: 'RENAME_DASHBOARD', id: editingNameId, name: editingName.trim() });
    }
    setEditingNameId(null);
  };

  const handleSetDefault = (dashId: string) => {
    dispatch({ type: 'SET_DEFAULT_DASHBOARD', id: dashId });
  };

  // Save current edits as a new dashboard copy
  const handleSaveAsCopy = useCallback(() => {
    if (!activeDashboard) return;
    const newId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Deep-clone widgets with new IDs, and update layout references
    const idMap = new Map<string, string>();
    const newWidgets: WidgetInstance[] = activeDashboard.widgets.map(w => {
      const newWidgetId = crypto.randomUUID();
      idMap.set(w.id, newWidgetId);
      return { ...w, id: newWidgetId, config: { ...w.config } };
    });

    const remapLayout = (items: WidgetLayoutItem[]) =>
      items.map(l => ({ ...l, i: idMap.get(l.i) || l.i }));

    const newDash: DashboardDefinition = {
      id: newId,
      name: `${activeDashboard.name} (Copy)`,
      isDefault: false,
      widgets: newWidgets,
      layouts: {
        lg: remapLayout(activeDashboard.layouts.lg),
        md: remapLayout(activeDashboard.layouts.md),
        sm: remapLayout(activeDashboard.layouts.sm),
        xs: remapLayout(activeDashboard.layouts.xs),
      },
      createdAt: now,
      updatedAt: now,
    };

    dispatch({ type: 'SAVE_AS_COPY', newDashboard: newDash });
    saveDashboard(newDash, userId);
  }, [activeDashboard, dispatch, userId]);

  // ---------------------------------------------------------------------------
  // Export helpers (canvas-level operations for PDF pagination)
  // ---------------------------------------------------------------------------

  /** Scan a horizontal line of pixels and return true if it's mostly the background color (gap between widgets). */
  const isGapRow = (ctx: CanvasRenderingContext2D, y: number, width: number, bgR: number, bgG: number, bgB: number): boolean => {
    const data = ctx.getImageData(0, y, width, 1).data;
    let bgCount = 0;
    const samples = Math.floor(width / 4);
    for (let i = 0; i < samples; i++) {
      const off = i * 4 * 4;
      const dr = Math.abs(data[off] - bgR);
      const dg = Math.abs(data[off + 1] - bgG);
      const db = Math.abs(data[off + 2] - bgB);
      if (dr < 30 && dg < 30 && db < 30) bgCount++;
    }
    return bgCount / samples > 0.85;
  };

  /** Find the best page-break Y near `idealY` by scanning for a gap row between widgets. */
  const findBreakPoint = (ctx: CanvasRenderingContext2D, width: number, idealY: number, maxY: number, bgR: number, bgG: number, bgB: number): number => {
    const searchRange = Math.floor(idealY * 0.15);
    for (let y = Math.floor(idealY); y > idealY - searchRange && y > 0; y--) {
      if (isGapRow(ctx, y, width, bgR, bgG, bgB)) return y;
    }
    for (let y = Math.floor(idealY) + 1; y < idealY + searchRange && y < maxY; y++) {
      if (isGapRow(ctx, y, width, bgR, bgG, bgB)) return y;
    }
    return Math.min(Math.floor(idealY), maxY);
  };

  /** Trim trailing empty rows from the canvas, returning the actual content height. */
  const trimCanvasHeight = (ctx: CanvasRenderingContext2D, width: number, height: number, bgR: number, bgG: number, bgB: number): number => {
    for (let y = height - 1; y > 0; y--) {
      if (!isGapRow(ctx, y, width, bgR, bgG, bgB)) return y + 4;
    }
    return height;
  };

  // Export dashboard as PNG or PDF
  const handleExport = useCallback(async (format: 'png' | 'pdf') => {
    setShowExportMenu(false);
    setExporting(true);

    try {
      const exportEl = document.querySelector('[data-dashboard-export]') as HTMLElement;
      if (!exportEl) {
        alert('Dashboard content not found');
        return;
      }

      const dashName = activeDashboard?.name || 'Dashboard';
      const timestamp = new Date().toISOString().slice(0, 10);

      // 1. Inject export styles: hide scrollbars, force 6-col stat grid, hide quick-actions
      const exportStyle = document.createElement('style');
      exportStyle.setAttribute('data-export-style', '');
      exportStyle.textContent = `
        [data-dashboard-export] *::-webkit-scrollbar { display: none !important; }
        [data-dashboard-export] * { scrollbar-width: none !important; }
        [data-dashboard-export] .grid-cols-3.lg\\:grid-cols-6 { grid-template-columns: repeat(6, minmax(0, 1fr)) !important; }
        [data-dashboard-export] [data-widget-type="quick-actions"] { display: none !important; }
      `;
      document.head.appendChild(exportStyle);

      // 2. Find the scroll parent and expand height to show all content
      const scrollParent = exportEl.parentElement;
      const origStyles = {
        height: exportEl.style.height,
        overflow: exportEl.style.overflow,
        minHeight: exportEl.style.minHeight,
      };
      const origScrollParentOverflow = scrollParent ? scrollParent.style.overflow : '';

      const captureH = Math.max(exportEl.scrollHeight, exportEl.offsetHeight);
      exportEl.style.height = `${captureH}px`;
      exportEl.style.minHeight = `${captureH}px`;
      exportEl.style.overflow = 'visible';
      if (scrollParent) scrollParent.style.overflow = 'visible';

      // 3. Detect dark mode
      const isDark = document.documentElement.classList.contains('dark');
      const bgColor = isDark ? '#08080A' : '#FAFCFF';
      const bgR = isDark ? 8 : 250;
      const bgG = isDark ? 8 : 252;
      const bgB = isDark ? 10 : 255;

      // 4. Capture using html-to-image (uses SVG foreignObject — browser renders CSS natively)
      const { toCanvas } = await import('html-to-image');
      const canvas = await toCanvas(exportEl, {
        pixelRatio: 2,
        backgroundColor: bgColor,
      });

      // 5. Restore styles
      exportStyle.remove();
      exportEl.style.height = origStyles.height;
      exportEl.style.overflow = origStyles.overflow;
      exportEl.style.minHeight = origStyles.minHeight;
      if (scrollParent) scrollParent.style.overflow = origScrollParentOverflow;

      if (format === 'png') {
        // Trim the canvas to actual content for PNG
        const fullCtx = canvas.getContext('2d')!;
        const trimmedH = trimCanvasHeight(fullCtx, canvas.width, canvas.height, bgR, bgG, bgB);
        if (trimmedH < canvas.height) {
          const trimmed = document.createElement('canvas');
          trimmed.width = canvas.width;
          trimmed.height = trimmedH;
          trimmed.getContext('2d')!.drawImage(canvas, 0, 0, canvas.width, trimmedH, 0, 0, canvas.width, trimmedH);
          const link = document.createElement('a');
          link.download = `${dashName} - ${timestamp}.png`;
          link.href = trimmed.toDataURL('image/png');
          link.click();
        } else {
          const link = document.createElement('a');
          link.download = `${dashName} - ${timestamp}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
        }
      } else {
        const { jsPDF } = await import('jspdf');

        const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 28;
        const headerH = 40;
        const footerH = 18;
        const availW = pageW - margin * 2;

        const imgW = canvas.width;
        const imgH = canvas.height;
        const pdfScale = availW / imgW;

        // Trim trailing whitespace
        const fullCtx = canvas.getContext('2d')!;
        const trimmedH = trimCanvasHeight(fullCtx, imgW, imgH, bgR, bgG, bgB);

        // Calculate ideal page heights in canvas pixels
        const firstPageSrcH = (pageH - margin - headerH - footerH) / pdfScale;
        const laterPageSrcH = (pageH - margin - 16 - footerH) / pdfScale;

        // Build smart page break points
        const breakPoints: number[] = [0];
        let y = 0;
        let pageIdx = 0;
        while (y < trimmedH) {
          const idealNext = y + (pageIdx === 0 ? firstPageSrcH : laterPageSrcH);
          if (idealNext >= trimmedH) {
            breakPoints.push(trimmedH);
            break;
          }
          const bp = findBreakPoint(fullCtx, imgW, idealNext, trimmedH, bgR, bgG, bgB);
          breakPoints.push(bp);
          y = bp;
          pageIdx++;
        }
        if (breakPoints[breakPoints.length - 1] < trimmedH) breakPoints.push(trimmedH);

        const totalPages = breakPoints.length - 1;

        for (let p = 0; p < totalPages; p++) {
          if (p > 0) pdf.addPage();

          const srcStart = breakPoints[p];
          const srcEnd = breakPoints[p + 1];
          const chunkSrcH = srcEnd - srcStart;
          if (chunkSrcH <= 0) continue;

          const chunkCanvas = document.createElement('canvas');
          chunkCanvas.width = imgW;
          chunkCanvas.height = Math.ceil(chunkSrcH);
          const ctx = chunkCanvas.getContext('2d');
          if (!ctx) continue;

          ctx.drawImage(canvas, 0, srcStart, imgW, chunkSrcH, 0, 0, imgW, chunkSrcH);
          const chunkData = chunkCanvas.toDataURL('image/png');

          const isFirst = p === 0;
          const contentY = isFirst ? margin + headerH : margin + 16;
          const renderedH = chunkSrcH * pdfScale;

          if (isFirst) {
            pdf.setFontSize(14);
            pdf.setTextColor(isDark ? 220 : 25, isDark ? 220 : 28, isDark ? 225 : 30);
            pdf.text(dashName, margin, margin + 16);
            pdf.setFontSize(8);
            pdf.setTextColor(isDark ? 130 : 120, isDark ? 130 : 120, isDark ? 135 : 130);
            pdf.text(`Exported ${new Date().toLocaleString()}`, margin, margin + 28);
          } else {
            pdf.setFontSize(7);
            pdf.setTextColor(isDark ? 120 : 150, isDark ? 120 : 150, isDark ? 125 : 155);
            pdf.text(`${dashName}  —  page ${p + 1} of ${totalPages}`, margin, margin + 9);
          }

          pdf.addImage(chunkData, 'PNG', margin, contentY, availW, renderedH);

          // Footer
          pdf.setFontSize(6);
          pdf.setTextColor(isDark ? 100 : 170, isDark ? 100 : 170, isDark ? 105 : 175);
          pdf.text('Generated by Optimus Detection Studio', margin, pageH - 8);
          pdf.text(`Page ${p + 1} of ${totalPages}`, pageW - margin - 50, pageH - 8);
        }

        pdf.save(`${dashName} - ${timestamp}.pdf`);
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }, [activeDashboard]);

  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      {/* Dashboard selector dropdown */}
      <div className="relative" ref={dashMenuRef}>
        {editingNameId === activeDashboard?.id ? (
          <input
            ref={nameInputRef}
            value={editingName}
            onChange={e => setEditingName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setEditingNameId(null); }}
            className="px-3 py-1.5 text-[12px] font-brand font-medium bg-surface-container-lowest border border-primary rounded-lg outline-none text-on-surface w-48"
          />
        ) : (
          <button
            onClick={() => setShowDashMenu(!showDashMenu)}
            className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-brand font-bold text-on-surface bg-surface-container-lowest rounded-lg border border-outline-variant/20 hover:border-outline-variant/40 transition-colors tracking-wide"
          >
            {activeDashboard?.isDefault && <span className="text-[10px] text-primary">★</span>}
            {activeDashboard?.name || 'Dashboard'}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${showDashMenu ? 'rotate-180' : ''}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}

        {showDashMenu && (
          <div className="absolute left-0 top-full mt-1 bg-surface-container rounded-xl shadow-xl border border-outline-variant/10 py-1 z-50 min-w-[220px]">
            {state.dashboards.map(dash => (
              <div
                key={dash.id}
                className={`group flex items-center gap-2 px-4 py-2.5 text-[12px] font-brand font-medium cursor-pointer transition-colors ${
                  dash.id === state.activeDashboardId
                    ? 'text-primary bg-primary/10'
                    : 'text-on-surface hover:bg-surface-container-low'
                }`}
                onClick={() => { navigate(`/dashboard/enterprise/${dash.id}`); setShowDashMenu(false); }}
              >
                <span className="flex-1 truncate">
                  {dash.isDefault && <span className="text-[10px] mr-1">★</span>}
                  {dash.name}
                </span>
                {/* Rename & delete actions */}
                <div
                  className="flex items-center gap-1 opacity-0 group-hover:opacity-100"
                  style={{ opacity: dash.id === state.activeDashboardId ? 1 : undefined }}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowDashMenu(false); setEditingNameId(dash.id); setEditingName(dash.name); }}
                    className="text-[10px] text-on-surface-variant/40 hover:text-primary transition-colors p-0.5"
                    title="Rename"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSetDefault(dash.id); }}
                    className="text-[10px] text-on-surface-variant/40 hover:text-primary transition-colors p-0.5"
                    title={dash.isDefault ? 'Is default' : 'Set as default'}
                  >
                    {dash.isDefault ? '★' : '☆'}
                  </button>
                  {state.dashboards.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowDashMenu(false); handleDelete(dash.id); }}
                      className="text-[10px] text-on-surface-variant/40 hover:text-error transition-colors p-0.5"
                      title="Delete dashboard"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Divider + New dashboard */}
            <div className="border-t border-outline-variant/10 mt-1 pt-1">
              <button
                onClick={() => { setShowDashMenu(false); setShowCreate(true); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-[12px] font-brand font-medium text-on-surface hover:bg-surface-container-low transition-colors text-left"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New Dashboard
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Scope toggle */}
      <div className="inline-flex items-center rounded-lg bg-surface-container p-0.5">
        <button
          onClick={() => dispatch({ type: 'SET_SCOPE_FILTER', scope: 'production' })}
          className={`px-3 py-1 text-[11px] font-brand font-bold rounded-md transition-all tracking-wide ${
            state.scopeFilter === 'production'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant/60 hover:text-on-surface-variant'
          }`}
        >
          Production Only
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_SCOPE_FILTER', scope: 'all' })}
          className={`px-3 py-1 text-[11px] font-brand font-bold rounded-md transition-all tracking-wide ${
            state.scopeFilter === 'all'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant/60 hover:text-on-surface-variant'
          }`}
        >
          + Development Library
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Time range & refresh */}
      <TimeRangeDropdown />

      {/* Edit mode controls */}
      {state.isEditMode && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => dispatch({ type: 'UNDO' })}
            disabled={state.undoStack.length === 0}
            className="px-2 py-1.5 text-[11px] font-brand font-bold text-on-surface-variant/60 hover:text-on-surface disabled:opacity-30 transition-colors rounded-lg"
            title="Undo"
          >
            ↩
          </button>
          <button
            onClick={() => dispatch({ type: 'REDO' })}
            disabled={state.redoStack.length === 0}
            className="px-2 py-1.5 text-[11px] font-brand font-bold text-on-surface-variant/60 hover:text-on-surface disabled:opacity-30 transition-colors rounded-lg"
            title="Redo"
          >
            ↪
          </button>
          <button
            onClick={() => dispatch({ type: 'OPEN_CATALOG' })}
            className="px-3 py-1.5 text-[11px] font-brand font-medium text-on-primary bg-primary hover:bg-primary/90 rounded-lg transition-colors"
          >
            + Widget
          </button>
          <button
            onClick={handleSaveAsCopy}
            className="px-3 py-1.5 text-[11px] font-brand font-medium text-on-surface-variant bg-surface-container-lowest hover:bg-surface-container-low border border-outline-variant/20 rounded-lg transition-colors"
            title="Save current edits as a new dashboard copy"
          >
            Save as Copy
          </button>
        </div>
      )}

      {/* Edit mode: Cancel + Done  |  View mode: Export + Edit */}
      {state.isEditMode ? (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => dispatch({ type: 'CANCEL_EDIT' })}
            className="px-4 py-1.5 text-[11px] font-brand font-bold rounded-lg transition-all tracking-wider uppercase bg-surface-container-lowest text-on-surface-variant hover:text-on-surface border border-outline-variant/20"
          >
            Cancel
          </button>
          <button
            onClick={() => dispatch({ type: 'TOGGLE_EDIT_MODE' })}
            className="px-4 py-1.5 text-[11px] font-brand font-bold rounded-lg transition-all tracking-wider uppercase bg-primary text-on-primary"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          {/* Export dropdown */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={exporting}
              className="px-3 py-1.5 text-[11px] font-brand font-bold rounded-lg transition-all tracking-wider uppercase bg-surface-container-lowest text-on-surface-variant hover:text-on-surface border border-outline-variant/20 flex items-center gap-1.5"
            >
              {exporting ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b border-primary" />
                  Exporting...
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export
                </>
              )}
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 bg-surface-container rounded-xl shadow-xl border border-outline-variant/10 py-1 z-50 min-w-[160px]">
                <button
                  onClick={() => handleExport('png')}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12px] font-brand font-medium text-on-surface hover:bg-surface-container-low transition-colors text-left"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  Export as PNG
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12px] font-brand font-medium text-on-surface hover:bg-surface-container-low transition-colors text-left"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  Export as PDF
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => dispatch({ type: 'TOGGLE_EDIT_MODE' })}
            className="px-4 py-1.5 text-[11px] font-brand font-bold rounded-lg transition-all tracking-wider uppercase bg-surface-container-lowest text-on-surface-variant hover:text-on-surface border border-outline-variant/20"
          >
            Edit
          </button>
        </div>
      )}

      {/* Create dashboard dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCreate(false)}>
          <div
            className="bg-surface-container rounded-2xl p-6 w-full max-w-sm shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-[14px] font-brand font-bold text-on-surface mb-4">New Dashboard</h3>

            <label className="text-[11px] font-brand font-bold text-on-surface-variant/60 uppercase tracking-wider">
              Name
            </label>
            <input
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              placeholder="My Dashboard"
              className="w-full mt-1 mb-4 px-3 py-2 text-[13px] font-brand bg-surface-container-lowest border border-outline-variant/20 rounded-lg text-on-surface outline-none focus:border-primary transition-colors"
            />

            <label className="text-[11px] font-brand font-bold text-on-surface-variant/60 uppercase tracking-wider">
              Template
            </label>
            <div className="mt-1 mb-5 space-y-1.5">
              {DASHBOARD_PRESETS.map(p => (
                <label
                  key={p.id}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    createPreset === p.id ? 'bg-primary/10 border border-primary/30' : 'bg-surface-container-lowest border border-outline-variant/10 hover:bg-surface-container-low'
                  }`}
                >
                  <input
                    type="radio"
                    name="preset"
                    checked={createPreset === p.id}
                    onChange={() => setCreatePreset(p.id)}
                    className="accent-primary"
                  />
                  <div>
                    <div className="text-[12px] font-brand font-medium text-on-surface">{p.name}</div>
                    <div className="text-[10px] font-brand text-on-surface-variant/50">{p.description}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-[12px] font-brand font-medium text-on-surface-variant hover:text-on-surface rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 text-[12px] font-brand font-bold text-on-primary bg-primary hover:bg-primary/90 rounded-lg transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardToolbar;
