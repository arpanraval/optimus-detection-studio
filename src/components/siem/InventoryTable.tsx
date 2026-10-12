import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { routeHelpers } from '@/router/routes';
import {
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
  providerName?: string;
}

// The vocabulary a user sees for library membership. Deliberately its own map rather than
// reusing RELATIONSHIP_LABELS verbatim: that shared map is a server-side relationship id-to-word
// mapping used by tests on both sides of the edge-function boundary, and this row is presentation
// only, worded to the spec's row-state vocabulary (spec section 5).
const LIBRARY_STATE_LABELS: Record<InventoryRow['relationship'], string> = {
  not_in_library: 'Not in library',
  already_in_library: 'In library',
  archived_in_library: 'Archived in library',
  match_needed: 'Possible library match',
  unsupported: 'Import unavailable · Unsupported rule family',
};

/** Import eligibility, worded to the spec vocabulary. Unsupported is not a transient error, so
 *  it is never phrased as one and never offers Retry — that stays the caller's job (no Retry
 *  action is rendered from this label). */
function importEligibilityLabel(row: InventoryRow, blocked: string | null): string {
  if (blocked === null) return 'Ready to import';
  if (row.relationship === 'unsupported') return `Import unavailable · ${blocked}`;
  return `Import unavailable · ${blocked}`;
}

function siemStateLabel(row: InventoryRow, providerName: string): string {
  if (row.availability === 'missing') return `Not found in ${providerName}`;
  if (row.normalization_error) return `Could not read · ${row.normalization_error}`;
  if (row.availability !== 'present' || row.observed_enabled === null) return 'State unavailable';
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
  providerName,
}: InventoryTableProps): React.JSX.Element {
  const showSelection = !!onTogglePage;
  const allEligibleSelected = showSelection && !!pageAllSelected;
  // Two different defaults on purpose: the SIEM-state column has always said "the connected
  // SIEM" when no provider is known, while importBlockedReason's own default (undefined here)
  // renders 'CrowdStrike' -- unchanged from every caller written before multi-provider support.
  const siemStateProviderName = providerName ?? 'the connected SIEM';

  if (loading) {
    return (
      <div role="status" className="space-y-3 px-5 py-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 loading-placeholder rounded-lg bg-surface-container-high" />
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
            {['Rule', 'In library', `In ${siemStateProviderName}`, 'Import eligibility'].map((label) => (
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
            const blocked = importBlockedReason({ ...row, provider: providerName });
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
                <td className="px-5 py-3.5 whitespace-nowrap">{LIBRARY_STATE_LABELS[row.relationship]}</td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <span
                    title={`Last checked ${new Date(row.last_seen_at).toLocaleString()}`}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs bg-surface-container-high text-on-surface-variant"
                  >
                    {siemStateLabel(row, siemStateProviderName)}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-xs text-on-surface-variant">
                  {importEligibilityLabel(row, blocked)}
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
