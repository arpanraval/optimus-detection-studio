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
      promptTemplates
    } = body

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

    const reportId = isRetry ? existingReport!.id : `report_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    let reportContent = ''
    let fetchMetadata: any = {}

    // Stage 1: Fetch content
    console.log('=== Stage 1: Fetching content ===')

    if (isRetry) {
      if (existingReport!.rawContent) {
        reportContent = existingReport!.rawContent
        console.log(`Using existing raw content for retry: ${reportContent.length} chars`)
      } else if (existingReport!.sourceUrl) {
        const fetchResult = await executeStage('fetch', async () => fetchContent(existingReport!.sourceUrl!))
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
      const fetchResult = await executeStage('fetch', async () => fetchContent(url))
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
    let sectionErrors: Record<string, string> = isRetry ? { ...existingReport!.sectionErrors } : {}

    const aiCtx = { userId: user.id, feature: 'threat-intel-digest' as const }

    // Stage 2: Extract summary (AI)
    const shouldRunSummary = !isRetry || retrySection === 'summary'
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
    const shouldRunClassification = !isRetry || retrySection === 'classification'
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
    const shouldRunTTPs = !isRetry || retrySection === 'ttps'
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
    const shouldRunIoCs = !isRetry || retrySection === 'iocs'
    const shouldRunRules = !isRetry || retrySection === 'rules'

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
    const shouldRunMitre = !isRetry || retrySection === 'mitre'
    if (shouldRunMitre && mapToMitre && ttps.length > 0) {
      console.log('=== Stage 7: MITRE matching (DB) ===')
      const mitreResult = await executeStage('mitre', () =>
        performMitreMatching(ttps, reportContent, supabaseClient)
      )
      if (mitreResult.success) {
        mitreMapping = mitreResult.data!
        delete sectionErrors.mitre
      } else {
        sectionErrors.mitre = mitreResult.error || 'Unknown error'
      }
    }

    // Stage 8: Library coverage (DB)
    const shouldRunLibrary = !isRetry || retrySection === 'library'
    if (shouldRunLibrary && findLibrary && ttps.length > 0) {
      console.log('=== Stage 8: Library coverage (DB) ===')
      const libraryResult = await executeStage('library', () =>
        findLibraryMatches(ttps, mitreMapping, supabaseClient)
      )
      if (libraryResult.success) {
        libraryMatches = libraryResult.data!
        delete sectionErrors.library
      } else {
        sectionErrors.library = libraryResult.error || 'Unknown error'
      }
    }

    // Persist coverage analysis to analysis_reports for trend tracking
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
      processingStage: ProcessingStage.Complete,
      processingDurationMs: Date.now() - startTime,
      sectionErrors: Object.keys(sectionErrors).length > 0 ? sectionErrors : undefined,
      lastRetrySection: isRetry ? retrySection : undefined,
      lastRetryTime: isRetry ? new Date().toISOString() : undefined
    }

    console.log('=== COMPLETED in ' + (Date.now() - startTime) + 'ms ===')
    console.log('Summary: ' + ttps.length + ' TTPs, ' + iocs.length + ' IoCs, ' + rules.length + ' rules')

    return new Response(
      JSON.stringify({ success: true, report, processingTimeMs: Date.now() - startTime }),
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
