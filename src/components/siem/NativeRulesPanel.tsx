import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/Icon';
import { useNativeSiemInventory } from '@/hooks/useNativeSiemInventory';
import { routeHelpers } from '@/router/routes';
import type { Integration } from '@/types';
import { NativeRuleReview, NATIVE_DRIFT_LABELS } from './NativeRuleReview';

export const IMPORT_RESULT_LABELS: Record<string, string> = {
  imported: 'Newly imported',
  linked: 'Linked to existing rule',
  unchanged: 'Already present · unchanged',
  changed: 'Already present · SIEM changed',
  pending: 'Waiting to import',
  ignored: 'Tracking stopped',
  failed: 'Import failed',
  unsupported: 'Not supported',
  ambiguous: 'Match needed',
};

export function NativeRulesPanel({ integration }: { integration: Integration }) {
  const { inventory, loading, error, running, reload, start } = useNativeSiemInventory(integration.id);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const allRules = inventory?.rules || [];
  const issues = inventory?.issues || [];
  const changes = allRules.filter((rule) => rule.binding_status === 'active' && rule.drift !== 'in_sync');
  const newlyImported = allRules.filter((rule) => rule.importResult === 'imported');
  const filtered = (filter === 'new' ? newlyImported : filter === 'changes' ? changes : allRules).filter((rule) =>
    `${rule.detection.name} ${rule.vendor_rule_id}`.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredIssues = issues.filter((issue) =>
    `${issue.vendor_rule_id} ${issue.error_message}`.toLowerCase().includes(search.toLowerCase()),
  );
  const totalRows = filter === 'attention' ? filteredIssues.length : filtered.length;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(totalRows / 50) - 1));
  const selectedRule = allRules.find((rule) => rule.id === selected);
  const run = inventory?.run;
  const counts = inventory?.counts || {};
  const count = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const lastChecked = run?.completed_at || inventory?.lastCompleteAt;
  const tabs = [
    { id: 'all', label: 'All rules', count: allRules.length },
    { id: 'new', label: 'Newly imported', count: newlyImported.length },
    { id: 'changes', label: 'With differences', count: changes.length },
    { id: 'attention', label: 'Needs attention', count: issues.length },
  ];
  return (
    <div className="py-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Detection rules</h2>
          <p className="mt-1 text-sm text-on-surface-variant">Bring CrowdStrike rules into your Production Library.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="text" onClick={() => setShowHelp(!showHelp)} aria-expanded={showHelp}>
            How importing works
          </Button>
          <Button leadingIcon="download" disabled={running || loading} onClick={start}>
            {running ? 'Importing rules…' : 'Import rules from CrowdStrike'}
          </Button>
        </div>
      </div>
      {showHelp && (
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
          Imports all supported correlation rules. New rules get a library copy; existing copies keep your edits. Rules
          in CrowdStrike are unchanged. Library copies are shared with your team.
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-xl bg-error/10 px-4 py-3 text-sm text-error"
        >
          <span>{error}</span>
          <Button size="sm" variant="text" onClick={reload}>
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
                  name={running ? 'refresh-cw' : issues.length || run.status === 'failed' ? 'alert-triangle' : 'check'}
                  className={`h-4 w-4 ${running ? 'animate-spin text-primary' : issues.length || run.status === 'failed' ? 'text-amber-600' : 'text-emerald-600'}`}
                />
                <span className="font-medium text-on-surface">
                  {running
                    ? run.phase === 'discovery'
                      ? 'Finding rules…'
                      : `Importing ${count - (counts.pending || 0)} of ${count}`
                    : run.status === 'failed'
                      ? 'Import failed'
                      : run.status === 'cancelled'
                        ? 'Import cancelled'
                        : 'Latest import'}
                </span>
                {!running && (
                  <span className="text-on-surface-variant">
                    {counts.imported || 0} new ·{' '}
                    {(counts.unchanged || 0) + (counts.changed || 0) + (counts.linked || 0)} already present
                    {!!issues.length && ` · ${issues.length} need attention`}
                  </span>
                )}
                {running && (
                  <span className="text-on-surface-variant">
                    You can leave this page. Import continues in the background.
                  </span>
                )}
              </div>
              {lastChecked && !running && (
                <time dateTime={lastChecked} className="text-on-surface-variant">
                  {new Date(lastChecked).toLocaleString()}
                </time>
              )}
            </div>
            {running && run.phase === 'hydration' && (
              <progress
                aria-label="Rules processed"
                className="mt-3 h-1 w-full accent-primary"
                value={count - (counts.pending || 0)}
                max={Math.max(count, 1)}
              />
            )}
            {run.error_message && <p className="mt-2 text-xs text-error">{run.error_message}</p>}
          </div>
        )}
        <div className="flex gap-1 overflow-x-auto border-b border-outline-variant/20 px-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={filter === tab.id}
              aria-label={`${tab.label} ${tab.count}`}
              onClick={() => {
                setFilter(tab.id);
                setPage(0);
              }}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3.5 text-sm font-medium transition-colors ${filter === tab.id ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
            >
              {tab.label}
              <span
                className={`rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${filter === tab.id ? 'bg-primary/10' : 'bg-surface-container-high'}`}
              >
                {tab.count}
              </span>
            </button>
          ))}
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
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
            />
          </div>
          <span className="ml-auto hidden sm:block whitespace-nowrap text-xs text-on-surface-variant">
            {filter === 'attention' ? 'Not imported' : 'Production Library'}
          </span>
        </div>
        {loading && !inventory ? (
          <div role="status" className="space-y-3 px-5 py-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-container-high" />
            ))}
          </div>
        ) : totalRows === 0 ? (
          <div className="px-6 py-14 text-center">
            <Icon
              name={filter === 'attention' ? 'check' : 'search'}
              className="mx-auto mb-3 h-6 w-6 text-on-surface-variant"
            />
            <h3 className="text-sm font-medium">
              {search
                ? 'No matching rules'
                : filter === 'attention'
                  ? 'Nothing needs attention'
                  : filter === 'new'
                    ? 'No new rules in the latest import'
                    : filter === 'changes'
                      ? 'No differences to review'
                      : 'Your imported rules will appear here'}
            </h3>
            <p className="mt-2 text-xs text-on-surface-variant">
              {search
                ? 'Try another rule name or CrowdStrike ID.'
                : filter === 'all'
                  ? 'Import from CrowdStrike to create library copies you can review and edit.'
                  : 'Choose All rules to return to your inventory.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {filter === 'attention' ? (
              <table className="w-full text-left text-sm">
                <thead className="border-y border-outline-variant/20 bg-surface-container/50 text-xs text-on-surface-variant">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">CrowdStrike rule ID</th>
                    <th className="px-5 py-2.5 font-medium">Import result</th>
                    <th className="px-5 py-2.5 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {filteredIssues.slice(currentPage * 50, currentPage * 50 + 50).map((issue) => (
                    <tr key={issue.vendor_rule_id}>
                      <td className="px-5 py-4 font-mono text-xs">{issue.vendor_rule_id}</td>
                      <td className="px-5 py-4 text-amber-700 dark:text-amber-400">
                        {IMPORT_RESULT_LABELS[issue.status] || 'Needs attention'}
                      </td>
                      <td className="px-5 py-4 text-on-surface-variant">{issue.error_message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-y border-outline-variant/20 bg-surface-container/50 text-xs text-on-surface-variant">
                  <tr>
                    {['Rule', 'Import result', 'In CrowdStrike', 'Comparison', ''].map((label, i) => (
                      <th key={i} scope="col" className="px-5 py-2.5 font-medium whitespace-nowrap">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {filtered.slice(currentPage * 50, currentPage * 50 + 50).map((rule) => (
                    <tr key={rule.id} className="transition-colors hover:bg-surface-container-high/50">
                      <td className="px-5 py-3.5 w-[34%] min-w-56">
                        <Link
                          className="font-medium text-on-surface hover:text-primary hover:underline"
                          to={routeHelpers.detectionDetail(rule.detection_id)}
                        >
                          {rule.detection.name}
                        </Link>
                        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-on-surface-variant">
                          <span className="rounded border border-outline-variant/30 px-1.5 py-0.5">CQL</span>
                          <span>{rule.detection.status} in library</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={
                            rule.importResult === 'imported'
                              ? 'rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary'
                              : 'text-xs text-on-surface-variant'
                          }
                        >
                          {IMPORT_RESULT_LABELS[rule.importResult || ''] || 'Not in latest import'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          title={`Last checked ${new Date(rule.last_seen_at).toLocaleString()}`}
                          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${rule.availability === 'present' && rule.observed_enabled ? 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400' : 'bg-surface-container-high text-on-surface-variant'}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                          {rule.availability === 'missing'
                            ? 'Not found'
                            : rule.availability !== 'present' || rule.observed_enabled === null
                              ? 'Unknown'
                              : rule.observed_enabled
                                ? 'Enabled'
                                : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        <span
                          className={
                            rule.drift === 'in_sync' ? 'text-on-surface-variant' : 'text-amber-700 dark:text-amber-400'
                          }
                        >
                          {rule.binding_status !== 'active'
                            ? 'Tracking stopped'
                            : rule.drift === 'in_sync'
                              ? 'No differences'
                              : NATIVE_DRIFT_LABELS[rule.drift]}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Button size="sm" variant="text" onClick={() => setSelected(rule.id)}>
                          View changes
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        {totalRows > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-outline-variant/20 px-5 py-2 text-xs text-on-surface-variant">
            <span>
              {currentPage * 50 + 1}–{Math.min((currentPage + 1) * 50, totalRows)} of {totalRows} rules
            </span>
            {totalRows > 50 && (
              <div className="flex gap-1">
                <Button size="sm" variant="text" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="text"
                  disabled={(currentPage + 1) * 50 >= totalRows}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
      {selectedRule && (
        <Modal
          title="Review rule changes"
          subject={{ label: 'Rule', value: selectedRule.detection.name }}
          size="xl"
          onClose={() => setSelected(null)}
          footer={
            <div className="flex justify-between items-center gap-3">
              <Link
                className="text-sm text-primary hover:underline"
                to={routeHelpers.detectionDetail(selectedRule.detection_id)}
              >
                Open library rule →
              </Link>
              <Button size="sm" variant="text" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          }
        >
          <p className="text-xs text-on-surface-variant break-all">CrowdStrike ID: {selectedRule.vendor_rule_id}</p>
          <NativeRuleReview key={selectedRule.id} bindingId={selectedRule.id} onChanged={() => void reload()} />
        </Modal>
      )}
    </div>
  );
}
