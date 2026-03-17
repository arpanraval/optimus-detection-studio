/**
 * PreviewTable - Virtual scrolling table for previewing rules
 * Uses app's M3 design system
 */

import React, { useState } from 'react';
import { useBulkImportContext } from '../../../context/BulkImportContext';
import { ValidatedRule } from '../../../services/bulk-import/types';
import { Severity } from '../../../types';
import { Icon } from '../../Icon';

// Color scheme
const COLORS = {
  success: '#4D7C6F',
  failure: '#A63D40',
  warning: '#D4A84B',
  muted: '#78326410', // 10% opacity
  brand: '#783264',
};

interface PreviewTableProps {
  rules: ValidatedRule[];
}

// Readable severity colors with good contrast
const SEVERITY_STYLES: Record<Severity, { bg: string; text: string }> = {
  [Severity.Critical]: { bg: '#A63D4030', text: '#A63D40' },
  [Severity.High]: { bg: '#D4A84B30', text: '#D4A84B' },
  [Severity.Medium]: { bg: '#5B8A7230', text: '#5B8A72' },
  [Severity.Low]: { bg: '#6B8E9F30', text: '#6B8E9F' },
  [Severity.Informational]: { bg: '#78326420', text: '#9CA3AF' },
};

function StatusIcon({ rule }: { rule: ValidatedRule }) {
  if (rule.validation.isDuplicate) {
    return <Icon name="copy" className="w-4 h-4" style={{ color: `${COLORS.brand}80` }} />;
  }
  if (!rule.validation.isValid) {
    return <Icon name="x-circle" className="w-4 h-4" style={{ color: COLORS.failure }} />;
  }
  if (rule.validation.issues.some((i) => i.severity === 'warning')) {
    return <Icon name="alert-triangle" className="w-4 h-4" style={{ color: COLORS.warning }} />;
  }
  return <Icon name="check-circle" className="w-4 h-4" style={{ color: COLORS.success }} />;
}

function RuleRow({ rule, index }: { rule: ValidatedRule; index: number }) {
  const { toggleRuleSelection, rules } = useBulkImportContext();
  const [expanded, setExpanded] = useState(false);

  // Find the actual index in the full rules array
  const actualIndex = rules.findIndex(
    (r) => r.parsed.sourceId === rule.parsed.sourceId && r.parsed.sourceFileName === rule.parsed.sourceFileName
  );

  const severityStyle =
    SEVERITY_STYLES[rule.parsed.level as Severity] || SEVERITY_STYLES[Severity.Medium];

  const canSelect = rule.validation.isValid && !rule.validation.isDuplicate;

  return (
    <>
      <tr
        className={`border-b border-outline-variant/20 hover:bg-surface-container/50 transition-colors`}
        style={rule.selected ? { backgroundColor: COLORS.muted } : {}}
      >
        {/* Checkbox */}
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={rule.selected}
            onChange={() => toggleRuleSelection(actualIndex)}
            disabled={!canSelect}
            className="w-4 h-4 border-outline-variant rounded disabled:opacity-50 accent-secondary"
          />
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <StatusIcon rule={rule} />
        </td>

        {/* Title */}
        <td className="px-4 py-3">
          <div>
            <p className="text-sm font-medium text-on-surface truncate max-w-md">
              {rule.parsed.title}
            </p>
            <p className="text-xs text-on-surface-variant truncate max-w-md font-mono">
              {rule.parsed.sourceId}
            </p>
          </div>
        </td>

        {/* Severity */}
        <td className="px-4 py-3">
          <span
            className="px-2 py-1 rounded-full text-xs font-medium"
            style={{ backgroundColor: severityStyle.bg, color: severityStyle.text }}
          >
            {rule.parsed.level || 'Medium'}
          </span>
        </td>

        {/* MITRE */}
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {rule.parsed.mitreAttackIds.slice(0, 3).map((id) => (
              <span
                key={id}
                className="px-1.5 py-0.5 text-xs rounded"
                style={{ backgroundColor: `${COLORS.brand}30`, color: COLORS.brand }}
              >
                {id}
              </span>
            ))}
            {rule.parsed.mitreAttackIds.length > 3 && (
              <span className="text-xs text-on-surface-variant">
                +{rule.parsed.mitreAttackIds.length - 3}
              </span>
            )}
          </div>
        </td>

        {/* Quality */}
        <td className="px-4 py-3">
          <div className="flex items-center">
            <div className="w-16 bg-surface-variant rounded-full h-2 mr-2">
              <div
                className={`h-2 rounded-full ${
                  rule.validation.qualityScore >= 70
                    ? 'bg-secondary'
                    : rule.validation.qualityScore >= 40
                    ? 'bg-tertiary'
                    : 'bg-error'
                }`}
                style={{ width: `${rule.validation.qualityScore}%` }}
              />
            </div>
            <span className="text-xs text-on-surface-variant">{rule.validation.qualityScore}</span>
          </div>
        </td>

        {/* Vendor */}
        <td className="px-4 py-3">
          <span className="text-xs text-on-surface-variant uppercase">
            {rule.parsed.sourceFormat}
          </span>
        </td>

        {/* Expand */}
        <td className="px-4 py-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-surface-container rounded transition-colors"
          >
            <Icon
              name={expanded ? 'chevron-up' : 'chevron-down'}
              className="w-4 h-4 text-on-surface-variant"
            />
          </button>
        </td>
      </tr>

      {/* Expanded details */}
      {expanded && (
        <tr className="border-b border-outline-variant/20 bg-surface-container/30">
          <td colSpan={8} className="px-4 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-on-surface-variant text-xs uppercase mb-1">
                  Description
                </p>
                <p className="text-on-surface">
                  {rule.parsed.description || 'No description'}
                </p>
              </div>
              <div>
                <p className="text-on-surface-variant text-xs uppercase mb-1">
                  Validation Issues
                </p>
                {rule.validation.issues.length > 0 ? (
                  <ul className="space-y-1">
                    {rule.validation.issues.map((issue, i) => (
                      <li
                        key={i}
                        className={`text-xs ${
                          issue.severity === 'error'
                            ? 'text-error'
                            : issue.severity === 'warning'
                            ? 'text-tertiary'
                            : 'text-on-surface-variant'
                        }`}
                      >
                        [{issue.severity}] {issue.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-secondary text-xs">No issues</p>
                )}
              </div>
              <div>
                <p className="text-on-surface-variant text-xs uppercase mb-1">Author</p>
                <p className="text-on-surface">{rule.parsed.author || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-on-surface-variant text-xs uppercase mb-1">
                  Source File
                </p>
                <p className="text-on-surface truncate font-mono text-xs">
                  {rule.parsed.sourceFilePath || rule.parsed.sourceFileName}
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function PreviewTable({ rules }: PreviewTableProps) {
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const totalPages = Math.ceil(rules.length / pageSize);
  const visibleRules = rules.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="border border-outline-variant/30 rounded-[12px] overflow-hidden">
      {/* Table */}
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full">
          <thead className="bg-surface-container sticky top-0">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase">
                Select
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase">
                Title
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase">
                Severity
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase">
                MITRE
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase">
                Quality
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase">
                Vendor
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {visibleRules.map((rule, index) => (
              <RuleRow key={`${rule.parsed.sourceId}-${index}`} rule={rule} index={index} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 bg-surface-container border-t border-outline-variant/20">
          <p className="text-sm text-on-surface-variant">
            Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, rules.length)} of{' '}
            {rules.length} rules
          </p>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 text-sm border border-outline-variant/30 rounded-full text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-on-surface-variant">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 text-sm border border-outline-variant/30 rounded-full text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {rules.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-on-surface-variant">No rules match the current filters</p>
        </div>
      )}
    </div>
  );
}
