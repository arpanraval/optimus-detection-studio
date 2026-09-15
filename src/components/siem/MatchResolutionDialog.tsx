import React from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { nativeSiemService, type MatchCandidate, type RuleContent } from '@/services/nativeSiemService';
import type { InventoryRow } from '../../../supabase/functions/_shared/native-siem-model';

interface CandidateGroup {
  detection_id: string;
  detection_name: string;
  evidence: string;
  detection_version: number;
  queries: MatchCandidate[];
}

function groupCandidates(candidates: MatchCandidate[]): CandidateGroup[] {
  const groups = new Map<string, CandidateGroup>();
  for (const candidate of candidates) {
    let group = groups.get(candidate.detection_id);
    if (!group) {
      group = {
        detection_id: candidate.detection_id,
        detection_name: candidate.detection_name,
        evidence: candidate.evidence,
        detection_version: candidate.detection_version,
        queries: [],
      };
      groups.set(candidate.detection_id, group);
    }
    group.queries.push(candidate);
  }
  return [...groups.values()];
}

export interface MatchResolutionDialogProps {
  integrationId: string;
  row: InventoryRow;
  onClose: () => void;
  /** Called after a successful link so the caller can reload rows and counts. */
  onLinked: () => void;
  /** "Import as a separate rule" defers entirely to the normal import flow — this dialog
   *  never starts an import itself, it only hands control back. */
  onImportSeparate: () => void;
}

/**
 * Resolves a `match_needed` catalog row: show each candidate with the evidence that makes it
 * eligible, compare the chosen library query against the observed CrowdStrike query, then let
 * the user link the existing rule, import a separate copy, or skip.
 */
export function MatchResolutionDialog({
  integrationId,
  row,
  onClose,
  onLinked,
  onImportSeparate,
}: MatchResolutionDialogProps): React.JSX.Element {
  const [candidates, setCandidates] = React.useState<MatchCandidate[] | null>(null);
  const [remote, setRemote] = React.useState<RuleContent | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [detectionId, setDetectionId] = React.useState<string | null>(null);
  const [queryId, setQueryId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await nativeSiemService.matchCandidates(integrationId, row.vendor_rule_id);
        const snapshot = row.latest_snapshot_id ? await nativeSiemService.remoteSnapshot(row.latest_snapshot_id) : null;
        if (!cancelled) {
          setCandidates(found);
          setRemote(snapshot);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Unable to load matching candidates');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [integrationId, row.vendor_rule_id, row.latest_snapshot_id]);

  const groups = React.useMemo(() => groupCandidates(candidates ?? []), [candidates]);
  const selectedGroup = groups.find((group) => group.detection_id === detectionId) ?? null;
  const selectedQuery = selectedGroup?.queries.find((query) => query.query_id === queryId) ?? null;
  const baselineEstablished = !!selectedQuery && !!remote && selectedQuery.query_text === remote.query;

  const handleLink = async () => {
    if (!selectedGroup || !selectedQuery || !row.latest_snapshot_id) return;
    setBusy(true);
    setActionError(null);
    try {
      await nativeSiemService.linkExisting({
        integrationId,
        vendorRuleId: row.vendor_rule_id,
        detectionId: selectedGroup.detection_id,
        queryId: selectedQuery.query_id,
        detectionVersion: selectedGroup.detection_version,
        snapshotId: row.latest_snapshot_id,
      });
      onLinked();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to link this rule');
    } finally {
      setBusy(false);
    }
  };

  const canLink = !!selectedGroup && !!selectedQuery && !busy;

  return (
    <Modal
      title="Resolve match"
      subject={{ label: 'CrowdStrike rule', value: row.display_name }}
      size="xl"
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="text" disabled={busy} onClick={onClose}>
            Skip
          </Button>
          <Button size="sm" variant="tonal" disabled={busy} onClick={() => onImportSeparate()}>
            Import as a separate rule
          </Button>
          <Button size="sm" disabled={!canLink} onClick={() => void handleLink()}>
            {busy ? 'Linking…' : 'Link existing library rule'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {loadError && (
          <p role="alert" className="text-sm text-error">
            {loadError}
          </p>
        )}
        {actionError && (
          <p role="alert" className="text-sm text-error">
            {actionError}
          </p>
        )}
        {candidates === null && !loadError && <p className="text-sm text-on-surface-variant">Loading candidates…</p>}
        {candidates !== null && groups.length === 0 && !loadError && (
          <p className="text-sm text-on-surface-variant">No eligible library rule found for this CrowdStrike rule.</p>
        )}
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.detection_id} className="rounded-xl border border-outline-variant p-3">
              <label className="flex items-start gap-3">
                <input
                  type="radio"
                  name="match-candidate"
                  className="mt-1"
                  checked={detectionId === group.detection_id}
                  onChange={() => {
                    setDetectionId(group.detection_id);
                    setQueryId(group.queries.length === 1 ? group.queries[0].query_id : null);
                  }}
                />
                <span>
                  <span className="block text-sm font-medium text-on-surface">{group.detection_name}</span>
                  <span className="block text-xs text-on-surface-variant">{group.evidence}</span>
                </span>
              </label>
              {detectionId === group.detection_id && group.queries.length > 1 && (
                <div className="mt-2 ml-7 space-y-1.5">
                  {group.queries.map((query) => (
                    <label key={query.query_id} className="flex items-center gap-2 text-xs">
                      <input
                        type="radio"
                        name="match-candidate-query"
                        checked={queryId === query.query_id}
                        onChange={() => setQueryId(query.query_id)}
                      />
                      <span className="font-mono">{query.query_id}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {selectedQuery && (
          <>
            {!baselineEstablished && (
              <p role="alert" className="text-sm text-on-surface-variant">
                Baseline not established. Linking will not change either copy. Review the difference before
                deploying.
              </p>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <section className="min-w-0 p-3 rounded-xl bg-surface-container-high">
                <h4 className="text-sm font-semibold mb-2">In your library</h4>
                <p className="text-sm mb-2">{selectedGroup?.detection_name}</p>
                <pre className="text-xs whitespace-pre-wrap break-words max-h-72 overflow-auto font-mono">
                  {selectedQuery.query_text}
                </pre>
              </section>
              <section className="min-w-0 p-3 rounded-xl bg-surface-container-high">
                <h4 className="text-sm font-semibold mb-2">In CrowdStrike · last fetched</h4>
                <p className="text-sm mb-2">{row.display_name}</p>
                <pre className="text-xs whitespace-pre-wrap break-words max-h-72 overflow-auto font-mono">
                  {remote?.query ?? ''}
                </pre>
              </section>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
