/**
 * Threat Intel Digest V2 - Edge Function
 *
 * Modular implementation of threat intelligence report analysis.
 * Accepts optional prompt templates from client for customization.
 *
 * This is a refactored version of threat-intel-digest with separated concerns.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders, handleCorsPreflight, corsErrorResponse } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rate-limiter.ts'

// Import modules
import { fetchContent } from './lib/content-fetcher.ts'
import { extractSummary, extractClassification, extractTTPs, extractIoCsWithAI } from './lib/ai-extractor.ts'
import { extractRulesFromContent } from './lib/rule-extractor.ts'
import { performMitreMatching } from './lib/mitre-matcher.ts'
import { findLibraryMatches } from './lib/library-matcher.ts'
import { buildDigestEnvelope, deriveReportOutcome } from './lib/response-contract.ts'
import { reconcileQualityWarnings } from './lib/quality-warnings.ts'
import { planStages, invalidatesFeasibility, type DigestStage } from './lib/retry-plan.ts'

// Import types
import type {
  DigestRequest,
  ThreatReport,
  ReportSummary,
  ReportClassification,
  ExtractedTTP,
  ExtractedIoC,
  ExtractedRule,
  MitreMapping,
  LibraryMatch,
  StageResult
} from './lib/types.ts'

import {
  ThreatLevel,
  AttackType,
  ProcessingStage,
  DEFAULT_MODEL
} from './lib/types.ts'
import { DEFAULT_PROMPT_TEMPLATES } from './lib/default-prompts.ts'
import { applyEvidenceQualityGate, actorHasAttributionEvidence, namesAreCompatible } from './lib/evidence-quality.ts'

// =============================================================================
// STAGE EXECUTION HELPER
// =============================================================================

async function executeStage<T>(
  stageName: string,
  operation: () => Promise<T>
): Promise<StageResult<T>> {
  const startTime = Date.now()
  try {
    const data = await operation()
    console.log(`Stage ${stageName} completed in ${Date.now() - startTime}ms`)
    return {
      success: true,
      data,
      durationMs: Date.now() - startTime
    }
  } catch (error) {
    console.error(`Stage ${stageName} failed:`, error)
    return {
      success: false,
      error: 'Stage failed',
      durationMs: Date.now() - startTime
    }
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflight(req)
  if (preflightResponse) return preflightResponse

  // Get CORS headers for this request (validates origin)
  const corsHeaders = getCorsHeaders(req)

  const startTime = Date.now()

  try {
    // Authenticate
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // Service-role internal calls (auto-digest-orchestrator runs as service-role
    // on behalf of the job's owner) take a different path: getUser() rejects
    // the service-role key as "not a user JWT" and returns 401 — which is the
    // root cause of the "Digest HTTP 401" the orchestrator transcript shows.
    // Caller must pass the owning user's id in the body so RLS-scoped reads/
    // writes (analysis_reports, environment_profiles) attribute correctly.
    const isServiceRoleCall = serviceRoleKey.length > 0 && token === serviceRoleKey

    // Parse request early so the service-role caller can supply userId.
    const body: DigestRequest & { userId?: string } = await req.json()
    const {
      sourceType,
      url,
      content,
      model = DEFAULT_MODEL,
      options = {},
      retrySection,
      existingReport,
      promptTemplates: requestedPromptTemplates,
      reportId: requestedReportId
    } = body
    const promptTemplates = { ...DEFAULT_PROMPT_TEMPLATES, ...(requestedPromptTemplates ?? {}) }

    let supabaseClient
    let user: { id: string }

    if (isServiceRoleCall) {
      if (!body.userId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Service-role call missing userId in body' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        serviceRoleKey,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
      user = { id: body.userId }
    } else {
      supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        }
      )
      const { data: { user: authedUser }, error: authError } = await supabaseClient.auth.getUser(token)
      if (authError || !authedUser) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      user = authedUser
    }

    // Rate limiting — skip for service-role calls (the orchestrator already
    // throttles at the job level).
    if (!isServiceRoleCall) {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        serviceRoleKey
      )
      const { allowed } = await checkRateLimit(
        supabaseAdmin,
        `user:${user.id}:fn:threat-intel-digest-v2`,
        10,
        60
      )
      if (!allowed) {
        return corsErrorResponse('Rate limit exceeded. Try again shortly.', req, 429)
      }
    }

    // For retry, we need either existing content or ability to re-fetch
    const isRetry = !!retrySection && !!existingReport
    if (!isRetry && options.autoDigest !== true) {
      const { data: digestSettings } = await supabaseClient
        .from('auto_digest_settings')
        .select('max_articles_per_day')
        .eq('user_id', user.id)
        .maybeSingle()
      const dailyLimit = Math.max(1, Math.min(100, Number(digestSettings?.max_articles_per_day ?? 3)))
      const { data: quotaGranted, error: quotaError } = await supabaseClient.rpc(
        'reserve_auto_digest_article_quota',
        { p_user_id: user.id, p_requested: 1, p_daily_limit: dailyLimit }
      )
      if (quotaError) {
        return new Response(
          JSON.stringify({ success: false, error: 'Daily article quota could not be reserved', code: 'DAILY_QUOTA_UNAVAILABLE', retryable: true }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (Number(quotaGranted) < 1) {
        return new Response(
          JSON.stringify({ success: false, error: 'Daily article quota exhausted', code: 'DAILY_ARTICLE_QUOTA_EXCEEDED', retryable: false }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    if (!isRetry) {
      if (sourceType === 'url' && !url) {
        return new Response(
          JSON.stringify({ success: false, error: 'URL required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (sourceType === 'paste' && !content) {
        return new Response(
          JSON.stringify({ success: false, error: 'Content required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Enforce content size limit
    const MAX_CONTENT_SIZE = 500_000
    if (content && content.length > MAX_CONTENT_SIZE) {
      return new Response(
        JSON.stringify({ success: false, error: `Content exceeds maximum size (${MAX_CONTENT_SIZE} chars)` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate promptTemplates field lengths
    const MAX_TEMPLATE_LEN = 10_000
    if (promptTemplates) {
      for (const [key, val] of Object.entries(promptTemplates as Record<string, unknown>)) {
        if (typeof val === 'string' && val.length > MAX_TEMPLATE_LEN) {
          return new Response(
            JSON.stringify({ success: false, error: `promptTemplates.${key} exceeds maximum length (${MAX_TEMPLATE_LEN} chars)` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
    }

    // Validate retry section
    if (isRetry && !['summary', 'classification', 'ttps', 'iocs', 'rules', 'mitre', 'library'].includes(retrySection!)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid retry section' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const extractIoCs = options.extractIoCs !== false
    const extractRules = options.extractRules !== false
    const mapToMitre = options.mapToMitre !== false
    const findLibrary = options.findLibraryMatches !== false

    const reportId = isRetry ? existingReport!.id : requestedReportId || `report_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    let reportContent = ''
    let fetchMetadata: any = {}

    // Stage 1: Fetch content
    console.log('=== Stage 1: Fetching content ===')

    if (isRetry) {
      if (existingReport!.rawContent) {
        reportContent = existingReport!.rawContent
        console.log(`Using existing raw content for retry: ${reportContent.length} chars`)
      } else if (existingReport!.sourceUrl) {
        const fetchResult = await executeStage('fetch', async () => fetchContent(existingReport!.sourceUrl!, { extractionMethod: options.extractionMethod }))
        if (!fetchResult.success) {
          return new Response(
            JSON.stringify({ success: false, error: `Failed to re-fetch: ${fetchResult.error}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        reportContent = fetchResult.data!.content
        fetchMetadata = { title: fetchResult.data!.title, ...fetchResult.data!.metadata }
      } else {
        return new Response(
          JSON.stringify({ success: false, error: 'No content available for retry.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else if (sourceType === 'url' && url) {
      const fetchResult = await executeStage('fetch', async () => fetchContent(url, { extractionMethod: options.extractionMethod }))
      if (!fetchResult.success) {
        return new Response(
          JSON.stringify({ success: false, error: `Failed to fetch: ${fetchResult.error}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      reportContent = fetchResult.data!.content
      fetchMetadata = { title: fetchResult.data!.title, ...fetchResult.data!.metadata }
      console.log(`Content fetched: ${reportContent.length} chars`)
    } else {
      reportContent = content!
      console.log(`Using pasted content: ${reportContent.length} chars`)
    }

    // A retry runs the requested stage AND every stage downstream of it, so no
    // verdict survives a change to the data it was computed from. Retrying
    // `ttps` therefore re-runs `mitre` and `library` too. See lib/retry-plan.ts.
    const plannedStages = planStages(isRetry ? (retrySection as DigestStage) : null)
    if (isRetry) {
      console.log(`Retry '${retrySection}' -> running stages: ${[...plannedStages].join(', ')}`)
    }

    // Initialize variables
    let summary: ReportSummary | null = isRetry ? existingReport!.summary : null
    let classification: ReportClassification | null = isRetry ? existingReport!.classification : null
    let ttps: ExtractedTTP[] = isRetry ? existingReport!.ttps : []
    let iocs: ExtractedIoC[] = isRetry ? existingReport!.iocs : []
    let rules: ExtractedRule[] = isRetry ? existingReport!.rules : []
    let mitreMapping: MitreMapping = isRetry ? existingReport!.mitreMapping : {
      matchedGroups: [],
      matchedCampaigns: [],
      matchedSoftware: [],
      matchedTechniques: [],
      tacticCoverage: []
    }
    let libraryMatches: LibraryMatch[] = isRetry ? existingReport!.libraryMatches : []
    // Whether coverage was actually assessed. On a retry that does not re-run
    // the library stage the TTPs cannot have changed, so the stored verdict
    // still stands -- and a stored percent is the record that one was reached.
    let coverageComputed = isRetry ? existingReport!.coveragePercent != null : false
    // `sectionErrors` is inherited on a retry because each stage clears its own
    // key when it re-runs clean. `qualityWarnings` is deliberately NOT inherited
    // -- it is rebuilt from scratch below, from stage state that is current. See
    // lib/quality-warnings.ts.
    let sectionErrors: Record<string, string> = isRetry ? { ...existingReport!.sectionErrors } : {}
    let sourceQuality = isRetry ? existingReport!.sourceQuality : undefined
    let sourceContentLength = isRetry ? existingReport!.sourceContentLength : undefined
    let sourceContentHash = isRetry ? existingReport!.sourceContentHash : undefined
    let fetchedUrl = isRetry ? existingReport!.fetchedUrl : undefined
    sourceQuality = fetchMetadata.sourceQuality || sourceQuality
    sourceContentLength = fetchMetadata.sourceContentLength || reportContent.length
    sourceContentHash = fetchMetadata.sourceContentHash || sourceContentHash
    fetchedUrl = fetchMetadata.fetchedUrl || fetchedUrl || (sourceType === 'url' ? url : undefined)

    const aiCtx = { userId: user.id, feature: 'threat-intel-digest' as const }

    // Stage 2: Extract summary (AI)
    const shouldRunSummary = plannedStages.has('summary')
    if (shouldRunSummary) {
      console.log('=== Stage 2: Summary extraction (AI) ===')
      const summaryResult = await executeStage('summary', async () => {
        return await extractSummary(reportContent, model, promptTemplates, aiCtx)
      })

      if (summaryResult.success) {
        summary = {
          ...summaryResult.data,
          title: summaryResult.data?.title || fetchMetadata.title || 'Untitled Report',
          organization: summaryResult.data?.organization || fetchMetadata.organization,
          author: summaryResult.data?.author || fetchMetadata.author,
          publishDate: summaryResult.data?.publishDate || fetchMetadata.publishDate,
          keyFindings: summaryResult.data?.keyFindings || [],
          targetedIndustries: summaryResult.data?.targetedIndustries || [],
          targetedRegions: summaryResult.data?.targetedRegions || [],
        }
        delete sectionErrors.summary
      } else {
        sectionErrors.summary = summaryResult.error || 'Unknown error'
        if (!summary) {
          summary = {
            title: fetchMetadata.title || 'Untitled Report',
            executiveSummary: 'Summary extraction failed',
            keyFindings: [],
            threatLevel: ThreatLevel.Medium
          }
        }
      }
    }

    // Stage 3: Classification (AI)
    const shouldRunClassification = plannedStages.has('classification')
    if (shouldRunClassification) {
      console.log('=== Stage 3: Classification (AI) ===')
      const classificationResult = await executeStage('classification', async () => {
        return await extractClassification(reportContent, JSON.stringify(summary), model, promptTemplates, aiCtx)
      })

      if (classificationResult.success) {
        classification = classificationResult.data
        delete sectionErrors.classification
      } else {
        sectionErrors.classification = classificationResult.error || 'Unknown error'
        if (!classification) {
          classification = {
            primaryType: AttackType.Unknown,
            secondaryTypes: [],
            confidence: 'low',
            reasoning: 'Classification failed'
          }
        }
      }
    }

    // Stage 4: TTPs (AI)
    const shouldRunTTPs = plannedStages.has('ttps')
    if (shouldRunTTPs) {
      console.log('=== Stage 4: TTP extraction (AI) ===')
      const ttpsResult = await executeStage('ttps', async () => {
        const ttpsArray = await extractTTPs(reportContent, model, promptTemplates, aiCtx)
        return ttpsArray.map((ttp: any, i: number) => ({
          id: `ttp_${reportId}_${i}`,
          ...ttp
        }))
      })

      if (ttpsResult.success) {
        const newTTPs = ttpsResult.data!
        if (!isRetry || newTTPs.length > 0 || ttps.length === 0) {
          ttps = newTTPs
          delete sectionErrors.ttps
          console.log(`TTPs extracted: ${ttps.length}`)
        } else {
          sectionErrors.ttps = 'Retry returned no results. Keeping existing data.'
        }
      } else {
        sectionErrors.ttps = ttpsResult.error || 'Unknown error'
      }
    }

    // Stage 5 & 6: IoCs and Detection Queries (AI + Pattern)
    const shouldRunIoCs = plannedStages.has('iocs')
    const shouldRunRules = plannedStages.has('rules')

    if ((shouldRunIoCs && extractIoCs) || (shouldRunRules && extractRules)) {
      console.log('=== Stage 5: IoC & Detection Query extraction ===')
      const aiExtractionResult = await executeStage('ioc_extraction', () =>
        extractIoCsWithAI(reportContent, url || existingReport?.sourceUrl || '', model, promptTemplates, aiCtx)
      )

      if (aiExtractionResult.success && aiExtractionResult.data) {
        if (shouldRunIoCs && extractIoCs) {
          const newIoCs = aiExtractionResult.data.iocs.map((ioc, i) => ({
            ...ioc,
            id: `ioc_${reportId}_${i}`
          }))
          if (!isRetry || newIoCs.length > 0 || iocs.length === 0) {
            iocs = newIoCs
            delete sectionErrors.iocs
            console.log(`IoCs extracted: ${iocs.length}`)
          } else {
            sectionErrors.iocs = 'Retry returned no results. Keeping existing data.'
          }
        }

        if (shouldRunRules && extractRules) {
          // Combine AI-extracted rules with pattern-matched rules
          const aiRules = aiExtractionResult.data.rules.map((rule, i) => ({
            ...rule,
            id: `rule_ai_${reportId}_${i}`
          }))

          const patternRules = extractRulesFromContent(reportContent).map((rule, i) => ({
            ...rule,
            id: `rule_pattern_${reportId}_${i}`
          }))

          // Deduplicate by content
          const seenContent = new Set<string>()
          const allRules: ExtractedRule[] = []

          for (const rule of [...aiRules, ...patternRules]) {
            const key = rule.content.substring(0, 100)
            if (!seenContent.has(key)) {
              seenContent.add(key)
              allRules.push(rule)
            }
          }

          if (!isRetry || allRules.length > 0 || rules.length === 0) {
            rules = allRules
            delete sectionErrors.rules
            console.log(`Detection rules extracted: ${rules.length}`)
          } else {
            sectionErrors.rules = 'Retry returned no results. Keeping existing data.'
          }
        }
      } else {
        if (shouldRunIoCs) sectionErrors.iocs = aiExtractionResult.error || 'Unknown error'
        if (shouldRunRules) sectionErrors.rules = aiExtractionResult.error || 'Unknown error'
      }
    }

    // Stage 7: MITRE matching (DB)
    const shouldRunMitre = plannedStages.has('mitre')
    if (shouldRunMitre && mapToMitre && ttps.length > 0) {
      console.log('=== Stage 7: MITRE matching (DB) ===')
      const mitreResult = await executeStage('mitre', () =>
        performMitreMatching(ttps, reportContent, supabaseClient)
      )
      if (mitreResult.success) {
        mitreMapping = mitreResult.data!
        const validatedIds = new Set(mitreMapping.matchedTechniques.filter((technique: any) => technique.isValid).map((technique: any) => technique.mitreId))
        const canonicalNames = new Map(mitreMapping.matchedTechniques.map((technique: any) => [technique.mitreId, technique.techniqueName]))
        const invalidTaxonomyIds = new Set<string>()
        ttps = ttps.map((ttp: any) => validatedIds.has(ttp.mitreId)
          ? namesAreCompatible(ttp.techniqueName, canonicalNames.get(ttp.mitreId))
            ? { ...ttp, provenance: 'validated', validationState: 'validated' }
            : (() => {
              invalidTaxonomyIds.add(ttp.mitreId)
              return { ...ttp, provenance: 'rejected', validationState: 'rejected' }
            })()
          : (() => {
            invalidTaxonomyIds.add(ttp.mitreId)
            return { ...ttp, validationState: 'rejected', provenance: 'rejected' }
          })())
        // Written only to `sectionErrors`; reconcileQualityWarnings surfaces it
        // as a warning. Pushing it into `qualityWarnings` here is what made one
        // MITRE fault report as two failed sections (mitre + evidence).
        if (invalidTaxonomyIds.size > 0) {
          sectionErrors.mitre = `${invalidTaxonomyIds.size} extracted technique(s) failed canonical ATT&CK ID/name validation`
        } else {
          delete sectionErrors.mitre
        }
      } else {
        sectionErrors.mitre = mitreResult.error || 'Unknown error'
      }
    }

    const evidenceGate = applyEvidenceQualityGate(reportContent, ttps, iocs, rules)
    sourceQuality = evidenceGate.sourceQuality
    sourceContentLength = evidenceGate.sourceContentLength
    ttps = evidenceGate.ttps
    iocs = evidenceGate.iocs
    rules = evidenceGate.rules

    // The gate re-runs over the full current report on every request, so its
    // warnings are rebuilt rather than merged into the previous run's.
    const reconciled = reconcileQualityWarnings({
      sectionErrors,
      evidenceWarnings: evidenceGate.warnings,
    })
    const qualityWarnings = reconciled.qualityWarnings
    sectionErrors = reconciled.sectionErrors

    // Stage 8: Library coverage (DB)
    const shouldRunLibrary = plannedStages.has('library')
    if (shouldRunLibrary && findLibrary && ttps.length > 0) {
      console.log('=== Stage 8: Library coverage (DB) ===')
      const libraryResult = await executeStage('library', () =>
        findLibraryMatches(ttps, mitreMapping, supabaseClient, user.id)
      )
      if (libraryResult.success) {
        const { matches, computed, candidatePoolSize, librarySize } = libraryResult.data!
        libraryMatches = matches
        if (computed) {
          coverageComputed = true
          delete sectionErrors.library
        } else {
          // Nothing was eligible to search, so there is no coverage answer to
          // give. Recording 0 here is what makes "0 Covered" read as a finding
          // rather than as an unasked question (C2). Absence travels as a null
          // coveragePercent instead.
          //
          // Deliberately NOT a section error. The stage ran and correctly
          // determined it had nothing to compare against -- that is a fact
          // about the library, not a failure of this report. Section errors
          // drive `outcome`, so recording one here would make every retried
          // report permanently `partial` for a reason no re-extraction can
          // resolve, re-breaking exactly what A4 fixed.
          coverageComputed = false
          delete sectionErrors.library
          console.log(`Library coverage not computed: 0 of ${librarySize} detections passed the eligibility gate (pool ${candidatePoolSize})`)
        }
      } else {
        coverageComputed = false
        sectionErrors.library = libraryResult.error || 'Unknown error'
      }
    }

    // Persist coverage analysis to analysis_reports for trend tracking
    const extractedTechniqueIds = new Set(ttps.map((ttp: any) => ttp.mitreId).filter(Boolean))
    const validatedTechniqueIds = new Set((mitreMapping?.matchedTechniques || []).filter((technique: any) => technique.isValid).map((technique: any) => technique.mitreId))
    const coveredTechniqueIds = new Set(libraryMatches.flatMap((match: any) => match.matchedTTPs || []))
    // Absent stays distinguishable from zero: when coverage could not be
    // assessed these are null, not 0. A percentage computed over an empty
    // candidate pool is 0 for a reason that has nothing to do with the report.
    const libraryOverlapPercent = coverageComputed && extractedTechniqueIds.size > 0
      ? Math.round((Array.from(coveredTechniqueIds).filter(id => extractedTechniqueIds.has(id)).length / extractedTechniqueIds.size) * 100)
      : null
    const validatedOverlapPercent = coverageComputed && validatedTechniqueIds.size > 0
      ? Math.round((Array.from(coveredTechniqueIds).filter(id => validatedTechniqueIds.has(id)).length / validatedTechniqueIds.size) * 100)
      : null
    const overlapCalculatedAt = new Date().toISOString()
    if (libraryMatches.length > 0) {
      try {
        // Find previous threat_digest_coverage report for trend linking
        const { data: prevReport } = await supabaseClient
          .from('analysis_reports')
          .select('id, coverage_score')
          .eq('user_id', user.id)
          .eq('report_type', 'threat_digest_coverage')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Compute aggregate coverage score: % of TTPs covered by at least one detection
        const totalTTPs = ttps.length
        const coveredTTPs = ttps.filter(t => t.hasExistingDetection).length
        const coverageScore = totalTTPs > 0 ? Math.round((coveredTTPs / totalTTPs) * 100) : 0

        const scoreDelta = (coverageScore != null && prevReport?.coverage_score != null)
          ? coverageScore - prevReport.coverage_score
          : null;

        // Snapshot environment profile
        const { data: envProfile } = await supabaseClient
          .from('environment_profiles')
          .select('log_sources, siem_platforms, edr_tools, cloud_platforms, industry')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        await supabaseClient.from('analysis_reports').insert({
          user_id: user.id,
          report_type: 'threat_digest_coverage',
          title: `Coverage: ${summary?.title || 'Threat Intel Report'}`,
          inputs: { threat_report_id: reportId, source_url: url || null },
          context: { libraryMatches, coverageScore },
          coverage_score: coverageScore,
          previous_report_id: prevReport?.id || null,
          score_delta: scoreDelta,
          environment_snapshot: envProfile || null,
          status: 'completed',
          completed_at: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('[threat-intel-digest-v2] Failed to persist coverage report:', err);
        // Don't fail the digest — this is supplementary
      }
    }

    const reportOutcome = deriveReportOutcome({
      hasSummary: Boolean(summary),
      hasClassification: Boolean(classification),
      sectionErrors,
    });
    const skippedSections = new Set<string>();
    if (!extractIoCs) skippedSections.add('iocs');
    if (!extractRules) skippedSections.add('rules');
    if (!mapToMitre || ttps.length === 0) skippedSections.add('mitre');
    if (!findLibrary || ttps.length === 0) skippedSections.add('library');
    const sectionOutcomes: NonNullable<ThreatReport['sectionOutcomes']> = Object.fromEntries(
      ['summary', 'classification', 'ttps', 'iocs', 'rules', 'mitre', 'library'].map((section) => [
        section,
        sectionErrors[section] ? 'failed' : skippedSections.has(section) ? 'skipped' : section === 'summary' && !summary ? 'failed' : section === 'classification' && !classification ? 'failed' : 'succeeded',
      ]),
    ) as NonNullable<ThreatReport['sectionOutcomes']>;
    // Feasibility is per-TTP. If this run re-extracted the TTPs, whatever the
    // orchestrator assessed was about a set that no longer exists.
    const feasibilityStillValid = isRetry && !invalidatesFeasibility(plannedStages)
    if (isRetry && !feasibilityStillValid) {
      ttps = ttps.map((ttp: any) => {
        if (ttp.feasibility === undefined) return ttp
        const { feasibility: _dropped, ...rest } = ttp
        return rest
      })
    }

    // Assemble report
    const report: ThreatReport = {
      id: reportId,
      createdAt: isRetry ? existingReport!.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceType: isRetry ? existingReport!.sourceType : sourceType,
      sourceUrl: isRetry ? existingReport!.sourceUrl : url,
      rawContentPreview: reportContent.substring(0, 500),
      rawContent: (isRetry ? existingReport!.sourceType : sourceType) === 'paste' ? reportContent : undefined,
      summary,
      classification,
      ttps,
      iocs,
      rules,
      mitreMapping,
      libraryMatches,
      coveragePercent: libraryOverlapPercent,
      libraryOverlapPercent,
      validatedOverlapPercent,
      overlapCalculatedAt,
      outcome: reportOutcome,
      sectionOutcomes,
      processingStage: reportOutcome === 'complete' ? ProcessingStage.Complete : ProcessingStage.Error,
      processingDurationMs: Date.now() - startTime,
      // `{}`, not `undefined`. An absent key is not a cleared value: the client
      // upserts this straight through, and PostgREST leaves omitted columns
      // alone, so a report that resolved all its section errors kept the old
      // ones in the row -- outcome `complete` sitting next to a stale mitre
      // error. Sending the empty object is what makes "nothing failed"
      // expressible at all.
      sectionErrors,
      lastRetrySection: isRetry ? retrySection : undefined,
      lastRetryTime: isRetry ? new Date().toISOString() : undefined,
      sourceQuality,
      sourceContentLength,
      sourceContentHash,
      fetchedUrl,
      qualityWarnings,
      // Feasibility is assessed by the auto-digest orchestrator, which has the
      // environment profile; this function cannot compute it. It must still be
      // carried, because the client replaces its session with this object -- a
      // missing field silently became "feasibility not computed" on a report
      // whose row said 9. When the TTP set was re-extracted the stored counts
      // describe techniques that are gone, so they are cleared to null (never
      // 0) and the UI's "not computed" becomes true rather than an artifact.
      feasibleGapCount: feasibilityStillValid ? existingReport!.feasibleGapCount ?? null : null,
      infeasibleGapCount: feasibilityStillValid ? existingReport!.infeasibleGapCount ?? null : null,
      possibleActorMentions: (mitreMapping?.matchedGroups || []).map((group: any) => group.name).filter((name: string) => name && actorHasAttributionEvidence(reportContent, name)),
    }

    console.log('=== COMPLETED in ' + (Date.now() - startTime) + 'ms ===')
    console.log('Summary: ' + ttps.length + ' TTPs, ' + iocs.length + ' IoCs, ' + rules.length + ' rules')

    return new Response(
      JSON.stringify(buildDigestEnvelope(reportOutcome, report, Date.now() - startTime)),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        processingTimeMs: Date.now() - startTime
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
