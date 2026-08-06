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
import { linkBySubject } from './lib/subject-linker.ts'
import { enrichFeasibility } from './lib/feasibility-enricher.ts'
import {
  assertPhaseBudget,
  emptyJobResult,
  normalizeJobResult,
  PHASE_BUDGET_MS,
  PhaseBudgetExceeded,
} from './lib/types.ts'
import type { JobResultSummary, EnvironmentProfileRow } from './lib/types.ts'
import { emit, type RunContext } from './lib/events.ts'
import { DEFAULT_PROMPT_TEMPLATES } from '../threat-intel-digest-v2/lib/default-prompts.ts'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Per-article digest call timeout. The digest function runs 4 sequential AI
 *  calls (summary, classification, TTPs, IoCs+rules); on long technical
 *  articles the IoC pass alone can take 60-90s with Gemini, so 120s was too
 *  tight. 110s leaves ~40s headroom inside the 150s platform limit, allowing
 *  graceful recovery. */
const DIGEST_TIMEOUT_MS = 110_000;

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

async function enqueuePhase(
  supabase: any,
  _supabaseUrl: string,
  _serviceRoleKey: string,
  jobId: string,
  phase: Phase,
  entryId?: string,
): Promise<void> {
  const { data: messageId, error } = await supabase.rpc('auto_digest_enqueue', {
    p_kind: 'run_phase',
    p_job_id: jobId,
    p_entry_id: entryId ?? null,
    p_payload: { phase },
  });
  if (error) throw new Error(`Queue enqueue for ${jobId}/${phase} failed: ${error.message}`);
  if (messageId === null || messageId === undefined) {
    throw new Error('Durable queue is unavailable; refusing legacy fire-and-forget dispatch');
  }
}

async function advancePhase(supabase: any, jobId: string, nextPhase: Phase): Promise<void> {
  const { error } = await supabase
    .from('auto_digest_jobs')
    .update({ phase: nextPhase, phase_started_at: null, phase_lease_expires_at: null, phase_attempt_count: 0, heartbeat_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) throw new Error(`advancePhase ${jobId} → ${nextPhase} failed: ${error.message}`);
}

async function persistResult(supabase: any, jobId: string, result: JobResultSummary): Promise<void> {
  const { error } = await supabase
    .from('auto_digest_jobs')
    .update({ result_summary: result, heartbeat_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) throw new Error(`persistResult ${jobId} failed: ${error.message}`);
}

async function markJobCompleted(
  supabase: any,
  jobId: string,
  status: 'completed' | 'partial' | 'cancelled' | 'failed' | 'timeout_partial',
  result: JobResultSummary,
): Promise<void> {
  const { error } = await supabase
    .from('auto_digest_jobs')
    .update({
      status,
      outcome: status === 'completed' ? 'complete' : status === 'timeout_partial' || status === 'partial' ? 'partial' : status === 'cancelled' ? 'cancelled' : 'failed',
      phase: null,
      phase_started_at: null,
      phase_lease_expires_at: null,
      completed_at: new Date().toISOString(),
      result_summary: result,
      active_entry_id: null,
      pending_entry_ids: [],
      heartbeat_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  if (error) throw new Error(`markJobCompleted ${jobId} failed: ${error.message}`);
}

async function recoverPendingEntries(supabase: any, userId: string, pendingEntryIds: unknown): Promise<void> {
  if (!Array.isArray(pendingEntryIds) || pendingEntryIds.length === 0) return;
  const ids = pendingEntryIds.filter((id): id is string => typeof id === 'string');
  if (ids.length === 0) return;
  const { data: recovered, error } = await supabase
    .from('threat_intel_feed_entries')
    .update({ digest_status: 'classified' })
    .eq('user_id', userId)
    .in('id', ids)
    .in('digest_status', ['queued', 'digesting'])
    .select('id');
  if (error) {
    console.warn('[orchestrator] failed to recover pending entries:', error.message);
    return;
  }

  // Give the day's quota back for exactly the rows we reverted.
  //
  // Counting `ids` instead would double-refund: recoverableEntryIds is read
  // when the job row is loaded, which is BEFORE digesting pops the active
  // entry, so a failure after complete_auto_digest_entry has already settled
  // that article would refund it twice. Only rows still sitting in
  // queued/digesting were actually left unsettled, and the filter above means
  // those are precisely the rows this UPDATE touched.
  const releaseCount = (recovered || []).length;
  if (releaseCount === 0) return;
  const { error: releaseError } = await supabase.rpc('release_auto_digest_article_quota', {
    p_user_id: userId,
    p_count: releaseCount,
  });
  // Non-fatal by design: a leaked reservation self-corrects at UTC midnight,
  // whereas throwing here would mask the original failure being recovered from.
  if (releaseError) {
    console.warn('[orchestrator] failed to release digest quota:', releaseError.message);
  }
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
      .select('id, url, title, content, full_content, content_length, feed_id, relevance_score, auto_digest_report_id, canonical_url, content_hash, source_content_hash, source_quality, threat_intel_feeds(id, name, extraction_method)')
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
    const extractionMethod = feedRel.extraction_method === 'jina_reader' ? 'jina_reader' : 'direct';

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

    const { error: digestingError } = await supabase
      .from('threat_intel_feed_entries')
      .update({ digest_status: 'digesting' })
      .eq('id', entry.id);
    if (digestingError) throw new Error(`Failed to mark entry digesting: ${digestingError.message}`);

    // Plan A: prompt templates cached on auto_digest_settings.prompt_templates
    // by trigger-auto-digest. threat-intel-digest-v2 strictly requires them
    // and will throw "Missing summary prompt template" without them.
    const promptTemplates = { ...DEFAULT_PROMPT_TEMPLATES, ...(((settings as any).prompt_templates ?? {}) as Record<string, string>) };
    if (!promptTemplates || typeof promptTemplates !== 'object' || Object.keys(promptTemplates).length === 0) {
      result.errors.push(
        'No prompt templates cached for this user. Trigger a manual run from the Auto-Digest UI to seed them.',
      );
      result.articles_failed += 1;
      // The earlier write set digest_status='digesting' (line below in
      // the previous code path); without an update here, the entry would
      // sit forever in 'digesting' state and never re-enter the queue
      // (the harvester's recovery loop only picks up 'harvested'). Setting
      // 'digest_failed' makes the failure visible in the UI and lets a
      // future retry surface re-trigger it deliberately.
      await supabase
        .from('threat_intel_feed_entries')
        .update({
          digest_status: 'digest_failed',
          extract_error: 'No prompt templates cached at digest time',
        })
        .eq('id', entry.id);
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

    const reportCorrelationId = entry.auto_digest_report_id || crypto.randomUUID();
    const digestUrl = `${supabaseUrl}/functions/v1/threat-intel-digest-v2`;
    const digestModel = settings.digest_model || settings.ai_model || 'gemini-3.6-flash';
    const modelProvider = digestModel.startsWith('gpt') ? 'openai' : digestModel.startsWith('claude') ? 'anthropic' : 'google';
    const promptVersion = typeof settings.prompt_templates?.version === 'string' ? settings.prompt_templates.version : 'threat-intel-digest-2026-07-17.1';
    const pipelineVersion = 'auto-digest-queue-2026-07-17.1';
    const extractionStartedAt = new Date(digestStart).toISOString();
    const digestBody = {
      sourceType: 'url',
      url: entry.url,
      model: digestModel,
      options: {
        extractIoCs: true,
        extractRules: true,
        mapToMitre: true,
        findLibraryMatches: true,
        autoDigest: true,
        extractionMethod,
      },
      userId: job.user_id,
      reportId: reportCorrelationId,
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
      throw new Error(`Digest HTTP ${digestRes.status}`);
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
    const reportOutcome = digestData.outcome === 'cancelled' ? 'cancelled' : digestData.outcome === 'failed' ? 'failed' : sectionErrors && typeof sectionErrors === 'object' && Object.keys(sectionErrors).length > 0 ? 'partial' : 'complete';
    if (reportOutcome === 'partial') result.errors.push(`Partial analysis for ${entryId}: ${Object.keys(sectionErrors || {}).join(', ') || 'one or more sections failed'}`);
    const persistedSectionOutcomes = report.sectionOutcomes || report.section_outcomes;
    const sectionOutcomes = persistedSectionOutcomes && typeof persistedSectionOutcomes === 'object'
      ? persistedSectionOutcomes
      : reportOutcome === 'partial' ? Object.fromEntries(Object.keys(sectionErrors as Record<string, unknown>).map(key => [key, 'failed'])) : {};

    const ttpCount = Array.isArray(ttps) ? ttps.length : 0;
    const iocCount = Array.isArray(iocs) ? iocs.length : 0;
    const ruleCount = Array.isArray(rules) ? rules.length : 0;
    const eligibleTtpIds = new Set(
      (Array.isArray(ttps) ? ttps : [])
        .filter((ttp: any) => ttp.validationState === 'validated' && ttp.evidenceSupported !== false)
        .map((ttp: any) => ttp.mitreId)
        .filter(Boolean),
    );
    const coveredTtpIds = new Set(
      (Array.isArray(libraryMatches) ? libraryMatches : [])
        .flatMap((match: any) => Array.isArray(match.matchedTTPs) ? match.matchedTTPs : [])
        .filter((id: string) => eligibleTtpIds.has(id)),
    );
    const coveragePercent = eligibleTtpIds.size > 0 ? Math.round((coveredTtpIds.size / eligibleTtpIds.size) * 100) : null;
    const libraryOverlapPercent = typeof report.libraryOverlapPercent === 'number' ? report.libraryOverlapPercent : coveragePercent;
    const validatedOverlapPercent = typeof report.validatedOverlapPercent === 'number' ? report.validatedOverlapPercent : null;
    const deploymentReadinessPercent = typeof report.deploymentReadinessPercent === 'number' ? report.deploymentReadinessPercent : null;

    // Read the entry's selection-time relevance_score so we can attach it
    // to the report row. Previously `relevance_score: 0` was hardcoded,
    // so every report shipped with score=0 even when the ranker had
    // computed a real value at selection time.
    const entryRelevanceScore = typeof (entry as any).relevance_score === 'number'
      ? (entry as any).relevance_score
      : 0;

    // Server-derived columns. These are always written on insert AND
    // update — the digest's own output shouldn't be preserved across
    // re-runs. Kept as a single object so the column list stays grep-able.
    const serverDerivedFields: Record<string, unknown> = {
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
      processing_stage: reportOutcome === 'complete' ? 'complete' : 'error',
      outcome: reportOutcome,
      section_outcomes: sectionOutcomes,
      section_errors: sectionErrors,
      report_title: summary.title || entry.title || null,
      threat_level: summary.threatLevel || null,
      attack_type: classification.primaryType || null,
      attribution: Array.isArray(report.possibleActorMentions) && report.possibleActorMentions.length > 0
        ? report.possibleActorMentions[0]
        : null,
      possible_actor_mentions: Array.isArray(report.possibleActorMentions) ? report.possibleActorMentions : [],
      organization: feedName,
      ttp_count: ttpCount,
      ioc_count: iocCount,
      rule_count: ruleCount,
      coverage_percent: coveragePercent,
      library_overlap_percent: libraryOverlapPercent,
      validated_overlap_percent: validatedOverlapPercent,
      deployment_readiness_percent: deploymentReadinessPercent,
      source: 'auto',
      source_feed_name: feedName,
      source_article_url: entry.url,
      relevance_score: entryRelevanceScore,
      content_hash: (entry as any).content_hash || null,
      source_content_hash: report.sourceContentHash || (entry as any).source_content_hash || null,
      source_quality: report.sourceQuality || 'legacy_unverified',
      source_content_length: Number(report.sourceContentLength || 0) || null,
      quality_warnings: Array.isArray(report.qualityWarnings) ? report.qualityWarnings : [],
      canonical_url: (entry as any).canonical_url || entry.url,
      fetched_url: entry.url,
      model_provider: modelProvider,
      model_version: digestModel,
      prompt_version: promptVersion,
      pipeline_version: pipelineVersion,
      attack_version: 'ATT&CK-current',
      extraction_started_at: extractionStartedAt,
      extraction_completed_at: new Date().toISOString(),
    };

    // Insert-only columns. Preserved across re-runs so a user who has
    // already triaged a report doesn't lose their work when the article
    // is re-digested. The previous version always wrote these on update,
    const { data: persistedReports, error: upsertErr } = await supabase.rpc('upsert_auto_digest_report', {
      p_report_id: reportCorrelationId,
      p_user_id: job.user_id,
      p_source_url: entry.url,
      p_payload: { ...serverDerivedFields, id: reportCorrelationId },
    })
    const persistedReport = Array.isArray(persistedReports) ? persistedReports[0] : persistedReports
    const savedReport: { id: string } | null = persistedReport?.report_id ? { id: persistedReport.report_id } : null

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

    const { error: readyError } = await supabase
      .from('threat_intel_feed_entries')
      .update({
        digest_status: 'ready',
        auto_digest_report_id: reportId,
        is_processed: true,
        source_quality: report.sourceQuality || 'legacy_unverified',
        source_content_hash: report.sourceContentHash || (entry as any).source_content_hash || null,
        content_length: Number(report.sourceContentLength || 0) || (entry as any).content_length || null,
        extract_error: reportOutcome === 'partial' ? `Partial analysis: ${Object.keys(sectionErrors).join(', ')}` : null,
      })
      .eq('id', entry.id);
    if (readyError) throw new Error(`Failed to mark entry ready: ${readyError.message}`);

    // The report has been saved to the library — that's the load-bearing
    // success. Count it as digested NOW so a downstream enrichment failure
    // can't roll back the count and leave the user looking at "0 digested,
    // 1 failed" while a real report sits in their library. Enrichment +
    // campaign detection are best-effort follow-ups; their failures get
    // logged separately as 'errors[]' entries on the result, but they do
    // not retroactively flip the digest verdict.
    result.articles_digested += 1;
    result.articles_resolved += 1;

    try {
      await enrichFeasibility(supabase, reportId, job.user_id, envProfile);
    } catch (e: any) {
      console.error(`[orchestrator] enrichFeasibility ${reportId} failed:`, e?.message);
      result.errors.push(`Feasibility ${entryId}: ${e?.message || 'unknown'}`);
    }
    try {
      // Subject-linker decides whether this report belongs to an existing
      // campaign (multi-vendor coverage of the same story) by asking the
      // classifier model. Uses the same configured classifier model so
      // billing/telemetry tracks consistently with the rest of the pipeline.
      const linkerModel = settings.classification_model
        || settings.ai_model
        || 'gemini-3.6-flash';
      await linkBySubject(supabase, ctx, reportId, job.user_id, linkerModel, result);
    } catch (e: any) {
      console.error(`[orchestrator] linkBySubject ${reportId} failed:`, e?.message);
      result.errors.push(`Subject-link ${entryId}: ${e?.message || 'unknown'}`);
    }

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
  expectedPhase?: Phase,
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

  if (job.cancellation_requested) return;
  const phase = job.phase as Phase | null;
  if (!phase) {
    console.warn(`[runPhase] job ${jobId} has null phase while processing — bailing`);
    return;
  }

  const result: JobResultSummary = normalizeJobResult(job.result_summary);
  if (expectedPhase && expectedPhase !== phase) {
    console.log(`[runPhase] stale queue message for ${jobId}: expected ${expectedPhase}, current ${phase}`);
    return;
  }
  const { data: phaseClaimed, error: phaseClaimError } = await supabase.rpc('claim_auto_digest_phase', {
    p_job_id: jobId,
    p_phase: phase,
    p_lease_seconds: phase === 'digesting' ? 180 : 300,
  });
  if (phaseClaimError) throw new Error(`Failed to claim ${phase} phase: ${phaseClaimError.message}`);
  if (!phaseClaimed) {
    console.log(`[runPhase] phase ${phase} for ${jobId} is already leased; skipping duplicate delivery`);
    return;
  }
  const ctx: RunContext = { supabase, jobId: job.id, userId: job.user_id };
  const phaseDeadline = Date.now() + PHASE_BUDGET_MS;
  let recoverableEntryIds: unknown = job.pending_entry_ids;

  try {
    // Settings + env profile are needed by most phases. Load once per hop.
    const { data: settings, error: settingsErr } = await supabase
      .from('auto_digest_settings')
      .select('*')
      .eq('user_id', job.user_id)
      .single();

    if (settingsErr || !settings) {
      result.errors.push('No auto_digest_settings found — skipping');
      await markJobCompleted(supabase, jobId, 'failed', result);
      return;
    }

    const { data: envProfiles } = await supabase
      .from('environment_profiles')
      .select('industry, siem_platforms, log_sources, edr_tools, cloud_platforms, crown_jewels, sectors')
      .eq('user_id', job.user_id)
      .limit(1);
    const envProfile: EnvironmentProfileRow | null =
      envProfiles && envProfiles.length > 0 ? envProfiles[0] : null;
    assertPhaseBudget(phaseDeadline, phase);

    switch (phase) {
      case 'harvesting': {
        await harvestFeeds(ctx, result, phaseDeadline);
        assertPhaseBudget(phaseDeadline, phase);
        await persistResult(supabase, jobId, result);

        // Deliberately does NOT terminate on an empty harvest. Ranking is the
        // single place a run ends for lack of work, because it is the only
        // phase that sees entries stranded by an EARLIER run — a 'classified'
        // row that was selected but never digested.
        //
        // Ending the run here instead meant a quiet day silently abandoned
        // that backlog: harvest dedupes on what is already stored, so a retry
        // after a failure harvests 0 and stopped right here, never reaching
        // the phase that would have picked the stranded articles back up.
        // That is exactly why the two articles stranded by the 2026-08-06
        // failure could not be recovered by pressing Run Now.
        //
        // Cost is two extra queue hops on a genuinely empty day.
        await advancePhase(supabase, jobId, 'classifying');
        await enqueuePhase(supabase, supabaseUrl, serviceRoleKey, jobId, 'classifying');
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

        // Nothing new to classify is not the end of the run — see the note in
        // 'harvesting'. Entries stranded in 'classified' by an earlier failure
        // are picked up by ranking, the single termination point.
        if (harvIds.length > 0) {
          await classifyEntries(
            ctx,
            harvIds,
            settings.classification_model || settings.ai_model || 'gemini-3.6-flash',
            result,
            phaseDeadline,
          );
          assertPhaseBudget(phaseDeadline, phase);
          await persistResult(supabase, jobId, result);
        }

        await advancePhase(supabase, jobId, 'ranking');
        await enqueuePhase(supabase, supabaseUrl, serviceRoleKey, jobId, 'ranking');
        return;
      }

      case 'ranking': {
        const { data: classifiedRows } = await supabase
          .from('threat_intel_feed_entries')
          .select('id')
          .eq('user_id', job.user_id)
          .eq('digest_status', 'classified')
          .gte('fetched_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
        const classIds: string[] = (classifiedRows || []).map((r: any) => r.id);

        if (classIds.length === 0) {
          await markJobCompleted(supabase, jobId, 'completed', result);
          return;
        }

        let selectedIds = await rankAndSelect(
          ctx,
          classIds,
          settings.max_articles_per_day,
          envProfile,
          phaseDeadline,
        );
        // rankAndSelect marks selected rows queued before quota and durable
        // job state are persisted. Keep the IDs locally so any later ranking
        // failure can release them instead of stranding queued articles.
        recoverableEntryIds = selectedIds;
        // Reserve today's article quota before anything is staged, so a
        // partial grant trims the queue rather than stranding queued rows.
        if (selectedIds.length > 0) {
          const { data: quotaGranted, error: quotaError } = await supabase.rpc(
            'reserve_auto_digest_article_quota',
            { p_user_id: job.user_id, p_requested: selectedIds.length, p_daily_limit: Number(settings.max_articles_per_day || 3) }
          )
          if (quotaError) throw new Error(`Daily article quota reservation failed: ${quotaError.message}`)
          const granted = Math.max(0, Math.min(selectedIds.length, Number(quotaGranted || 0)))
          if (granted < selectedIds.length) {
            const releasedIds = selectedIds.slice(granted)
            selectedIds = selectedIds.slice(0, granted)
            const { error: releaseError } = await supabase.from('threat_intel_feed_entries').update({ digest_status: 'classified' }).in('id', releasedIds)
            if (releaseError) throw new Error(`Failed to release quota-limited entries: ${releaseError.message}`)
          }
          recoverableEntryIds = selectedIds;
        }
        // Materialise the per-article durable rows BEFORE handing off.
        // claim_auto_digest_entry leases an *existing* auto_digest_job_entries
        // row and returns nothing when there is none, so skipping this fails
        // every article with "could not be leased".
        //
        // `phase` is set explicitly: the column's own default ('digesting')
        // is not in its CHECK constraint, so an insert that omits it fails.
        if (selectedIds.length > 0) {
          const { error: entryRowsError } = await supabase
            .from('auto_digest_job_entries')
            .upsert(
              selectedIds.map((feedEntryId) => ({
                job_id: jobId,
                user_id: job.user_id,
                feed_entry_id: feedEntryId,
                phase: 'digest',
                status: 'pending',
              })),
              { onConflict: 'job_id,feed_entry_id', ignoreDuplicates: true },
            );
          if (entryRowsError) {
            throw new Error(`Failed to create durable digest entries: ${entryRowsError.message}`);
          }
        }

        // Stash selected IDs as the digesting queue, advance phase, persist
        // result — all in one UPDATE so the next hop sees a consistent view.
        const { error: rankUpdateError } = await supabase
          .from('auto_digest_jobs')
          .update({
            result_summary: result,
            phase: 'digesting',
            pending_entry_ids: selectedIds,
            phase_started_at: null,
            phase_lease_expires_at: null,
            phase_attempt_count: 0,
            heartbeat_at: new Date().toISOString(),
          })
          .eq('id', jobId);
        if (rankUpdateError) {
          throw new Error(`Failed to stage the digest queue: ${rankUpdateError.message}`);
        }

        await enqueuePhase(supabase, supabaseUrl, serviceRoleKey, jobId, 'digesting');
        return;
      }

      case 'digesting': {
        // pending_entry_ids is the work queue. One article is drained per hop
        // so each gets a fresh isolate and a fresh phase budget.
        const pending = Array.isArray(job.pending_entry_ids)
          ? (job.pending_entry_ids as unknown[]).filter((id): id is string => typeof id === 'string')
          : [];
        if (pending.length === 0) {
          await advancePhase(supabase, jobId, 'finalising');
          await enqueuePhase(supabase, supabaseUrl, serviceRoleKey, jobId, 'finalising');
          return;
        }

        // Pop one and write the remainder back BEFORE processing. On a
        // retryable failure complete_auto_digest_entry prepends this
        // feed-entry ID back onto pending_entry_ids, so leaving it in place
        // here would queue the same article twice.
        const entryId = pending[0];
        const remaining = pending.slice(1);
        const { error: claimStateError } = await supabase
          .from('auto_digest_jobs')
          .update({
            pending_entry_ids: remaining,
            active_entry_id: entryId,
            heartbeat_at: new Date().toISOString(),
          })
          .eq('id', jobId);
        if (claimStateError) {
          throw new Error(`Failed to stage digest entry ${entryId}: ${claimStateError.message}`);
        }

        const { data: leasedEntries, error: leaseError } = await supabase.rpc('claim_auto_digest_entry', {
          p_job_id: jobId,
          p_entry_id: entryId,
          p_lease_seconds: 300,
        });
        if (leaseError) throw new Error(`Failed to claim digest entry: ${leaseError.message}`);
        if (!leasedEntries || leasedEntries.length === 0) {
          await supabase.from('auto_digest_jobs').update({ active_entry_id: null }).eq('id', jobId);
          throw new Error(`Durable digest entry ${entryId} could not be leased`);
        }
        if (Number(leasedEntries[0].attempt_count || 0) > 1) {
          // A successful retry supersedes the prior attempt's transient
          // failure. Remove its counter/message before recording this attempt
          // so a recovered job is not finalized partial for a stale error.
          result.articles_failed = Math.max(0, result.articles_failed - 1);
          result.errors = result.errors.filter((message) =>
            !message.startsWith(`Entry ${entryId}:`) && !message.startsWith(`Digest ${entryId}:`));
        }
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

        assertPhaseBudget(phaseDeadline, phase);

        const { data: entryState, error: entryStateError } = await supabase
          .from('threat_intel_feed_entries')
          .select('digest_status, auto_digest_report_id, extract_error')
          .eq('id', entryId)
          .maybeSingle();
        if (entryStateError) throw new Error(`Failed to read digest entry result: ${entryStateError.message}`);
        const entryOutcome = entryState?.digest_status === 'ready' ? 'succeeded' : entryState?.digest_status === 'skipped' ? 'skipped' : 'failed';
        const { error: completeEntryError } = await supabase.rpc('complete_auto_digest_entry', {
          p_entry_id: leasedEntries[0].id,
          p_status: entryOutcome,
          p_report_id: entryState?.auto_digest_report_id ?? null,
          p_error_code: entryOutcome === 'failed' ? 'DIGEST_FAILED' : null,
          p_error: entryState?.extract_error ?? null,
        });
        // Clear active_entry_id now that it is resolved
        if (completeEntryError) throw new Error(`Failed to complete digest entry: ${completeEntryError.message}`);
        const { data: entryLeaseState, error: entryLeaseStateError } = await supabase
          .from('auto_digest_job_entries')
          .select('status')
          .eq('id', leasedEntries[0].id)
          .maybeSingle();
        if (entryLeaseStateError) throw new Error(`Failed to read durable entry state: ${entryLeaseStateError.message}`);
        const { error: clearActiveError } = await supabase
          .from('auto_digest_jobs')
          .update({
            active_entry_id: null,
            phase_started_at: null,
            phase_lease_expires_at: null,
            phase_attempt_count: 0,
            heartbeat_at: new Date().toISOString(),
          })
          .eq('id', jobId);
        if (clearActiveError) throw new Error(`Failed to clear active digest entry: ${clearActiveError.message}`);

        await persistResult(supabase, jobId, result);

        const { data: currentJob } = await supabase
          .from('auto_digest_jobs')
          .select('status, cancellation_requested')
          .eq('id', jobId)
          .maybeSingle();
        if (currentJob?.status === 'cancelled' || currentJob?.cancellation_requested) return;
        if (entryLeaseState?.status === 'pending') {
          // complete_auto_digest_entry already restored the feed-entry ID to
          // pending_entry_ids and enqueued the bounded retry.
          return;
        }
        if (remaining.length > 0) {
          // Self-dispatch — fresh isolate, fresh budget, one more article.
          await enqueuePhase(supabase, supabaseUrl, serviceRoleKey, jobId, 'digesting');
        } else {
          await advancePhase(supabase, jobId, 'finalising');
          await enqueuePhase(supabase, supabaseUrl, serviceRoleKey, jobId, 'finalising');
        }
        return;
      }

      case 'finalising': {
        const { error: finalizeError } = await supabase.rpc('finalize_auto_digest_job', { p_job_id: jobId });
        if (finalizeError) throw new Error(`Failed to finalize digest job: ${finalizeError.message}`);
        return;
      }

      default:
        throw new Error(`Unknown phase: ${phase}`);
    }
  } catch (err: any) {
    console.error(`[runPhase] job ${jobId} phase ${phase} failed:`, err?.message);
    result.errors.push(`Phase ${phase}: ${err?.message || 'Unknown error'}`);
    await recoverPendingEntries(supabase, job.user_id, recoverableEntryIds);
    await markJobCompleted(
      supabase,
      jobId,
      err instanceof PhaseBudgetExceeded ? 'timeout_partial' : 'failed',
      result,
    );
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

      const expectedPhase = ['harvesting', 'classifying', 'ranking', 'digesting', 'finalising'].includes(body?.expected_phase)
        ? body.expected_phase as Phase
        : undefined;
      const synchronous = url.searchParams.get('sync') === '1';
      if (synchronous) {
        await runPhase(supabase, supabaseUrl, serviceRoleKey, jobId, expectedPhase);
        return corsJsonResponse({ ok: true, job_id: jobId, synchronous: true }, req);
      }
      // Run the phase in the background; return 200 immediately.
      // EdgeRuntime.waitUntil keeps the isolate alive after the response
      // so the work has time to finish — same pattern as
      // threat-research-orchestrator.
      const work = runPhase(supabase, supabaseUrl, serviceRoleKey, jobId, expectedPhase).catch((e) => {
        console.error('[orchestrator] run_phase background error:', e);
      });
      // @ts-ignore — EdgeRuntime is provided by the Supabase Deno runtime.
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(work);
      }
      return corsJsonResponse({ ok: true, job_id: jobId }, req);
    }

    if (req.method === 'POST' && action === 'start_job') {
      let body: any;
      try { body = await req.json(); } catch { return corsErrorResponse('Invalid JSON body', req, 400); }
      const jobId = typeof body?.job_id === 'string' ? body.job_id : '';
      if (!jobId) return corsErrorResponse('job_id is required', req, 400);
      const now = new Date().toISOString();
      const { data: claimedRows, error: claimError } = await supabase
        .from('auto_digest_jobs')
        .update({
          status: 'processing',
          phase: 'harvesting',
          started_at: now,
          phase_started_at: null,
          phase_lease_expires_at: null,
          phase_attempt_count: 0,
          heartbeat_at: now,
          active_entry_id: null,
        })
        .eq('id', jobId)
        .eq('status', 'pending')
        .select('id');
      if (claimError) return corsErrorResponse('Job claim failed', req, 503);
      if (!claimedRows || claimedRows.length === 0) {
        return corsJsonResponse({ ok: true, job_id: jobId, claimed: false }, req);
      }
      await enqueuePhase(supabase, supabaseUrl, serviceRoleKey, jobId, 'harvesting');
      return corsJsonResponse({ ok: true, job_id: jobId, claimed: true }, req);
    }

    // ─── Internal: run the subject-linker for a single existing report ─────
    // Used for chunked backfill: invoke linkBySubject against a report that
    // was digested before the linker existed. Synchronous (returns the
    // result_summary deltas) so the caller can verify each backfill chunk.
    // No new digest, no DB writes other than what the linker itself does.
    if (req.method === 'POST' && action === 'link_existing') {
      let body: any;
      try { body = await req.json(); } catch { return corsErrorResponse('Invalid JSON body', req, 400); }
      const reportId = typeof body?.report_id === 'string' ? body.report_id : '';
      if (!reportId) return corsErrorResponse('report_id is required', req, 400);

      // Fetch the report so we know which user + which classifier model to
      // route the AI call through. We reuse the same model selection logic as
      // a real digest run.
      const { data: report, error: reportErr } = await supabase
        .from('threat_intel_reports')
        .select('id, user_id, source, name')
        .eq('id', reportId)
        .single();
      if (reportErr || !report) {
        return corsErrorResponse(`Report ${reportId} not found: ${reportErr?.message}`, req, 404);
      }
      if (report.source !== 'auto') {
        return corsErrorResponse('link_existing only operates on source=auto reports', req, 400);
      }

      const { data: settings, error: settingsErr } = await supabase
        .from('auto_digest_settings')
        .select('classification_model, ai_model')
        .eq('user_id', report.user_id)
        .single();
      if (settingsErr || !settings) {
        return corsErrorResponse('No auto_digest_settings for report owner', req, 500);
      }

      const linkerModel = settings.classification_model
        || settings.ai_model
        || 'gemini-3.6-flash';

      // Spin a synthetic RunContext + result summary so the linker can emit
      // events as if it were running inside a real job. We don't have a
      // job_id here; the linker's event sink requires one. Create a one-off
      // backfill job row so events have a valid FK and the JobTranscript UI
      // can render the run.
      const { data: synthJob, error: synthErr } = await supabase
        .from('auto_digest_jobs')
        .insert({
          user_id: report.user_id,
          status: 'completed',         // backfill — no harvest/digest happened
          phase: null,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          result_summary: { feeds_fetched: 0, articles_harvested: 0, articles_recovered: 0,
                            articles_classified: 0, articles_passed_gate: 0, articles_skipped: 0,
                            articles_resolved: 0, articles_digested: 0, articles_failed: 0,
                            campaigns_created: 0, campaigns_updated: 0, errors: [],
                            backfill: { report_id: reportId } },
          error: null,
        })
        .select('id')
        .single();
      if (synthErr || !synthJob) {
        return corsErrorResponse(`Failed to create backfill job: ${synthErr?.message}`, req, 500);
      }

      const ctx: RunContext = { supabase, jobId: synthJob.id, userId: report.user_id };
      const result: JobResultSummary = emptyJobResult();

      try {
        await linkBySubject(supabase, ctx, reportId, report.user_id, linkerModel, result);
      } catch (e: any) {
        result.errors.push(`Subject-link ${reportId}: ${e?.message || 'unknown'}`);
      }

      // Persist the final result_summary onto the synthetic job so the
      // transcript surfaces the linker's decisions even after we return.
      await supabase
        .from('auto_digest_jobs')
        .update({ result_summary: { ...result, backfill: { report_id: reportId } } })
        .eq('id', synthJob.id);

      return corsJsonResponse({
        ok: true,
        report_id: reportId,
        report_name: report.name,
        backfill_job_id: synthJob.id,
        result_summary: result,
      }, req);
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
      const { data: claimedRows, error: claimErr } = await supabase
        .from('auto_digest_jobs')
        .update({
          status: 'processing',
          phase: 'harvesting',
          started_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
          active_entry_id: null,
        })
        .eq('id', job.id)
        .eq('status', 'pending')
        .select('id');
      if (claimErr) {
        console.warn(`[orchestrator] claim ${job.id} failed:`, claimErr.message);
        continue;
      }
      if (!claimedRows || claimedRows.length !== 1) {
        console.log(`[orchestrator] claim ${job.id} lost to another dispatcher`);
        continue;
      }
      await enqueuePhase(supabase, supabaseUrl, serviceRoleKey, job.id, 'harvesting');
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
