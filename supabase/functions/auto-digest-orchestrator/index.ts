/**
 * Auto-Digest Orchestrator — Edge Function Entry Point
 *
 * Two HTTP entry points:
 *   - POST /                   : claim pending jobs, set them to
 *                                 processing/harvesting, dispatch each to
 *                                 ?action=run_phase. Service-role auth
 *                                 required (called from pg_cron via pg_net,
 *                                 or from trigger-auto-digest fire-and-forget).
 *   - POST /?action=run_phase  : internal — run ONE phase of ONE job.
 *                                 Body: { job_id }. Self-dispatches the
 *                                 next phase via the same endpoint.
 *
 * Why this shape: Supabase Edge terminates background workers ~150-250s.
 * The original orchestrator ran harvest → classify → rank → digest inline
 * for each user, and the digesting loop alone (30-60s per article × N) blew
 * the budget and stranded the rest as timeout_partial. By giving each phase
 * its own fresh edge-function lifetime — with the digesting phase processing
 * one article per hop — every article gets all the time it needs without
 * crashing the platform cap. Mirrors the threat-research-orchestrator pattern.
 *
 * Phase progression (one HTTP invocation per phase):
 *   harvesting → classifying → ranking → digesting (×N, one per article) → finalising
 *
 * State machine on auto_digest_jobs:
 *   status pending → processing → {completed, failed, timeout_partial}
 *   phase  null    → harvesting → classifying → ranking → digesting → finalising → null
 *   pending_entry_ids: jsonb array of articles left to digest, drained one-per-hop
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { handleCorsPreflight, corsJsonResponse, corsErrorResponse } from '../_shared/cors.ts'
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

/** Per-phase wall-clock guard. Platform terminates ~150-250s; we bail at
 *  240s so a graceful timeout marker lands before kill. Most phases finish
 *  well under this — digest is the only one that can come close, and we
 *  process one article per phase invocation now anyway. */
const PHASE_BUDGET_MS = 240_000;

/** Per-article digest call timeout. */
const DIGEST_TIMEOUT_MS = 120_000;

type Phase = 'harvesting' | 'classifying' | 'ranking' | 'digesting' | 'finalising';

// ---------------------------------------------------------------------------
// SSRF Protection
// ---------------------------------------------------------------------------

function isSafeArticleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const hostname = parsed.hostname.toLowerCase();
    const blocked = ['localhost', '127.0.0.1', '169.254.169.254', '[::1]'];
    if (blocked.includes(hostname)) return false;
    if (hostname.startsWith('10.') || hostname.startsWith('172.16.') || hostname.startsWith('192.168.')) return false;
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Phase dispatch + state helpers
// ---------------------------------------------------------------------------

/** Fire-and-forget self-call to ?action=run_phase for the next hop. The
 *  receiver returns 200 immediately and runs the actual work via
 *  EdgeRuntime.waitUntil, so this never blocks the caller. */
async function dispatchPhase(
  supabaseUrl: string,
  serviceRoleKey: string,
  jobId: string,
): Promise<void> {
  const url = `${supabaseUrl}/functions/v1/auto-digest-orchestrator?action=run_phase`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ job_id: jobId }),
    });
  } catch (e: any) {
    console.warn(`[orchestrator] dispatchPhase failed for ${jobId}:`, e?.message ?? e);
  }
}

async function advancePhase(supabase: any, jobId: string, nextPhase: Phase): Promise<void> {
  const { error } = await supabase
    .from('auto_digest_jobs')
    .update({ phase: nextPhase })
    .eq('id', jobId);
  if (error) console.warn(`[orchestrator] advancePhase ${jobId} → ${nextPhase} failed:`, error.message);
}

async function persistResult(supabase: any, jobId: string, result: JobResultSummary): Promise<void> {
  const { error } = await supabase
    .from('auto_digest_jobs')
    .update({ result_summary: result })
    .eq('id', jobId);
  if (error) console.warn(`[orchestrator] persistResult ${jobId} failed:`, error.message);
}

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
      phase: null,
      completed_at: new Date().toISOString(),
      result_summary: result,
    })
    .eq('id', jobId);
}

// ---------------------------------------------------------------------------
// Per-article digest processing — extracted from the original inline loop.
// One call ≈ one threat-intel-digest-v2 invocation, ≈ 30-60s.
// ---------------------------------------------------------------------------

async function processOneDigestArticle(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  ctx: RunContext,
  job: { id: string; user_id: string },
  settings: any,
  envProfile: EnvironmentProfileRow | null,
  entryId: string,
  result: JobResultSummary,
): Promise<void> {
  const digestStart = Date.now();
  try {
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
      return;
    }

    const feedRel = (entry.threat_intel_feeds as any) || {};
    const feedName = feedRel.name || 'Unknown Feed';
    const feedId: string | null = feedRel.id ?? null;

    if (!entry.url || !isSafeArticleUrl(entry.url)) {
      result.articles_failed += 1;
      result.errors.push(`Entry "${entry.title}": unsafe or missing URL`);
      await supabase
        .from('threat_intel_feed_entries')
        .update({ digest_status: 'extract_failed', extract_error: 'URL blocked by safety check' })
        .eq('id', entryId);
      await emit(ctx, 'article_digest_failed', {
        feed_id: feedId,
        feed_name: feedName,
        article_id: entry.id,
        article_title: entry.title,
        article_url: entry.url ?? null,
        reason: 'URL blocked by safety check (unsafe or missing)',
      });
      return;
    }

    await supabase
      .from('threat_intel_feed_entries')
      .update({ digest_status: 'digesting' })
      .eq('id', entry.id);

    // Plan A: prompt templates cached on auto_digest_settings.prompt_templates
    // by trigger-auto-digest. threat-intel-digest-v2 strictly requires them
    // and will throw "Missing summary prompt template" without them.
    const promptTemplates = (settings as any).prompt_templates ?? null;
    if (!promptTemplates || typeof promptTemplates !== 'object' || Object.keys(promptTemplates).length === 0) {
      result.errors.push(
        'No prompt templates cached for this user. Trigger a manual run from the Auto-Digest UI to seed them.',
      );
      result.articles_failed += 1;
      await emit(ctx, 'article_digest_failed', {
        feed_id: feedId,
        feed_name: feedName,
        article_id: entry.id,
        article_title: entry.title,
        article_url: entry.url ?? null,
        reason: 'No prompt templates cached. Trigger a manual run from the UI to seed them.',
        duration_ms: Date.now() - digestStart,
      });
      return;
    }

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
      userId: job.user_id,
      promptTemplates,
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
      return;
    }

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
        const { data, error } = await supabase
          .from('threat_intel_reports')
          .update(reportRow)
          .eq('id', existing.id)
          .select('id')
          .single();
        savedReport = data;
        upsertErr = error;
      } else {
        const { data, error } = await supabase
          .from('threat_intel_reports')
          .insert(reportRow)
          .select('id')
          .single();
        savedReport = data;
        upsertErr = error;
      }
    } else {
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
      return;
    }

    const reportId = savedReport.id;

    await supabase
      .from('threat_intel_feed_entries')
      .update({
        digest_status: 'ready',
        auto_digest_report_id: reportId,
        is_processed: true,
      })
      .eq('id', entry.id);

    await enrichFeasibility(supabase, reportId, job.user_id, envProfile);
    await detectAndMergeCampaign(supabase, reportId, job.user_id, result);

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
    console.error(`[orchestrator] Entry ${entryId} failed:`, entryError?.message);
    await supabase
      .from('threat_intel_feed_entries')
      .update({ digest_status: 'digest_failed' })
      .eq('id', entryId);
    result.errors.push(`Entry ${entryId}: ${entryError?.message || 'Unknown error'}`);
    result.articles_failed += 1;
    await emit(ctx, 'article_digest_failed', {
      article_id: entryId,
      reason: entryError?.message || 'Unknown error',
      duration_ms: Date.now() - digestStart,
    });
  }
}

// ---------------------------------------------------------------------------
// Phase worker — runs one phase of one job, then dispatches the next phase.
// ---------------------------------------------------------------------------

async function runPhase(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  jobId: string,
): Promise<void> {
  const { data: job, error: loadErr } = await supabase
    .from('auto_digest_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (loadErr || !job) {
    console.warn(`[runPhase] job ${jobId} not found:`, loadErr?.message);
    return;
  }
  if (job.status !== 'processing') {
    console.log(`[runPhase] job ${jobId} not in processing (${job.status}), skipping`);
    return;
  }

  const phase = job.phase as Phase | null;
  if (!phase) {
    console.warn(`[runPhase] job ${jobId} has null phase while processing — bailing`);
    return;
  }

  const result: JobResultSummary = (job.result_summary as JobResultSummary) ?? emptyJobResult();
  const ctx: RunContext = { supabase, jobId: job.id, userId: job.user_id };

  try {
    // Settings + env profile are needed by most phases. Load once per hop.
    const { data: settings, error: settingsErr } = await supabase
      .from('auto_digest_settings')
      .select('*')
      .eq('user_id', job.user_id)
      .single();

    if (settingsErr || !settings) {
      result.errors.push('No auto_digest_settings found — skipping');
      await markJobCompleted(supabase, jobId, 'completed', result);
      return;
    }

    const { data: envProfiles } = await supabase
      .from('environment_profiles')
      .select('industry, siem_platforms, log_sources, edr_tools, cloud_platforms, crown_jewels, sectors')
      .eq('user_id', job.user_id)
      .limit(1);
    const envProfile: EnvironmentProfileRow | null =
      envProfiles && envProfiles.length > 0 ? envProfiles[0] : null;

    switch (phase) {
      case 'harvesting': {
        const entryIds = await harvestFeeds(ctx, result);
        await persistResult(supabase, jobId, result);

        if (entryIds.length === 0) {
          await markJobCompleted(supabase, jobId, 'completed', result);
          return;
        }
        await advancePhase(supabase, jobId, 'classifying');
        await dispatchPhase(supabaseUrl, serviceRoleKey, jobId);
        return;
      }

      case 'classifying': {
        // Re-query rather than pass IDs across the hop — keeps the job
        // row small and the queue resilient to stale state.
        const { data: harvestedRows } = await supabase
          .from('threat_intel_feed_entries')
          .select('id')
          .eq('user_id', job.user_id)
          .eq('digest_status', 'harvested')
          .gte('fetched_at', new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString())
          .limit(50);
        const harvIds: string[] = (harvestedRows || []).map((r: any) => r.id);

        if (harvIds.length === 0) {
          await markJobCompleted(supabase, jobId, 'completed', result);
          return;
        }

        await classifyEntries(
          ctx,
          harvIds,
          settings.classification_model || settings.ai_model || 'gemini-3-flash-preview',
          result,
        );
        await persistResult(supabase, jobId, result);

        await advancePhase(supabase, jobId, 'ranking');
        await dispatchPhase(supabaseUrl, serviceRoleKey, jobId);
        return;
      }

      case 'ranking': {
        const { data: classifiedRows } = await supabase
          .from('threat_intel_feed_entries')
          .select('id')
          .eq('user_id', job.user_id)
          .eq('digest_status', 'classified');
        const classIds: string[] = (classifiedRows || []).map((r: any) => r.id);

        if (classIds.length === 0) {
          await markJobCompleted(supabase, jobId, 'completed', result);
          return;
        }

        const selectedIds = await rankAndSelect(
          ctx,
          classIds,
          settings.max_articles_per_day,
          envProfile,
        );
        // Stash selected IDs as the digesting queue, advance phase, persist
        // result — all in one UPDATE so the next hop sees a consistent view.
        await supabase
          .from('auto_digest_jobs')
          .update({
            result_summary: result,
            phase: 'digesting',
            pending_entry_ids: selectedIds,
          })
          .eq('id', jobId);

        if (selectedIds.length === 0) {
          await markJobCompleted(supabase, jobId, 'completed', result);
          return;
        }
        await dispatchPhase(supabaseUrl, serviceRoleKey, jobId);
        return;
      }

      case 'digesting': {
        const pending = (job.pending_entry_ids as string[]) ?? [];
        if (pending.length === 0) {
          await advancePhase(supabase, jobId, 'finalising');
          await dispatchPhase(supabaseUrl, serviceRoleKey, jobId);
          return;
        }

        // Pop one. Update DB FIRST to "claim" the article — minimizes the
        // risk of duplicate processing if a stray run_phase dispatch races
        // with this one. The downstream report upsert is also idempotent
        // on (user_id, source_url) as a second line of defense.
        const entryId = pending[0];
        const remaining = pending.slice(1);
        await supabase
          .from('auto_digest_jobs')
          .update({ pending_entry_ids: remaining })
          .eq('id', jobId);

        await processOneDigestArticle(
          supabase,
          supabaseUrl,
          serviceRoleKey,
          ctx,
          { id: job.id, user_id: job.user_id },
          settings,
          envProfile,
          entryId,
          result,
        );

        await persistResult(supabase, jobId, result);

        if (remaining.length > 0) {
          // Self-dispatch — fresh isolate, fresh budget, one more article.
          await dispatchPhase(supabaseUrl, serviceRoleKey, jobId);
        } else {
          await advancePhase(supabase, jobId, 'finalising');
          await dispatchPhase(supabaseUrl, serviceRoleKey, jobId);
        }
        return;
      }

      case 'finalising': {
        await markJobCompleted(supabase, jobId, 'completed', result);
        return;
      }

      default:
        throw new Error(`Unknown phase: ${phase}`);
    }
  } catch (err: any) {
    console.error(`[runPhase] job ${jobId} phase ${phase} failed:`, err?.message);
    result.errors.push(`Phase ${phase}: ${err?.message || 'Unknown error'}`);
    await markJobCompleted(supabase, jobId, 'failed', result);
  }
}

// ---------------------------------------------------------------------------
// HTTP entry
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
      return corsErrorResponse('Forbidden — service role required', req, 403);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // ─── Internal: run one phase of one job ────────────────────────────────
    if (req.method === 'POST' && action === 'run_phase') {
      let body: any;
      try { body = await req.json(); } catch { return corsErrorResponse('Invalid JSON body', req, 400); }
      const jobId = typeof body?.job_id === 'string' ? body.job_id : '';
      if (!jobId) return corsErrorResponse('job_id is required', req, 400);

      // Run the phase in the background; return 200 immediately.
      // EdgeRuntime.waitUntil keeps the isolate alive after the response
      // so the work has time to finish — same pattern as
      // threat-research-orchestrator.
      const work = runPhase(supabase, supabaseUrl, serviceRoleKey, jobId).catch((e) => {
        console.error('[orchestrator] run_phase background error:', e);
      });
      // @ts-ignore — EdgeRuntime is provided by the Supabase Deno runtime.
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(work);
      }
      return corsJsonResponse({ ok: true, job_id: jobId }, req);
    }

    // ─── Default: claim pending jobs and kick off their first phase ────────
    const { data: pendingJobs, error: jobsError } = await supabase
      .from('auto_digest_jobs')
      .select('id, user_id, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    if (jobsError) {
      console.error('[orchestrator] Failed to fetch pending jobs:', jobsError.message);
      return corsErrorResponse(`Job query failed: ${jobsError.message}`, req, 500);
    }
    if (!pendingJobs || pendingJobs.length === 0) {
      return corsJsonResponse({ message: 'No pending jobs', processed: 0 }, req);
    }

    const dispatched: string[] = [];
    for (const job of pendingJobs) {
      // Atomic claim — only succeed if status is still pending. Stops two
      // concurrent dispatchers from double-running the same job.
      const { error: claimErr } = await supabase
        .from('auto_digest_jobs')
        .update({
          status: 'processing',
          phase: 'harvesting',
          started_at: new Date().toISOString(),
        })
        .eq('id', job.id)
        .eq('status', 'pending');
      if (claimErr) {
        console.warn(`[orchestrator] claim ${job.id} failed:`, claimErr.message);
        continue;
      }
      await dispatchPhase(supabaseUrl, serviceRoleKey, job.id);
      dispatched.push(job.id);
    }

    return corsJsonResponse({
      message: 'Dispatched',
      dispatched: dispatched.length,
      job_ids: dispatched,
    }, req);
  } catch (err: any) {
    console.error('[orchestrator] Unhandled error:', err.message);
    return corsErrorResponse(err.message || 'Internal server error', req, 500);
  }
});
