/**
 * AI Extractor Module
 *
 * Handles AI provider calls and response parsing for extraction tasks.
 * Supports Google Gemini, OpenAI, and Anthropic providers.
 *
 * Prompts are passed from the client via lib/ai/prompts/threat-intel.
 * No fallback prompts in the edge function - single source of truth.
 */

import {
  type ExtractedIoC,
  type ExtractedRule,
  type PromptTemplates,
  MODEL_PROVIDERS,
  type Provider
} from './types.ts'
import { withAiTelemetry } from '../../_shared/aiTelemetry.ts'
import {
  parseGeminiUsage,
  parseOpenAIUsage,
  parseAnthropicUsage,
} from '../../_shared/aiUsageParsers.ts'

export interface AiCallCtx {
  userId: string | null
  feature: string
  metadata?: Record<string, unknown>
}

// =============================================================================
// AI PROVIDER DETECTION
// =============================================================================

function getProvider(model: string): Provider {
  return MODEL_PROVIDERS[model] || 'google'
}

// =============================================================================
// AI PROVIDER CALLS
// =============================================================================

export async function callAI(
  model: string,
  prompt: string,
  systemInstruction: string | undefined,
  ctx: AiCallCtx
): Promise<string> {
  const provider = getProvider(model)
  console.log(`callAI: model=${model}, provider=${provider}, promptLength=${prompt.length}`)

  let apiKey: string | undefined

  switch (provider) {
    case 'google':
      apiKey = Deno.env.get('GEMINI_API_KEY')
      break
    case 'openai':
      apiKey = Deno.env.get('OPENAI_API_KEY')
      break
    case 'anthropic':
      apiKey = Deno.env.get('ANTHROPIC_API_KEY')
      break
  }

  if (!apiKey) {
    console.error(`API key not found for provider: ${provider}`)
    throw new Error(`API key not configured for provider: ${provider}`)
  }

  console.log(`callAI: API key found for ${provider}, calling API...`)

  return withAiTelemetry(
    {
      userId: ctx.userId,
      feature: ctx.feature,
      model,
      provider,
      category: 'llm',
      metadata: ctx.metadata,
    },
    async () => {
      if (provider === 'google') {
        return await callGeminiAPI(apiKey!, model, prompt, systemInstruction)
      } else if (provider === 'openai') {
        return await callOpenAIAPI(apiKey!, model, prompt, systemInstruction)
      } else {
        return await callAnthropicAPI(apiKey!, model, prompt, systemInstruction)
      }
    }
  )
}

async function callGeminiAPI(
  apiKey: string,
  model: string,
  prompt: string,
  systemInstruction?: string
): Promise<{ result: string; usage: ReturnType<typeof parseGeminiUsage> }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  console.log(`callGeminiAPI: model=${model}, promptLength=${prompt.length}`)

  const payload: any = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' }
  }

  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction }] }
  }

  console.log(`callGeminiAPI: Sending request to Gemini...`)
  const startTime = Date.now()

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(payload)
  })

  console.log(`callGeminiAPI: Response received in ${Date.now() - startTime}ms, status=${response.status}`)

  if (!response.ok) {
    const error = await response.text()
    console.error(`callGeminiAPI: API error response: ${error.substring(0, 500)}`)
    throw new Error(`Gemini API error: ${error}`)
  }

  const data = await response.json()
  const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  console.log(`callGeminiAPI: Result text length=${resultText.length}, preview=${resultText.substring(0, 100)}...`)
  return { result: resultText, usage: parseGeminiUsage(data) }
}

async function callOpenAIAPI(
  apiKey: string,
  model: string,
  prompt: string,
  systemInstruction?: string
): Promise<{ result: string; usage: ReturnType<typeof parseOpenAIUsage> }> {
  const messages: any[] = []
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction })
  }
  messages.push({ role: 'user', content: prompt })

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      response_format: { type: 'json_object' }
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${error}`)
  }

  const data = await response.json()
  return { result: data.choices?.[0]?.message?.content || '', usage: parseOpenAIUsage(data) }
}

async function callAnthropicAPI(
  apiKey: string,
  model: string,
  prompt: string,
  systemInstruction?: string
): Promise<{ result: string; usage: ReturnType<typeof parseAnthropicUsage> }> {
  const payload: any = {
    model,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }]
  }

  if (systemInstruction) {
    payload.system = systemInstruction
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Anthropic API error: ${error}`)
  }

  const data = await response.json()
  return { result: data.content?.[0]?.text || '', usage: parseAnthropicUsage(data) }
}

// =============================================================================
// IoC CATEGORY/TYPE MAPPING
// =============================================================================

function mapIoCCategory(aiCategory: string): string {
  const categoryMap: Record<string, string> = {
    'ipv4_addresses': 'network',
    'ipv6_addresses': 'network',
    'domains': 'network',
    'urls': 'network',
    'email_addresses': 'network',
    'asn': 'network',
    'cidr_ranges': 'network',
    'user_agents': 'network',
    'ja3_fingerprints': 'network',
    'ja3s_fingerprints': 'network',
    'ssl_certificates': 'network',
    'file_hashes': 'hashes',
    'ssdeep_hashes': 'hashes',
    'imphashes': 'hashes',
    'file_paths': 'files',
    'file_names': 'files',
    'pdb_paths': 'files',
    'registry_keys': 'windows',
    'mutexes': 'windows',
    'named_pipes': 'windows',
    'service_names': 'windows',
    'scheduled_tasks': 'windows',
    'process_names': 'execution',
    'command_lines': 'execution',
    'cves': 'vulnerabilities',
    'crypto_addresses': 'crypto',
    'android_packages': 'mobile',
    'ios_bundles': 'mobile',
    'mac_addresses': 'other',
    'ssh_keys': 'other'
  }
  return categoryMap[aiCategory] || 'other'
}

function mapIoCType(aiCategory: string, item: any): string {
  const typeMap: Record<string, string> = {
    'ipv4_addresses': 'ipv4',
    'ipv6_addresses': 'ipv6',
    'domains': 'domain',
    'urls': 'url',
    'email_addresses': 'email',
    'asn': 'asn',
    'cidr_ranges': 'cidr',
    'user_agents': 'user_agent',
    'ja3_fingerprints': 'ja3',
    'ja3s_fingerprints': 'ja3s',
    'ssl_certificates': 'ssl_cert',
    'file_hashes': item?.hash_type?.toLowerCase() || 'hash',
    'ssdeep_hashes': 'ssdeep',
    'imphashes': 'imphash',
    'file_paths': 'file_path',
    'file_names': 'file_name',
    'pdb_paths': 'pdb_path',
    'registry_keys': 'registry',
    'mutexes': 'mutex',
    'named_pipes': 'named_pipe',
    'service_names': 'service_name',
    'scheduled_tasks': 'scheduled_task',
    'process_names': 'process_name',
    'command_lines': 'command_line',
    'cves': 'cve',
    'crypto_addresses': item?.currency_type?.toLowerCase() || 'crypto',
    'android_packages': 'android_package',
    'ios_bundles': 'ios_bundle',
    'mac_addresses': 'mac_address',
    'ssh_keys': 'ssh_key'
  }
  return typeMap[aiCategory] || 'other'
}

// =============================================================================
// JSON PARSING UTILITIES
// =============================================================================

function extractJsonFromResponse(response: string): string | null {
  // Strategy 1: Try to extract from markdown code block
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch && codeBlockMatch[1]) {
    const content = codeBlockMatch[1].trim()
    if (content.startsWith('{')) {
      console.log('Found JSON in markdown code block')
      return content
    }
  }

  // Strategy 2: Find JSON by matching braces
  const firstBrace = response.indexOf('{')
  if (firstBrace === -1) return null

  let depth = 0
  let lastBrace = -1
  let inString = false
  let escape = false

  for (let i = firstBrace; i < response.length; i++) {
    const char = response[i]

    if (escape) {
      escape = false
      continue
    }

    if (char === '\\') {
      escape = true
      continue
    }

    if (char === '"' && !escape) {
      inString = !inString
      continue
    }

    if (!inString) {
      if (char === '{') depth++
      else if (char === '}') {
        depth--
        if (depth === 0) {
          lastBrace = i
          break
        }
      }
    }
  }

  if (lastBrace > firstBrace) {
    console.log(`Found JSON from position ${firstBrace} to ${lastBrace}`)
    return response.substring(firstBrace, lastBrace + 1)
  }

  // Strategy 3: Greedy regex fallback
  const greedyMatch = response.match(/\{[\s\S]*\}/)
  if (greedyMatch) {
    console.log('Found JSON via greedy regex')
    return greedyMatch[0]
  }

  return null
}

function sanitizeJsonString(jsonStr: string): string {
  let result = jsonStr

  // Fix Windows paths with unescaped backslashes inside strings
  result = result.replace(/"([^"]*?)"/g, (match, content) => {
    const fixed = content.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')
    return `"${fixed}"`
  })

  // Remove control characters
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  return result
}

function tryParseJson(response: string): any {
  console.log('=== tryParseJson START ===')
  console.log('Input length:', response.length)

  // Attempt 1: Direct parse
  try {
    const result = JSON.parse(response)
    console.log('Direct parse SUCCESS')
    return result
  } catch (e) {
    console.log('Direct parse failed:', (e as Error).message?.substring(0, 150))
  }

  // Attempt 2: Extract and parse
  console.log('Attempting extraction...')
  const extracted = extractJsonFromResponse(response)
  if (extracted) {
    console.log('Extracted JSON length:', extracted.length)
    try {
      const result = JSON.parse(extracted)
      console.log('Extracted JSON parse SUCCESS')
      return result
    } catch (e) {
      console.log('Extracted JSON parse failed:', (e as Error).message?.substring(0, 150))
    }

    // Attempt 3: Sanitize and parse
    console.log('Attempting sanitization...')
    const sanitized = sanitizeJsonString(extracted)
    try {
      const result = JSON.parse(sanitized)
      console.log('Sanitized JSON parse SUCCESS')
      return result
    } catch (e) {
      console.log('Sanitized JSON parse failed:', (e as Error).message?.substring(0, 150))
    }
  }

  console.log('=== tryParseJson FAILED - returning null ===')
  return null
}

// =============================================================================
// IoC RESPONSE PARSING
// =============================================================================

function parseAIIoCResponse(aiResponse: any): { iocs: ExtractedIoC[], rules: ExtractedRule[] } {
  const iocs: ExtractedIoC[] = []
  const rules: ExtractedRule[] = []

  console.log('=== parseAIIoCResponse START ===')

  if (!aiResponse) {
    console.log('aiResponse is null/undefined, returning empty')
    return { iocs, rules }
  }

  // Parse IoCs
  if (aiResponse.iocs) {
    console.log('Processing iocs object with keys:', Object.keys(aiResponse.iocs))

    for (const [category, items] of Object.entries(aiResponse.iocs)) {
      if (!Array.isArray(items)) continue

      for (const item of items as any[]) {
        if (!item.value) continue

        // Skip false positives
        if (item.potential_false_positive === true) continue

        iocs.push({
          id: '', // Will be assigned by caller
          type: mapIoCType(category, item),
          value: item.value,
          category: mapIoCCategory(category),
          severity: 'suspicious',
          context: item.context || undefined,
          potentialFalsePositive: item.potential_false_positive || false,
          falsePositiveReason: item.false_positive_reason || undefined
        })
      }
    }
    console.log(`IoCs extracted: ${iocs.length}`)
  }

  // Parse detection queries
  if (aiResponse.detection_queries && Array.isArray(aiResponse.detection_queries)) {
    for (const query of aiResponse.detection_queries) {
      if (!query.query_content) continue

      rules.push({
        id: '', // Will be assigned by caller
        type: query.query_type?.toLowerCase() || 'other',
        name: query.description || `${query.query_type} Query`,
        content: query.query_content,
        description: query.context || query.description || ''
      })
    }
    console.log(`Detection queries extracted: ${rules.length}`)
  }

  console.log('=== parseAIIoCResponse END ===')
  return { iocs, rules }
}

// =============================================================================
// EXTRACTION FUNCTIONS
// Uses prompts passed from client (lib/ai/prompts/threat-intel)
// =============================================================================

/**
 * Extracts IoCs and detection queries using AI.
 * Requires promptTemplates.iocsAndRules from client.
 */
export async function extractIoCsWithAI(
  content: string,
  sourceUrl: string,
  model: string,
  promptTemplates: PromptTemplates,
  ctx: AiCallCtx
): Promise<{ iocs: ExtractedIoC[], rules: ExtractedRule[] }> {
  console.log('=== IoC EXTRACTION START ===')
  console.log('Content length:', content.length, 'chars')

  if (!promptTemplates?.iocsAndRules) {
    throw new Error('Missing iocsAndRules prompt template')
  }

  // Cap content at 80K chars — matches the spirit of the other extractors
  // (summary 30K, classification 15K, TTPs 50K). IoC extraction wants more
  // context than TTPs, but uncapped content on long technical articles
  // pushed the Gemini call past the orchestrator's per-digest timeout.
  const prompt = promptTemplates.iocsAndRules
    .replace('{{CONTENT}}', content.substring(0, 80000))
    .replace('{{SOURCE_URL}}', sourceUrl || 'unknown')

  try {
    const response = await callAI(
      model,
      prompt,
      promptTemplates.systemInstruction || 'You are an expert threat intelligence analyst. Return only valid JSON.',
      { ...ctx, metadata: { ...(ctx.metadata ?? {}), section: 'iocs_rules' } }
    )

    console.log('Response length:', response.length)

    const parsed = tryParseJson(response)
    if (!parsed) {
      console.error('All JSON parsing strategies failed for IoC response')
      return { iocs: [], rules: [] }
    }

    return parseAIIoCResponse(parsed)
  } catch (error) {
    console.error('AI IoC extraction failed:', error)
    return { iocs: [], rules: [] }
  }
}

/**
 * Extracts summary from content using AI.
 * Requires promptTemplates.summary from client.
 */
export async function extractSummary(
  content: string,
  model: string,
  promptTemplates: PromptTemplates,
  ctx: AiCallCtx
): Promise<any> {
  if (!promptTemplates?.summary) {
    throw new Error('Missing summary prompt template')
  }

  // Build prompt by replacing placeholders
  const prompt = promptTemplates.summary.replace('{{CONTENT}}', content.substring(0, 30000))

  const response = await callAI(
    model,
    prompt,
    promptTemplates.systemInstruction,
    { ...ctx, metadata: { ...(ctx.metadata ?? {}), section: 'summary' } }
  )
  return JSON.parse(response)
}

/**
 * Extracts classification from content using AI.
 * Requires promptTemplates.classification from client.
 */
export async function extractClassification(
  content: string,
  summary: string,
  model: string,
  promptTemplates: PromptTemplates,
  ctx: AiCallCtx
): Promise<any> {
  if (!promptTemplates?.classification) {
    throw new Error('Missing classification prompt template')
  }

  // Build prompt by replacing placeholders
  const prompt = promptTemplates.classification
    .replace('{{CONTENT}}', content.substring(0, 15000))
    .replace('{{SUMMARY}}', summary)

  const response = await callAI(
    model,
    prompt,
    promptTemplates.systemInstruction,
    { ...ctx, metadata: { ...(ctx.metadata ?? {}), section: 'classification' } }
  )
  return JSON.parse(response)
}

/**
 * Extracts TTPs from content using AI.
 * Requires promptTemplates.ttps from client.
 */
export async function extractTTPs(
  content: string,
  model: string,
  promptTemplates: PromptTemplates,
  ctx: AiCallCtx
): Promise<any[]> {
  if (!promptTemplates?.ttps) {
    throw new Error('Missing ttps prompt template')
  }

  // Build prompt by replacing placeholders
  const prompt = promptTemplates.ttps.replace('{{CONTENT}}', content.substring(0, 50000))

  const response = await callAI(
    model,
    prompt,
    promptTemplates.systemInstruction,
    { ...ctx, metadata: { ...(ctx.metadata ?? {}), section: 'ttps' } }
  )
  console.log('TTP AI response length:', response.length)

  let parsed: any
  try {
    parsed = JSON.parse(response)
  } catch (parseError) {
    console.error('TTP JSON parse failed:', (parseError as Error).message)
    const extracted = extractJsonFromResponse(response)
    if (extracted) {
      parsed = JSON.parse(extracted)
    } else {
      throw new Error('Could not extract valid JSON from TTP response')
    }
  }

  // Handle multiple AI response formats
  let ttpsArray: any[] = []
  if (Array.isArray(parsed)) {
    if (parsed.length === 1 && (parsed[0]?.ttps || parsed[0]?.techniques || parsed[0]?.TTPs)) {
      ttpsArray = parsed[0].ttps || parsed[0].techniques || parsed[0].TTPs
    } else if (parsed.length > 0 && parsed[0]?.mitreId) {
      ttpsArray = parsed
    } else {
      ttpsArray = parsed
    }
  } else {
    ttpsArray = parsed.ttps || parsed.techniques || parsed.TTPs || []
  }

  console.log('TTP array length:', ttpsArray.length)
  return ttpsArray
}
