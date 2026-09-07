import React, { useEffect, useMemo } from 'react';
import { Detection } from '../../types';
import { Icon } from '../Icon';
import { CircularProgress } from '../CircularProgress';
import { QualityGrade } from '../../hooks/useDetectionQuality';
import type { IconName } from '../Icon';

interface ChecklistItem {
  id: string;
  label: string;
  /** True when the corresponding part of the detection has been filled in. */
  done: boolean;
  /** Optional tab id to jump to (when the parent form passes one). */
  goToTab?: 'overview' | 'query' | 'investigation' | 'tuning';
}

interface DetectionInsightsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  formData: Partial<Detection>;
  qualityScore: number;
  qualityGrade: QualityGrade;
  /** Used when no `actionLabel` override is provided. */
  isEditMode?: boolean;
  /** Disables and spins the action button. */
  isSaving?: boolean;
  /** Primary action — Save / Create / Edit / etc. Detail page wires this to "Edit Detection". */
  onSave: () => void;
  /** Override the derived button label (e.g. "Edit Detection" on the read-only page). */
  actionLabel?: string;
  /** Optional icon name to render before the action label. */
  actionIcon?: IconName;
  /** Optional keyboard hint shown next to the action label (e.g. "⌘S"). */
  actionShortcut?: string;
  /** Jump to a tab when an incomplete checklist row is clicked. */
  onJumpToTab?: (tabId: 'overview' | 'query' | 'investigation' | 'tuning') => void;
}

const GRADE_HINTS: Record<QualityGrade, { label: string; tone: string }> = {
  A: { label: 'Excellent', tone: 'text-emerald-500' },
  B: { label: 'Good', tone: 'text-emerald-500' },
  C: { label: 'Acceptable', tone: 'text-amber-500' },
  D: { label: 'Needs work', tone: 'text-orange-500' },
  F: { label: 'Incomplete', tone: 'text-red-500' },
};

/**
 * Slide-in drawer that surfaces quality + completeness for the current draft.
 * Doesn't block the form — close it to keep editing. Clicking a checklist
 * row jumps to the relevant tab if the parent wires `onJumpToTab`.
 */
export const DetectionInsightsPanel: React.FC<DetectionInsightsPanelProps> = ({
  isOpen,
  onClose,
  formData,
  qualityScore,
  qualityGrade,
  isEditMode = false,
  isSaving = false,
  onSave,
  actionLabel,
  actionIcon,
  actionShortcut,
  onJumpToTab,
}) => {
  // Close on Escape so it doesn't trap the keyboard.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const checklist = useMemo<ChecklistItem[]>(() => {
    const hasQuery =
      (Array.isArray(formData.queries) && formData.queries.some((q) => q.query?.trim())) ||
      !!formData.detectionQuery?.trim();
    const hasDataSource =
      (formData.logSources?.length ?? 0) > 0 ||
      !!formData.logSource?.trim() ||
      (formData.dataSources?.length ?? 0) > 0;

    return [
      { id: 'name', label: 'Detection Name', done: !!formData.name?.trim(), goToTab: 'overview' },
      { id: 'description', label: 'Description', done: !!formData.description?.trim(), goToTab: 'overview' },
      { id: 'query', label: 'Detection Query', done: hasQuery, goToTab: 'query' },
      { id: 'mitre', label: 'MITRE Mapping', done: (formData.mitreAttackIds?.length ?? 0) > 0, goToTab: 'overview' },
      { id: 'sources', label: 'Data Sources', done: hasDataSource, goToTab: 'overview' },
      { id: 'investigation', label: 'Investigation Steps', done: (formData.investigationSteps?.length ?? 0) > 0, goToTab: 'investigation' },
      { id: 'fp', label: 'False Positive Guide', done: !!formData.falsePositiveGuidance?.trim(), goToTab: 'investigation' },
      { id: 'response', label: 'Response Actions', done: (formData.responseActions?.length ?? 0) > 0, goToTab: 'investigation' },
      { id: 'tests', label: 'Test Cases', done: (formData.testCases?.length ?? 0) > 0, goToTab: 'tuning' },
      { id: 'refs', label: 'References', done: (formData.references?.length ?? 0) > 0, goToTab: 'overview' },
    ];
  }, [formData]);

  const completedCount = checklist.filter((c) => c.done).length;
  const gradeHint = GRADE_HINTS[qualityGrade];

  return (
    <>
      {/* Lightweight backdrop — click-through dim that closes on outside click.
          Kept subtle so the form behind is still readable. */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        role="dialog"
        aria-label="Detection insights"
        aria-hidden={!isOpen}
        className={[
          'fixed right-0 top-0 bottom-0 z-50',
          'w-[360px] max-w-[90vw]',
          'bg-surface-container-low border-l border-outline-variant/30 shadow-2xl',
          'flex flex-col',
          'transform transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Detection Health</p>
            <h2 className="text-base font-semibold text-on-surface mt-0.5">Quick check</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
            aria-label="Close insights panel"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Quality Score */}
          <section className="rounded-2xl border border-outline-variant/30 bg-surface-container px-5 py-5 flex flex-col items-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Quality Score</p>
            <div className="mt-3">
              <CircularProgress score={qualityScore} size={92} strokeWidth={6} />
            </div>
            <p className={`mt-3 text-xs font-semibold ${gradeHint.tone}`}>
              Grade: {qualityGrade} — {gradeHint.label}
            </p>
          </section>

          {/* Completeness */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Detection Completeness</p>
              <span className="text-[11px] font-semibold text-on-surface-variant">
                {completedCount} / {checklist.length}
              </span>
            </div>
            <ul className="space-y-1.5">
              {checklist.map((item) => {
                const clickable = !item.done && onJumpToTab && item.goToTab;
                const Wrapper: any = clickable ? 'button' : 'div';
                const wrapperProps = clickable
                  ? {
                      type: 'button',
                      onClick: () => {
                        if (item.goToTab) onJumpToTab!(item.goToTab);
                      },
                    }
                  : {};
                return (
                  <Wrapper
                    key={item.id}
                    {...wrapperProps}
                    className={[
                      'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left',
                      clickable ? 'hover:bg-surface-container transition-colors cursor-pointer' : '',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex-shrink-0 w-4 h-4 rounded-[5px] flex items-center justify-center border',
                        item.done
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-500'
                          : 'bg-surface-container border-outline-variant/40 text-transparent',
                      ].join(' ')}
                    >
                      {item.done && <Icon name="check" className="w-3 h-3" />}
                    </span>
                    <span
                      className={[
                        'text-sm flex-1',
                        item.done ? 'text-on-surface' : 'text-on-surface-variant',
                      ].join(' ')}
                    >
                      {item.label}
                    </span>
                    {clickable && (
                      <Icon name="chevron-right" className="w-3.5 h-3.5 text-on-surface-variant/50" />
                    )}
                  </Wrapper>
                );
              })}
            </ul>
          </section>
        </div>

        {/* Footer actions */}
        <div className="border-t border-outline-variant/30 px-5 py-4 space-y-2">
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || !formData.name?.trim()}
            className="w-full h-10 rounded-full text-sm font-bold bg-primary text-on-primary hover:brightness-110 transition-all active:scale-95 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSaving && <Icon name="spinner" className="w-4 h-4 animate-spin" />}
            {actionIcon && !isSaving && <Icon name={actionIcon} className="w-4 h-4" />}
            {actionLabel ?? (isEditMode ? 'Save Changes' : 'Create Rule')}
            {actionShortcut && <span className="text-[10px] opacity-60 ml-1">{actionShortcut}</span>}
            {!actionShortcut && !actionLabel && <span className="text-[10px] opacity-60 ml-1">⌘S</span>}
          </button>
          <p className="text-[11px] text-on-surface-variant/70 text-center">
            Press <kbd className="px-1.5 py-0.5 rounded bg-surface-container border border-outline-variant/30 text-[10px] font-mono">Esc</kbd> to close
          </p>
        </div>
      </aside>
    </>
  );
};
