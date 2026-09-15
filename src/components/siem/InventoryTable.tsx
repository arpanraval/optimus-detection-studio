import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { routeHelpers } from '@/router/routes';
import {
  RELATIONSHIP_LABELS,
  importBlockedReason,
  type InventoryRow,
} from '../../../supabase/functions/_shared/native-siem-model';

export interface InventoryTableProps {
  rows: InventoryRow[];
  loading: boolean;
  selectedIds?: ReadonlySet<string>; // Task 6 supplies these; optional here
  pageAllSelected?: boolean;
  onToggle?: (vendorRuleId: string) => void;
  onTogglePage?: () => void;
  onResolveMatch?: (row: InventoryRow) => void;
  /** Opens the production comparison for a tracked rule. */
  onReview?: (row: InventoryRow) => void;
  /** Opens the read-only look at a rule that is not in the library yet. */
  onPreview?: (row: InventoryRow) => void;
}

function siemStateLabel(row: InventoryRow): string {
  if (row.availability === 'missing') return 'Not found';
  if (row.availability !== 'present' || row.observed_enabled === null) return 'Unknown';
  return row.observed_enabled ? 'Enabled' : 'Disabled';
}

export function InventoryTable({
  rows,
  loading,
  selectedIds,
  pageAllSelected,
  onToggle,
  onTogglePage,
  onResolveMatch,
  onReview,
  onPreview,
}: InventoryTableProps): React.JSX.Element {
  const showSelection = !!onTogglePage;
  const allEligibleSelected = showSelection && !!pageAllSelected;

  if (loading) {
    return (
      <div role="status" className="space-y-3 px-5 py-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-container-high" />
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-y border-outline-variant/20 bg-surface-container/50 text-xs text-on-surface-variant">
          <tr>
            {showSelection && (
              <th scope="col" className="px-5 py-2.5 font-medium">
                <input
                  type="checkbox"
                  aria-label="Select all eligible rules on this page"
                  checked={!!allEligibleSelected}
                  onChange={() => onTogglePage?.()}
                />
              </th>
            )}
            {['Rule', 'In library', 'In CrowdStrike', 'Import eligibility'].map((label) => (
              <th key={label} scope="col" className="px-5 py-2.5 font-medium whitespace-nowrap">
                {label}
              </th>
            ))}
            <th scope="col" className="px-5 py-2.5 font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/20">
          {rows.map((row) => {
            // One predicate for the checkbox, the tooltip and the eligibility column, shared with
            // the server: the table must never offer an import that siem_start_import would skip.
            const blocked = importBlockedReason(row);
            const eligible = blocked === null;
            const canOpenLibraryRule = row.detection_id != null;
            const canReviewChanges = row.binding_id != null;
            const canResolveMatch = row.relationship === 'match_needed';
            const canPreview = row.latest_snapshot_id != null && row.detection_id == null;
            return (
              <tr key={row.id} className="transition-colors hover:bg-surface-container-high/50">
                {showSelection && (
                  <td className="px-5 py-3.5">
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.display_name}`}
                      checked={!!selectedIds?.has(row.vendor_rule_id)}
                      disabled={!eligible}
                      title={blocked ?? undefined}
                      onChange={() => onToggle?.(row.vendor_rule_id)}
                    />
                  </td>
                )}
                <td className="px-5 py-3.5 w-[34%] min-w-56">
                  {row.detection_id ? (
                    <Link
                      className="font-medium text-on-surface hover:text-primary hover:underline"
                      to={routeHelpers.detectionDetail(row.detection_id)}
                    >
                      {row.display_name}
                    </Link>
                  ) : (
                    <span className="font-medium text-on-surface">{row.display_name}</span>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-on-surface-variant">
                    <span className="font-mono">{row.vendor_rule_id}</span>
                    <span>{row.rule_family}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap">{RELATIONSHIP_LABELS[row.relationship]}</td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <span
                    title={`Last checked ${new Date(row.last_seen_at).toLocaleString()}`}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs bg-surface-container-high text-on-surface-variant"
                  >
                    {siemStateLabel(row)}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-xs text-on-surface-variant">
                  {blocked ?? 'Ready to import'}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {canPreview && (
                      <Button size="sm" variant="text" onClick={() => onPreview?.(row)}>
                        Preview
                      </Button>
                    )}
                    {canOpenLibraryRule && row.detection_id && (
                      <Link
                        className="rounded px-2 py-1 text-sm font-medium text-primary hover:underline"
                        to={routeHelpers.detectionDetail(row.detection_id)}
                      >
                        Open library rule
                      </Link>
                    )}
                    {canReviewChanges && (
                      <Button size="sm" variant="text" onClick={() => onReview?.(row)}>
                        Review changes
                      </Button>
                    )}
                    {canResolveMatch && (
                      <Button size="sm" variant="text" onClick={() => onResolveMatch?.(row)}>
                        Resolve match
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
