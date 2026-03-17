/**
 * RuleDiffViewer - Shows visual diff between existing and incoming rules
 * Uses app's M3 design system
 *
 * Displays side-by-side or unified diff view for rule updates
 */

import React, { useState, useMemo } from 'react';
import { Icon } from '../Icon';
import { ValidatedRule } from '../../services/bulk-import/types';

interface RuleDiffViewerProps {
  /** The incoming rule from import */
  incomingRule: ValidatedRule;
  /** The existing rule data (if duplicate/update) */
  existingData?: {
    name: string;
    description: string;
    detectionQuery: string;
    severity: string;
    mitreAttackIds: string[];
    tags: string[];
  };
  /** View mode */
  mode?: 'side-by-side' | 'unified';
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'modified';
  field: string;
  oldValue?: string;
  newValue?: string;
}

export function RuleDiffViewer({
  incomingRule,
  existingData,
  mode = 'side-by-side',
  isOpen,
  onClose,
}: RuleDiffViewerProps) {
  const [activeTab, setActiveTab] = useState<'fields' | 'query'>('fields');

  // Calculate field differences
  const fieldDiffs = useMemo((): DiffLine[] => {
    if (!existingData) return [];

    const diffs: DiffLine[] = [];
    const incoming = incomingRule.parsed;

    // Compare fields
    const fieldsToCompare = [
      { key: 'name', label: 'Name', old: existingData.name, new: incoming.title },
      { key: 'description', label: 'Description', old: existingData.description, new: incoming.description },
      { key: 'severity', label: 'Severity', old: existingData.severity, new: incoming.level },
      {
        key: 'mitre',
        label: 'MITRE ATT&CK',
        old: existingData.mitreAttackIds?.join(', ') || '',
        new: incoming.mitreAttackIds?.join(', ') || '',
      },
      {
        key: 'tags',
        label: 'Tags',
        old: existingData.tags?.join(', ') || '',
        new: incoming.tags?.join(', ') || '',
      },
    ];

    for (const field of fieldsToCompare) {
      const oldVal = field.old?.toString() || '';
      const newVal = field.new?.toString() || '';

      if (oldVal === newVal) {
        diffs.push({ type: 'unchanged', field: field.label, oldValue: oldVal, newValue: newVal });
      } else if (!oldVal && newVal) {
        diffs.push({ type: 'added', field: field.label, newValue: newVal });
      } else if (oldVal && !newVal) {
        diffs.push({ type: 'removed', field: field.label, oldValue: oldVal });
      } else {
        diffs.push({ type: 'modified', field: field.label, oldValue: oldVal, newValue: newVal });
      }
    }

    return diffs;
  }, [incomingRule, existingData]);

  // Count changes
  const changeCount = fieldDiffs.filter((d) => d.type !== 'unchanged').length;
  const queryChanged = existingData?.detectionQuery !== incomingRule.parsed.query;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-surface-container-high rounded-[28px] w-full max-w-4xl max-h-[90vh] mx-4 shadow-xl border border-outline-variant/20 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/20">
          <div>
            <h2 className="text-xl font-semibold text-on-surface">Rule Comparison</h2>
            <p className="text-sm text-on-surface-variant mt-1">
              {changeCount} field{changeCount !== 1 ? 's' : ''} changed
              {queryChanged && ', query modified'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-container rounded-full transition-colors"
          >
            <Icon name="x" className="w-5 h-5 text-on-surface-variant" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-outline-variant/20">
          <button
            onClick={() => setActiveTab('fields')}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'fields'
                ? 'text-primary border-primary'
                : 'text-on-surface-variant border-transparent hover:text-on-surface'
            }`}
          >
            Fields
            {changeCount > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-primary-container text-primary rounded-full">
                {changeCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('query')}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'query'
                ? 'text-primary border-primary'
                : 'text-on-surface-variant border-transparent hover:text-on-surface'
            }`}
          >
            Detection Query
            {queryChanged && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-tertiary-container text-tertiary rounded-full">
                Modified
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'fields' ? (
            <div className="space-y-3">
              {/* Legend */}
              <div className="flex gap-4 text-xs mb-4">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-secondary" />
                  Added
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-error" />
                  Removed
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-tertiary" />
                  Modified
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-outline-variant" />
                  Unchanged
                </span>
              </div>

              {/* Field diffs */}
              {fieldDiffs.map((diff, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-[12px] ${
                    diff.type === 'unchanged'
                      ? 'bg-surface-variant/30'
                      : diff.type === 'added'
                      ? 'bg-secondary-container/30 border border-secondary/30'
                      : diff.type === 'removed'
                      ? 'bg-error-container/30 border border-error/30'
                      : 'bg-tertiary-container/30 border border-tertiary/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-on-surface-variant">{diff.field}</span>
                    {diff.type !== 'unchanged' && (
                      <Icon
                        name={
                          diff.type === 'added'
                            ? 'plus-circle'
                            : diff.type === 'removed'
                            ? 'minus-circle'
                            : 'edit-2'
                        }
                        className={`w-3 h-3 ${
                          diff.type === 'added'
                            ? 'text-secondary'
                            : diff.type === 'removed'
                            ? 'text-error'
                            : 'text-tertiary'
                        }`}
                      />
                    )}
                  </div>

                  {mode === 'side-by-side' ? (
                    <div className="grid grid-cols-2 gap-3">
                      {/* Old value */}
                      <div>
                        <span className="text-[10px] text-on-surface-variant/70 block mb-1">
                          Current
                        </span>
                        <div
                          className={`text-sm ${
                            diff.type === 'removed' || diff.type === 'modified'
                              ? 'text-error line-through'
                              : 'text-on-surface'
                          }`}
                        >
                          {diff.oldValue || <span className="text-on-surface-variant/50">—</span>}
                        </div>
                      </div>

                      {/* New value */}
                      <div>
                        <span className="text-[10px] text-on-surface-variant/70 block mb-1">
                          Incoming
                        </span>
                        <div
                          className={`text-sm ${
                            diff.type === 'added' || diff.type === 'modified'
                              ? 'text-secondary font-medium'
                              : 'text-on-surface'
                          }`}
                        >
                          {diff.newValue || <span className="text-on-surface-variant/50">—</span>}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {(diff.type === 'removed' || diff.type === 'modified') && diff.oldValue && (
                        <div className="text-sm text-error line-through bg-error/10 px-2 py-1 rounded">
                          - {diff.oldValue}
                        </div>
                      )}
                      {(diff.type === 'added' || diff.type === 'modified') && diff.newValue && (
                        <div className="text-sm text-secondary bg-secondary/10 px-2 py-1 rounded">
                          + {diff.newValue}
                        </div>
                      )}
                      {diff.type === 'unchanged' && (
                        <div className="text-sm text-on-surface">{diff.oldValue}</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* Query diff tab */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Current query */}
                <div>
                  <h4 className="text-sm font-medium text-on-surface mb-2 flex items-center gap-2">
                    <Icon name="code" className="w-4 h-4 text-on-surface-variant" />
                    Current Query
                  </h4>
                  <pre className="p-3 bg-surface-variant/50 rounded-[12px] text-xs text-on-surface font-mono overflow-x-auto max-h-[400px] overflow-y-auto">
                    {existingData?.detectionQuery || 'No existing query'}
                  </pre>
                </div>

                {/* Incoming query */}
                <div>
                  <h4 className="text-sm font-medium text-on-surface mb-2 flex items-center gap-2">
                    <Icon name="code" className="w-4 h-4 text-secondary" />
                    Incoming Query
                    {queryChanged && (
                      <span className="text-xs font-normal text-tertiary">(Modified)</span>
                    )}
                  </h4>
                  <pre
                    className={`p-3 rounded-[12px] text-xs font-mono overflow-x-auto max-h-[400px] overflow-y-auto ${
                      queryChanged
                        ? 'bg-tertiary-container/30 text-on-surface border border-tertiary/30'
                        : 'bg-surface-variant/50 text-on-surface'
                    }`}
                  >
                    {incomingRule.parsed.query}
                  </pre>
                </div>
              </div>

              {/* Query language indicator */}
              <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                <Icon name="info" className="w-3 h-3" />
                Query language: {incomingRule.parsed.queryLanguage || 'Unknown'}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-outline-variant/20">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container rounded-full transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default RuleDiffViewer;
