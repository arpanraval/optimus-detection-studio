import React from 'react';
import type { MappingResult } from '../../services/mitreMappingService';

interface Props {
  running: boolean;
  total: number;
  results: MappingResult[];
  error: string | null;
  onStop: () => void;
  onClose: () => void;
}

export function BulkMitreMappingDialog({ running, total, results, error, onStop, onClose }: Props) {
  const saved = results.filter((r) => r.status === 'saved').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  return (
    <div className="fixed inset-0 z-[70] bg-scrim/50 flex items-center justify-center p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="mitre-mapping-title"
        className="bg-surface-container rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto"
      >
        <h2 id="mitre-mapping-title" className="text-lg font-semibold text-on-surface">
          Resolve MITRE with AI
        </h2>
        <p className="mt-2 text-sm text-on-surface-variant">
          AI reads each query and saves its contextual technique and tactic mappings to the library. Selected rules’
          existing mappings are replaced only when a valid result is available.
        </p>
        <p className="mt-2 text-xs text-on-surface-variant">
          This updates library metadata; it does not change rules in your SIEM or verify detection effectiveness.
          {running && ' Keep this page open while the selected rules are processed.'}
        </p>
        <div role="status" aria-live="polite" className="my-4 rounded-xl bg-primary/10 p-4 text-sm text-on-surface">
          <strong>
            {running ? 'Resolving' : 'Finished'}: {results.length} of {total} processed
          </strong>
          <p className="mt-1">
            {saved} saved · {skipped} unresolved · {failed} failed
          </p>
          {!running && results.length < total && <p>{total - results.length} not processed.</p>}
        </div>
        {error && (
          <p role="alert" className="text-sm text-error mb-3">
            {error}
          </p>
        )}
        <div className="space-y-2">
          {results.map((result) => (
            <details key={result.id} className="rounded-xl border border-outline-variant/30 p-3 text-sm">
              <summary className="cursor-pointer text-on-surface">
                <span className={result.status === 'saved' ? 'text-primary' : 'text-on-surface-variant'}>
                  {result.status === 'saved' ? 'Saved' : result.status === 'skipped' ? 'Unresolved' : 'Failed'}
                </span>{' '}
                — {result.name}
              </summary>
              <p className="mt-2 whitespace-pre-line text-on-surface-variant">{result.reason}</p>
            </details>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <button
            onClick={running ? onStop : onClose}
            className="h-10 px-5 rounded-xl bg-primary text-on-primary text-sm font-medium"
          >
            {running ? 'Stop remaining work' : 'Done'}
          </button>
        </div>
      </section>
    </div>
  );
}
