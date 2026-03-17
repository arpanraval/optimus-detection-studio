import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'

// =============================================================================
// TYPES
// =============================================================================

interface PlaybookStep {
  id: string
  name: string
  description: string
  tool: string
  params: Record<string, any>
  paramMapping?: Record<string, string>
  contextKey: string
}

interface PlaybookRequest {
  playbookId: string
  inputs: Record<string, string>
}

// =============================================================================
// ALLOWED TOOLS & PLAYBOOK DEFINITIONS (server-side source of truth)
// =============================================================================

const ALLOWED_TOOLS = new Set([
  'search_library',
  'get_coverage_summary',
  'identify_coverage_gaps',
  'get_threat_actor_coverage',
  'find_threat_actor',
  'query_mitre',
])

const PLAYBOOK_DEFINITIONS: Record<string, PlaybookStep[]> = {
  'ransomware-readiness': [
    { id: 'coverage-gaps', name: 'Ransomware Coverage Gap Analysis', description: 'Identify gaps in ransomware-related MITRE ATT&CK techniques', tool: 'identify_coverage_gaps', params: { profile: 'ransomware' }, contextKey: 'ransomwareGaps' },
    { id: 'coverage-summary', name: 'Overall Coverage Summary', description: 'Get current detection coverage metrics', tool: 'get_coverage_summary', params: { scope: 'overall' }, contextKey: 'coverageSummary' },
    { id: 'search-ransomware', name: 'Find Existing Ransomware Detections', description: 'Search library for ransomware-related detections', tool: 'search_library', params: { query: 'ransomware encryption shadow copy volume deletion', limit: 15 }, contextKey: 'existingDetections' },
    { id: 'search-lateral', name: 'Find Lateral Movement Detections', description: 'Search for lateral movement detections relevant to ransomware', tool: 'search_library', params: { query: 'lateral movement SMB PsExec WMI remote service', limit: 10 }, contextKey: 'lateralDetections' },
  ],
  'threat-actor-coverage': [
    { id: 'find-actor', name: 'Identify Threat Actor', description: 'Look up the threat actor in MITRE ATT&CK', tool: 'find_threat_actor', params: {}, paramMapping: { query: 'actorQuery' }, contextKey: 'actorInfo' },
    { id: 'actor-coverage', name: 'Analyze Coverage Against Actor', description: 'Check detection coverage for all techniques used by this actor', tool: 'get_threat_actor_coverage', params: {}, paramMapping: { actor_query: 'actorQuery' }, contextKey: 'actorCoverage' },
    { id: 'search-actor-detections', name: 'Find Related Detections', description: 'Search for detections related to this threat actor', tool: 'search_library', params: { limit: 15 }, paramMapping: { query: 'actorQuery' }, contextKey: 'relatedDetections' },
  ],
  'detection-quality-sprint': [
    { id: 'coverage-summary', name: 'Get Library Overview', description: 'Fetch overall detection coverage and metrics', tool: 'get_coverage_summary', params: { scope: 'overall' }, contextKey: 'coverageSummary' },
    { id: 'search-low-quality', name: 'Find Low-Quality Detections', description: 'Search for detections that may need improvement', tool: 'search_library', params: { query: 'detection', filters: { status: 'Draft' }, limit: 20 }, contextKey: 'draftDetections' },
    { id: 'search-no-mitre', name: 'Find Unmapped Detections', description: 'Search for detections without MITRE mappings', tool: 'search_library', params: { query: 'detection rule alert', limit: 20 }, contextKey: 'allDetections' },
  ],
  'executive-security-posture': [
    { id: 'coverage-summary', name: 'Overall Coverage Metrics', description: 'Get detection coverage statistics', tool: 'get_coverage_summary', params: { scope: 'overall' }, contextKey: 'coverageSummary' },
    { id: 'ransomware-gaps', name: 'Ransomware Risk Assessment', description: 'Check coverage against ransomware threats', tool: 'identify_coverage_gaps', params: { profile: 'ransomware' }, contextKey: 'ransomwareGaps' },
    { id: 'apt-gaps', name: 'APT Risk Assessment', description: 'Check coverage against advanced persistent threats', tool: 'identify_coverage_gaps', params: { profile: 'apt' }, contextKey: 'aptGaps' },
    { id: 'initial-access-gaps', name: 'Initial Access Risk Assessment', description: 'Check coverage against initial access techniques', tool: 'identify_coverage_gaps', params: { profile: 'initial_access' }, contextKey: 'initialAccessGaps' },
  ],
}

interface StepResult {
  stepId: string
  status: 'completed' | 'error'
  data?: any
  error?: string
}

// =============================================================================
// TOOL EXECUTOR
// Calls the optimus-tools edge function internally
// =============================================================================

const STEP_TIMEOUT_MS = 30_000 // 30 second timeout per step

async function executeTool(
  supabaseUrl: string,
  serviceRoleKey: string,
  userToken: string,
  tool: string,
  params: Record<string, any>
): Promise<any> {
  // Validate tool is in the allowlist
  if (!ALLOWED_TOOLS.has(tool)) {
    throw new Error(`Tool ${tool} is not allowed`)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), STEP_TIMEOUT_MS)

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/optimus-tools`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
      },
      body: JSON.stringify({ tool, params }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Tool ${tool} failed (${response.status}): ${errorText}`)
    }

    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

// =============================================================================
// AI REPORT GENERATION
// Uses Gemini to synthesize tool results into report sections
// =============================================================================

async function generateReportSections(
  playbookId: string,
  context: Record<string, any>
): Promise<Record<string, string>> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
  if (!GEMINI_API_KEY) {
    return { 'executive-summary': 'AI report generation unavailable (no API key configured).' }
  }

  const contextSummary = JSON.stringify(context, null, 2).slice(0, 12000)

  const prompt = `You are a senior detection engineer analyzing security detection coverage data.
Based on the following playbook results, generate a concise professional report.

Playbook: ${playbookId}
Data:
${contextSummary}

Generate the following sections as a JSON object with string values (markdown formatted):
- "executive-summary": 2-3 paragraph executive summary of findings
- "recommendations": Prioritized list of 5-7 actionable recommendations
- "risk-assessment": Brief risk assessment if applicable

Be specific, cite numbers from the data, and focus on actionable insights.
Return ONLY valid JSON, no markdown code blocks.`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY! },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2000,
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    if (!response.ok) {
      console.error('Gemini API error:', await response.text())
      return {}
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return {}

    return JSON.parse(text)
  } catch (e) {
    console.error('Report generation error:', e)
    return {}
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req: Request) => {
  const preflightResponse = handleCorsPreflight(req)
  if (preflightResponse) return preflightResponse

  const corsHeaders = getCorsHeaders(req)

  try {
    // Verify authorization
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Create Supabase client and verify user
    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request
    const body: PlaybookRequest = await req.json()
    const { playbookId, inputs = {} } = body

    if (!playbookId) {
      return new Response(
        JSON.stringify({ error: 'Missing playbookId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Look up steps from server-side definitions (never trust client-sent steps)
    const steps = PLAYBOOK_DEFINITIONS[playbookId]
    if (!steps) {
      return new Response(
        JSON.stringify({ error: `Unknown playbook: ${playbookId}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Execute steps sequentially, building context
    const context: Record<string, any> = {}
    const stepResults: StepResult[] = []

    for (const step of steps) {
      try {
        // Build params: merge static params with dynamic param mappings from user inputs
        const resolvedParams = { ...step.params }
        if (step.paramMapping) {
          for (const [paramKey, inputKey] of Object.entries(step.paramMapping)) {
            if (inputs[inputKey]) {
              resolvedParams[paramKey] = inputs[inputKey]
            }
          }
        }

        const result = await executeTool(supabaseUrl, serviceRoleKey, token, step.tool, resolvedParams)
        context[step.contextKey] = result

        stepResults.push({
          stepId: step.id,
          status: 'completed',
          data: result,
        })
      } catch (e: any) {
        console.error(`Step ${step.id} failed:`, e)
        stepResults.push({
          stepId: step.id,
          status: 'error',
          error: e.message || 'Step execution failed',
        })
        // Continue with remaining steps even if one fails
      }
    }

    // Generate AI report sections from aggregated context
    const generatedSections = await generateReportSections(playbookId, context)

    return new Response(
      JSON.stringify({
        playbookId,
        status: stepResults.every(s => s.status === 'completed') ? 'completed' : 'partial',
        stepResults,
        context,
        generatedSections,
        completedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Playbook execution error:', error)
    return new Response(
      JSON.stringify({ error: 'An internal error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
