/**
 * Auto-Digest Orchestrator — Edge Function Entry Point
 *
 * Processes pending auto-digest jobs created by pg_cron. For each job:
 * Harvest feeds -> Classify entries -> Rank & select -> Digest via
 * threat-intel-digest-v2 -> Enrich feasibility -> Detect campaigns.
 *
 * Called by pg_cron via pg_net, not by users directly.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders, handleCorsPreflight, corsJsonResponse, corsErrorResponse } from '../_shared/cors.ts'
import { harvestFeeds } from './lib/harvester.ts'
import { classifyEntries } from './lib/classifier.ts'
import { rankAndSelect } from './lib/relevance-scorer.ts'
import { detectAndMergeCampaign } from './lib/campaign-detector.ts'
import { enrichFeasibility } from './lib/feasibility-enricher.ts'
import { emptyJobResult } from './lib/types.ts'
import type { JobResultSummary, EnvironmentProfileRow } from './lib/types.ts'
import { emit, type RunContext } from './lib/events.ts'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Edge function timeout budget — bail at 4.5 min of the 5 min limit */
const TIME_BUDGET_MS = 270_000;

/** Per-article digest timeout */
const DIGEST_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// SSRF Protection
// ---------------------------------------------------------------------------

/** Validate that a URL is safe to fetch (blocks internal/private addresses). */
function isSafeArticleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const hostname = parsed.hostname.toLowerCase();
    const blocked = ['localhost', '127.0.0.1', '169.254.169.254', '[::1]'];
    if (blocked.includes(hostname)) return false;
    // Block private IP ranges
    if (hostname.startsWith('10.') || hostname.startsWith('172.16.') || hostname.startsWith('192.168.')) return false;
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // 1. CORS preflight
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    // 2. Auth check — must be service_role key (from pg_cron via pg_net)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
      return corsErrorResponse('Forbidden — service role required', req, 403);
    }

    // 3. Create service-role Supabase client
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 4. Fetch pending jobs
    const { data: pendingJobs, error: jobsError } = await supabase
      .from('auto_digest_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    if (jobsError) {
      console.error('[orchestrator] Failed to fetch jobs:', jobsError.message);
      return corsErrorResponse(`Job query failed: ${jobsError.message}`, req, 500);
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      return corsJsonResponse({ message: 'No pending jobs', processed: 0 }, req);
    }

    // 5. Process each job
    const jobSummaries: Array<{
      job_id: string;
      digested: number;
      skipped: number;
      failed: number;
      errors_count: number;
    }> = [];

    const orchestratorStart = Date.now();

    for (const job of pendingJobs) {
      const jobStart = Date.now();
      const result: JobResultSummary = emptyJobResult();

      try {
        // 6a. Mark job as processing
        await supabase
          .from('auto_digest_jobs')
          .update({ status: 'processing', started_at: new Date().toISOString() })
          .eq('id', job.id);

        // 6b. Fetch user's auto_digest_settings
        const { data: settings, error: settingsErr } = await supabase
          .from('auto_digest_settings')
          .select('*')
          .eq('user_id', job.user_id)
          .single();

        if (settingsErr || !settings) {
          await markJobCompleted(supabase, job.id, 'completed', result);
          result.errors.push('No auto_digest_settings found — skipping');
          jobSummaries.push(buildJobSummary(job, result));
          continue;
        }

        // 6c. Fetch user's environment profile
        const { data: envProfiles } = await supabase
          .from('environment_profiles')
          .select('industry, siem_platforms, log_sources, edr_tools, cloud_platforms, crown_jewels, sectors')
          .eq('user_id', job.user_id)
          .limit(1);

        const envProfile: EnvironmentProfileRow | null =
          envProfiles && envProfiles.length > 0 ? envProfiles[0] : null;

        // Build per-job RunContext for the events trail. Every helper that
        // emits transcript events takes this so it has supabase + jobId + userId
        // and can write to auto_digest_run_events without piping primitives
        // through every signature.
        const ctx: RunContext = { supabase, jobId: job.id, userId: job.user_id };

        // 6d. HARVEST
        const entryIds = await harvestFeeds(ctx, result);

        if (entryIds.length === 0) {
          await markJobCompleted(supabase, job.id, 'completed', result);
          jobSummaries.push(buildJobSummary(job, result));
          continue;
        }

        // 6f. CLASSIFY
        const classifiedIds = await classifyEntries(
          ctx,
          entryIds,
          settings.classification_model || settings.ai_model || 'gemini-3-flash-preview',
          result,
        );

        if (classifiedIds.length === 0) {
          await markJobCompleted(supabase, job.id, 'completed', result);
          jobSummaries.push(buildJobSummary(job, result));
          continue;
        }

        // 6h. RANK & SELECT
        const selectedIds = await rankAndSelect(
          ctx,
          classifiedIds,
          settings.max_articles_per_day,
          envProfile,
        );

        // 6i. RESOLVE + DIGEST loop
        let timedOut = false;

        for (const entryId of selectedIds) {
          // Time budget check
          if (Date.now() - jobStart > TIME_BUDGET_MS) {
            console.warn(`[orchestrator] Time budget exceeded for job ${job.id}`);
            timedOut = true;
            break;
          }

          const digestStart = Date.now();
          try {
            // Fetch entry details with feed name + id
            const { data: entry, error: entryErr } = await supabase
              .from('threat_intel_feed_entries')
              .select('id, url, title, content, feed_id, threat_intel_feeds(id, name)')
              .eq('id', entryId)
              .single();

            if (entryErr || !entry) {
              result.errors.push(`Entry fetch ${entryId}: ${entryErr?.message || 'not found'}`);
              result.articles_failed += 1;
              await emit(ctx, 'article_digest_failed', {
                article_id: entryId,
                reason: entryErr?.message || 'Entry not found',
              });
              continue;
            }

            const feedRel = (entry.threat_intel_feeds as any) || {};
            const feedName = feedRel.name || 'Unknown Feed';
            const feedId: string | null = feedRel.id ?? null;

            // Validate entry URL before passing to digest (SSRF protection)
            if (!entry.url || !isSafeArticleUrl(entry.url)) {
              result.articles_failed += 1;
              result.errors.push(`Entry "${entry.title}": unsafe or missing URL`);
              await supabase
                .from('threat_intel_feed_entries')
                .update({
                  digest_status: 'extract_failed',
                  extract_error: 'URL blocked by safety check',
                })
                .eq('id', entryId);
              await emit(ctx, 'article_digest_failed', {
                feed_id: feedId,
                feed_name: feedName,
                article_id: entry.id,
                article_title: entry.title,
                article_url: entry.url ?? null,
                reason: 'URL blocked by safety check (unsafe or missing)',
              });
              continue;
            }

            // Mark entry as digesting
            await supabase
              .from('threat_intel_feed_entries')
              .update({ digest_status: 'digesting' })
              .eq('id', entry.id);

            // Call threat-intel-digest-v2
            const digestUrl = `${supabaseUrl}/functions/v1/threat-intel-digest-v2`;
            const digestBody = {
              sourceType: 'url',
              url: entry.url,
              model: settings.digest_model || settings.ai_model || 'gemini-3-flash-preview',
              options: {
                extractIoCs: true,
                extractRules: true,
                mapToMitre: true,
                findLibraryMatches: true,
              },
            };

            const digestRes = await fetch(digestUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify(digestBody),
              signal: AbortSignal.timeout(DIGEST_TIMEOUT_MS),
            });

            if (!digestRes.ok) {
              const errText = await digestRes.text();
              throw new Error(`Digest HTTP ${digestRes.status}: ${errText.slice(0, 300)}`);
            }

            const digestData = await digestRes.json();

            // Mark entry as digest_failed if the response indicates failure
            if (digestData.error) {
              await supabase
                .from('threat_intel_feed_entries')
                .update({ digest_status: 'digest_failed' })
                .eq('id', entry.id);

              result.errors.push(`Digest ${entryId}: ${digestData.error}`);
              result.articles_failed += 1;
              await emit(ctx, 'article_digest_failed', {
                feed_id: feedId,
                feed_name: feedName,
                article_id: entry.id,
                article_title: entry.title,
                article_url: entry.url ?? null,
                reason: digestData.error,
                duration_ms: Date.now() - digestStart,
              });
              continue;
            }

            // Build report row from digest response
            const report = digestData.report || digestData;
            const summary = report.summary || {};
            const classification = report.classification || {};
            const ttps = report.ttps || [];
            const iocs = report.iocs || [];
            const rules = report.rules || [];
            const mitreMapping = report.mitreMapping || report.mitre_mapping || null;
            const libraryMatches = report.libraryMatches || report.library_matches || null;
            const sectionErrors = report.sectionErrors || report.section_errors || null;

            const ttpCount = Array.isArray(ttps) ? ttps.length : 0;
            const iocCount = Array.isArray(iocs) ? iocs.length : 0;
            const ruleCount = Array.isArray(rules) ? rules.length : 0;
            const coveredTTPs = Array.isArray(ttps)
              ? ttps.filter((t: any) => t.hasExistingDetection === true || t.covered === true).length
              : 0;
            const coveragePercent = ttpCount > 0 ? Math.round((coveredTTPs / ttpCount) * 100) : 0;

            // Upsert report to threat_intel_reports
            const reportRow = {
              user_id: job.user_id,
              name: summary.title || entry.title || 'Untitled Report',
              source_type: 'url',
              source_url: entry.url,
              raw_content_preview: (entry.content || '').slice(0, 2000),
              summary,
              classification,
              ttps,
              iocs,
              rules,
              mitre_mapping: mitreMapping,
              library_matches: libraryMatches,
              processing_stage: 'complete',
              section_errors: sectionErrors,
              report_title: summary.title || entry.title || null,
              threat_level: classification.threat_level || summary.threat_level || null,
              attack_type: classification.attack_type || summary.attack_type || null,
              attribution: summary.attribution || null,
              organization: feedName,
              ttp_count: ttpCount,
              ioc_count: iocCount,
              rule_count: ruleCount,
              coverage_percent: coveragePercent,
              source: 'auto',
              source_feed_name: feedName,
              source_article_url: entry.url,
              review_status: 'pending',
              relevance_score: 0,
            };

            // Check if a report already exists for this user + source_url
            let savedReport: { id: string } | null = null;
            let upsertErr: any = null;

            if (entry.url) {
              const { data: existing } = await supabase
                .from('threat_intel_reports')
                .select('id')
                .eq('user_id', job.user_id)
                .eq('source_url', entry.url)
                .limit(1)
                .maybeSingle();

              if (existing) {
                // Update existing report
                const { data, error } = await supabase
                  .from('threat_intel_reports')
                  .update(reportRow)
                  .eq('id', existing.id)
                  .select('id')
                  .single();
                savedReport = data;
                upsertErr = error;
              } else {
                // Insert new report
                const { data, error } = await supabase
                  .from('threat_intel_reports')
                  .insert(reportRow)
                  .select('id')
                  .single();
                savedReport = data;
                upsertErr = error;
              }
            } else {
              // No URL — just insert
              const { data, error } = await supabase
                .from('threat_intel_reports')
                .insert(reportRow)
                .select('id')
                .single();
              savedReport = data;
              upsertErr = error;
            }

            if (upsertErr || !savedReport) {
              await supabase
                .from('threat_intel_feed_entries')
                .update({ digest_status: 'digest_failed' })
                .eq('id', entry.id);

              result.errors.push(`Report save ${entryId}: ${upsertErr?.message || 'no data'}`);
              result.articles_failed += 1;
              await emit(ctx, 'article_digest_failed', {
                feed_id: feedId,
                feed_name: feedName,
                article_id: entry.id,
                article_title: entry.title,
                article_url: entry.url ?? null,
                reason: `Report save failed: ${upsertErr?.message || 'no data'}`,
                duration_ms: Date.now() - digestStart,
              });
              continue;
            }

            const reportId = savedReport.id;

            // Update feed entry: ready + linked to report
            await supabase
              .from('threat_intel_feed_entries')
              .update({
                digest_status: 'ready',
                auto_digest_report_id: reportId,
                is_processed: true,
              })
              .eq('id', entry.id);

            // FEASIBILITY enrichment
            await enrichFeasibility(supabase, reportId, job.user_id, envProfile);

            // CAMPAIGN detection
            await detectAndMergeCampaign(supabase, reportId, job.user_id, result);

            // Update counters
            result.articles_digested += 1;
            result.articles_resolved += 1;

            await emit(ctx, 'article_digested', {
              feed_id: feedId,
              feed_name: feedName,
              article_id: entry.id,
              article_title: entry.title,
              article_url: entry.url ?? null,
              duration_ms: Date.now() - digestStart,
              payload: {
                report_id: reportId,
                ttp_count: ttpCount,
                ioc_count: iocCount,
                rule_count: ruleCount,
                coverage_percent: coveragePercent,
              },
            });
          } catch (entryError: any) {
            // Per-entry error handling
            console.error(`[orchestrator] Entry ${entryId} failed:`, entryError.message);

            await supabase
              .from('threat_intel_feed_entries')
              .update({ digest_status: 'digest_failed' })
              .eq('id', entryId);

            result.errors.push(`Entry ${entryId}: ${entryError.message || 'Unknown error'}`);
            result.articles_failed += 1;
            await emit(ctx, 'article_digest_failed', {
              article_id: entryId,
              reason: entryError.message || 'Unknown error',
              duration_ms: Date.now() - digestStart,
            });
          }
        }

        // 6j. Mark job completed (or timeout_partial)
        const finalStatus = timedOut ? 'timeout_partial' : 'completed';
        await markJobCompleted(supabase, job.id, finalStatus, result);
      } catch (jobError: any) {
        // Job-level error
        console.error(`[orchestrator] Job ${job.id} failed:`, jobError.message);
        result.errors.push(`Job error: ${jobError.message || 'Unknown error'}`);
        await markJobCompleted(supabase, job.id, 'failed', result);
      }

      jobSummaries.push(buildJobSummary(job, result));
    }

    // 7. Return summary
    const elapsedMs = Date.now() - orchestratorStart;
    return corsJsonResponse(
      {
        processed: jobSummaries.length,
        elapsed_ms: elapsedMs,
        jobs: jobSummaries,
      },
      req,
    );
  } catch (err: any) {
    console.error('[orchestrator] Unhandled error:', err.message);
    return corsErrorResponse(err.message || 'Internal server error', req, 500);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mark a job as completed/failed/timeout_partial and store result summary.
 */
async function markJobCompleted(
  supabase: any,
  jobId: string,
  status: 'completed' | 'failed' | 'timeout_partial',
  result: JobResultSummary,
): Promise<void> {
  await supabase
    .from('auto_digest_jobs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      result_summary: result,
    })
    .eq('id', jobId);
}

/**
 * Build a summary object for the response payload.
 */
function buildJobSummary(
  job: any,
  result: JobResultSummary,
): {
  job_id: string;
  digested: number;
  skipped: number;
  failed: number;
  errors_count: number;
} {
  return {
    job_id: job.id,
    digested: result.articles_digested,
    skipped: result.articles_skipped,
    failed: result.articles_failed,
    errors_count: result.errors.length,
  };
}
