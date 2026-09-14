import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/Icon';
import { useRemoteInventory } from '@/hooks/useRemoteInventory';
import { routeHelpers } from '@/router/routes';
import type { Integration } from '@/types';
import { NativeRuleReview } from './NativeRuleReview';
import { InventoryTable } from './InventoryTable';
import type { InventoryRelationship, InventoryRow } from '../../../supabase/functions/_shared/native-siem-model';
import { RELATIONSHIP_LABELS } from '../../../supabase/functions/_shared/native-siem-model';

const CHIPS: Array<{ id: InventoryRelationship | 'all'; label: string }> = [
  { id: 'all', label: 'All rules' },
  { id: 'not_in_library', label: 'Not in library' },
  { id: 'already_in_library', label: 'Already in library' },
  { id: 'match_needed', label: 'Match needed' },
  { id: 'archived_in_library', label: 'Archived in library' },
  { id: 'unsupported', label: 'Unsupported' },
];

export function NativeRulesPanel({ integration }: { integration: Integration }) {
  const {
    page,
    counts,
    run,
    loading,
    error,
    running,
    relationship,
    setRelationship,
    search,
    setSearch,
    pageIndex,
    setPageIndex,
    reload,
    startInventory,
  } = useRemoteInventory(integration.id);
  const navigate = useNavigate();
  const [selected, setSelected] = React.useState<InventoryRow | null>(null);
  const openerRef = React.useRef<HTMLElement | null>(null);

  const rows = page?.rows ?? [];
  const totalCount = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const hasEverFetched = !!run;

  const handleReview = (row: InventoryRow, opener?: HTMLElement | null) => {
    openerRef.current = opener ?? document.activeElement as HTMLElement | null;
    if (row.binding_id) {
      setSelected(row);
    } else if (row.detection_id) {
      navigate(routeHelpers.detectionDetail(row.detection_id));
    }
  };

  const closeReview = () => {
    setSelected(null);
    openerRef.current?.focus?.();
  };

  let emptyHeading: string | null = null;
  let emptyBody: string | null = null;
  if (!loading && rows.length === 0) {
    if (search.trim()) {
      emptyHeading = 'No matching rules';
      emptyBody = 'Try another rule name or CrowdStrike ID.';
    } else if (relationship !== 'all') {
      emptyHeading = 'Nothing in this view';
      emptyBody = 'Choose All rules to return to the full inventory.';
    } else if (!hasEverFetched) {
      emptyHeading = 'No inventory yet';
      emptyBody =
        'Fetch rules from CrowdStrike to see what exists in production. Nothing is added to your library until you choose it.';
    } else {
      emptyHeading = 'No rules in this CrowdStrike account';
      emptyBody = "This connection's scope contains no correlation rules.";
    }
  }

  return (
    <div className="py-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Detection rules</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Source connection: {integration.name || 'CrowdStrike'}
          </p>
        </div>
        <Button leadingIcon="download" disabled={running} onClick={() => void startInventory()}>
          {running ? 'Checking CrowdStrike…' : 'Fetch rules from CrowdStrike'}
        </Button>
      </div>
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-xl bg-error/10 px-4 py-3 text-sm text-error"
        >
          <span>{error}</span>
          <Button size="sm" variant="text" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      )}
      <section
        aria-label="CrowdStrike rule inventory"
        className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-low"
      >
        {run && (
          <div role="status" className="border-b border-outline-variant/20 px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Icon
                  name={running ? 'refresh-cw' : run.status === 'failed' ? 'alert-triangle' : 'check'}
                  className={`h-4 w-4 ${running ? 'animate-spin text-primary' : run.status === 'failed' ? 'text-amber-600' : 'text-emerald-600'}`}
                />
                <span className="font-medium text-on-surface">
                  {running
                    ? 'Checking CrowdStrike…'
                    : run.status === 'failed'
                      ? 'Check failed'
                      : run.status === 'cancelled'
                        ? 'Check cancelled'
                        : 'Latest check'}
                </span>
                {!running && <span className="text-on-surface-variant">{totalCount} rules found</span>}
                {running && (
                  <span className="text-on-surface-variant">
                    You can leave this page. The check continues in the background.
                  </span>
                )}
              </div>
              {run.completed_at && !running && (
                <time dateTime={run.completed_at} className="text-on-surface-variant">
                  {new Date(run.completed_at).toLocaleString()}
                </time>
              )}
            </div>
            {run.error_message && <p className="mt-2 text-xs text-error">{run.error_message}</p>}
            {running && !run.discovery_complete && (
              <p className="mt-2 text-xs text-on-surface-variant">
                Still checking CrowdStrike. Showing the {totalCount} rules found so far.
              </p>
            )}
          </div>
        )}
        <div className="flex gap-1 overflow-x-auto border-b border-outline-variant/20 px-4">
          {CHIPS.map((chip) => {
            const count = chip.id === 'all' ? totalCount : counts[chip.id] ?? 0;
            const active = relationship === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={active}
                aria-label={`${chip.label} ${count}`}
                onClick={() => setRelationship(chip.id)}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3.5 text-sm font-medium transition-colors ${active ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
              >
                {chip.label}
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${active ? 'bg-primary/10' : 'bg-surface-container-high'}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-4 px-5 py-3">
          <div className="w-full sm:max-w-md">
            <Input
              fullWidth
              size="sm"
              type="search"
              leadingIcon="search"
              aria-label="Search production rules"
              placeholder="Search rules or CrowdStrike ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        {loading ? (
          <div role="status" className="space-y-3 px-5 py-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-container-high" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div role="status" className="px-6 py-14 text-center">
            <Icon name="inbox" className="mx-auto mb-3 h-6 w-6 text-on-surface-variant" />
            <h3 className="text-sm font-medium">{emptyHeading}</h3>
            <p className="mt-2 text-xs text-on-surface-variant">{emptyBody}</p>
          </div>
        ) : (
          // onResolveMatch is left unwired here: Task 12 gives `match_needed` rows a
          // resolution dialog. Nothing this task could do with the callback would be real.
          <InventoryTable rows={rows} loading={false} onReview={(row) => handleReview(row)} />
        )}
        {rows.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-outline-variant/20 px-5 py-2 text-xs text-on-surface-variant">
            <span>
              {pageIndex * 50 + 1}–{pageIndex * 50 + rows.length} rules
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="text" disabled={pageIndex === 0} onClick={() => setPageIndex(pageIndex - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="text" disabled={!page?.hasMore} onClick={() => setPageIndex(pageIndex + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </section>
      {selected && selected.binding_id && (
        <Modal
          title="Review rule changes"
          subject={{ label: 'Rule', value: selected.display_name }}
          size="xl"
          onClose={closeReview}
          footer={
            <div className="flex justify-between items-center gap-3">
              {selected.detection_id && (
                <Link className="text-sm text-primary hover:underline" to={routeHelpers.detectionDetail(selected.detection_id)}>
                  Open library rule →
                </Link>
              )}
              <Button size="sm" variant="text" onClick={closeReview}>
                Close
              </Button>
            </div>
          }
        >
          <p className="text-xs text-on-surface-variant break-all">CrowdStrike ID: {selected.vendor_rule_id}</p>
          <NativeRuleReview key={selected.binding_id} bindingId={selected.binding_id} onChanged={() => void reload()} />
        </Modal>
      )}
    </div>
  );
}
