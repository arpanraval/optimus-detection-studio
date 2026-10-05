import React, { useCallback, useEffect, useState } from 'react';
import type { DetectionPack } from '../../types';
import type { PackDeployJob } from '../../lib/packDeployJobService';
import { supabase } from '../../lib/supabaseClient';
import { usePackDeploymentStatus } from '../../hooks/usePackDeploymentStatus';
import { usePackDeployJob } from '../../hooks/usePackDeployJob';
import { Button } from '../ui';
import { PackQualityBar } from './PackQualityBar';

const STATUS_LABELS: Record<PackDeployJob['status'], string> = {
  queued: 'Queued',
  running: 'In progress',
  succeeded: 'Completed',
  partial: 'Partially completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function JobItems({ jobId }: { jobId: string }) {
  const { items, loading, error } = usePackDeployJob(jobId);
  if (error)
    return (
      <p role="alert" className="text-error p-4">
        {error}
      </p>
    );
  if (loading && !items.length) return <p className="p-4 text-on-surface-variant">Loading rule results...</p>;
  return (
    <ul className="divide-y divide-outline-variant/20 max-h-96 overflow-auto" aria-label="Rule results">
      {items.map((item) => (
        <li key={item.id} className="px-4 py-3 text-sm">
          <div className="flex justify-between gap-4">
            <span className="font-medium">{item.detection_name || item.detection_id}</span>
            <span className={item.status === 'failed' ? 'text-error' : 'text-on-surface-variant'}>{item.status}</span>
          </div>
          {item.error_message && <p className="mt-1 text-on-surface-variant break-words">{item.error_message}</p>}
          {item.needs_reconciliation && (
            <p className="mt-1 text-on-surface-variant">Check the remote rule before retrying.</p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function PackDeploymentsTab({ pack }: { pack: DetectionPack }) {
  const { statuses, error: statusError, refetch: refreshStatus } = usePackDeploymentStatus(pack.id);
  const [jobs, setJobs] = useState<PackDeployJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);

  const refreshJobs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await supabase
        .from('pack_deploy_jobs')
        .select('*,integrations(name)')
        .eq('pack_id', pack.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (result.error) throw result.error;
      setJobs((result.data || []) as PackDeployJob[]);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load deployment history.');
    } finally {
      setLoading(false);
    }
  }, [pack.id]);

  useEffect(() => {
    void refreshJobs();
    const channel = supabase
      .channel(`pack-deployment-history-${pack.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pack_deploy_jobs', filter: `pack_id=eq.${pack.id}` },
        () => {
          void refreshJobs();
          void refreshStatus();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [pack.id, refreshJobs, refreshStatus]);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Deployments</h2>
          <p className="text-sm text-on-surface-variant mt-1">Connections and deployment history for this pack.</p>
        </div>
        <Button
          variant="outlined"
          color="surface"
          leadingIcon="refresh"
          disabled={loading}
          onClick={() => {
            void refreshJobs();
            void refreshStatus();
          }}
        >
          Refresh
        </Button>
      </div>
      <div className="bg-surface-container rounded-xl border border-outline-variant/60 p-5">
        <PackQualityBar pack={pack} detections={pack.detections || []} />
      </div>
      {statusError && (
        <p role="alert" className="text-error">
          {statusError.message}
        </p>
      )}
      {statuses.length > 0 && (
        <section
          aria-label="Deployment coverage"
          className="bg-surface-container border border-outline-variant/60 rounded-xl divide-y divide-outline-variant/20"
        >
          {statuses.map((status) => (
            <div key={status.integration_id} className="p-5 flex flex-wrap justify-between gap-2 text-sm">
              <span className="font-medium">{status.integration_name || 'SIEM connection'}</span>
              <span className="text-on-surface-variant">
                {status.deployed_count} of {status.total_detections} rules deployed
              </span>
            </div>
          ))}
        </section>
      )}
      <section aria-label="Deployment history">
        <h3 className="font-semibold mb-2">Recent runs</h3>
        <p className="text-sm text-on-surface-variant mb-4">
          A successful deployment records a provider write. It does not establish query correctness or table
          availability.
        </p>
        {error && (
          <p role="alert" className="text-error mb-3">
            {error}
          </p>
        )}
        {loading && !jobs.length ? (
          <p className="text-sm text-on-surface-variant">Loading deployments...</p>
        ) : !error && !jobs.length ? (
          <p className="p-6 border border-outline-variant/60 rounded-xl text-sm text-on-surface-variant">
            No deployment runs recorded for this pack.
          </p>
        ) : null}
        <div className="space-y-3">
          {jobs.map((job) => (
            <article
              key={job.id}
              className="bg-surface-container border border-outline-variant/60 rounded-xl overflow-hidden"
            >
              <button
                type="button"
                className="w-full p-5 text-left hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                aria-expanded={selectedJob === job.id}
                aria-controls={`job-results-${job.id}`}
                onClick={() => setSelectedJob(selectedJob === job.id ? null : job.id)}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-semibold">{job.integrations?.name || 'SIEM connection'}</span>
                  <span className="text-on-surface-variant">{STATUS_LABELS[job.status]}</span>
                </div>
                <p className="text-xs text-on-surface-variant mt-1">{new Date(job.created_at).toLocaleString()}</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm mt-3">
                  <span>{job.succeeded_count} succeeded</span>
                  <span className={job.failed_count ? 'text-error' : 'text-on-surface-variant'}>
                    {job.failed_count} failed
                  </span>
                  <span className="text-on-surface-variant">{job.skipped_count} skipped</span>
                  <span className="text-on-surface-variant">{job.total_items} total</span>
                  <span className="ml-auto text-on-surface-variant">
                    {selectedJob === job.id ? 'Hide rule results' : 'View rule results'}
                  </span>
                </div>
              </button>
              {selectedJob === job.id && (
                <div id={`job-results-${job.id}`} className="border-t border-outline-variant/60">
                  <JobItems jobId={job.id} />
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
