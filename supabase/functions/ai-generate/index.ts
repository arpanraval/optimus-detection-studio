import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders, handleCorsPreflight, corsErrorResponse } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rate-limiter.ts'
import { withAiTelemetry, BudgetExceededError } from '../_shared/aiTelemetry.ts'
import { parseGeminiUsage, parseOpenAIUsage, parseAnthropicUsage } from '../_shared/aiUsageParsers.ts'
import { normalizeFeatureCode } from '../_shared/aiFeatureCodes.ts'

// Provider detection from model name
type Provider = 'google' | 'openai' | 'anthropic'

const MODEL_PROVIDERS: Record<string, Provider> = {
  // Google Gemini models
  'gemini-3.1-pro-preview': 'google',
  'gemini-3-flash-preview': 'google',
  'gemini-3.1-flash-lite-preview': 'google',
  'gemini-3-pro-image-preview': 'google',
  // OpenAI models
  'gpt-5.4': 'openai',
  'gpt-5.4-mini': 'openai',
  'gpt-5.4-nano': 'openai',
  // Anthropic models
  'claude-opus-4-6': 'anthropic',
  'claude-sonnet-4-6': 'anthropic',
  'claude-haiku-4-5': 'anthropic',
}

function getProvider(model: string): Provider {
  // Check exact match first
  if (MODEL_PROVIDERS[model]) {
    return MODEL_PROVIDERS[model]
  }
  // Check prefix patterns
  if (model.startsWith('gemini')) return 'google'
  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) return 'openai'
  if (model.startsWith('claude')) return 'anthropic'
  // Default to Google
  return 'google'
}

interface AIRequest {
  prompt: string
  model?: string
  provider?: Provider // Optional explicit provider override
  responseFormat?: 'json' | 'text'
  systemInstruction?: string
  tools?: any[] // Normalized tool format (Gemini style)
  history?: Array<{ role: string; parts: Array<{ text: string }> }> // Gemini history format
  functionResponses?: Array<{ id: string; name: string; response: any }>
  // Detection Intelligence Loop — optional context enrichment fields
  technique_id?: string
  detection_category?: string
  // GenAI Cost Center — caller-tagged feature code for usage attribution
  feature?: string
}

interface AIResponse {
  text: string
  functionCalls?: Array<{ name: string; args: Record<string, any> }>
}

// AICallResult bundles the parsed AI response with token usage for telemetry.
interface AICallResult {
  result: AIResponse
  usage: { inputTokens: number; outputTokens: number; cachedInputTokens?: number }
}

// ============================================================================
// Google Gemini API
// ============================================================================
async function callGeminiAPI(
  apiKey: string,
  model: string,
  prompt: string | undefined,
  responseFormat: 'json' | 'text',
  systemInstruction: string | undefined,
  tools: any[] | undefined,
  history: Array<{ role: string; parts: Array<{ text: string }> }> | undefined,
  functionResponses: Array<{ id: string; name: string; response: any }> | undefined
): Promise<AICallResult> {
  const contents: any[] = []

  // Add history if provided
  if (history && history.length > 0) {
    contents.push(...history)
  }

  // Add current message or function response
  if (functionResponses && functionResponses.length > 0) {
    contents.push({
      role: 'user',
      parts: functionResponses.map(fr => ({
        functionResponse: {
          name: fr.name,
          response: fr.response
        }
      }))
    })
  } else if (prompt) {
    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    })
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

  const geminiPayload: any = {
    contents,
    generationConfig: responseFormat === 'json'
      ? { responseMimeType: 'application/json' }
      : {}
  }

  if (systemInstruction) {
    geminiPayload.systemInstruction = { parts: [{ text: systemInstruction }] }
  }

  if (tools && tools.length > 0) {
    geminiPayload.tools = tools
  }

  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey! },
    body: JSON.stringify(geminiPayload)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini API error: ${errorText}`)
  }

  const data = await response.json()
  const candidate = data.candidates?.[0]
  const parts = candidate?.content?.parts || []

  const functionCalls = parts
    .filter((p: any) => p.functionCall)
    .map((p: any) => ({
      name: p.functionCall.name,
      args: p.functionCall.args
    }))

  const generatedText = parts
    .filter((p: any) => p.text)
    .map((p: any) => p.text)
    .join('')

  return {
    result: {
      text: generatedText,
      functionCalls: functionCalls.length > 0 ? functionCalls : undefined
    },
    usage: parseGeminiUsage(data),
  }
}

// ============================================================================
// OpenAI API
// ============================================================================

// Convert Gemini tool format to OpenAI format
function convertToolsToOpenAI(geminiTools: any[]): any[] {
  const openaiTools: any[] = []

  for (const tool of geminiTools) {
    if (tool.functionDeclarations) {
      for (const func of tool.functionDeclarations) {
        openaiTools.push({
          type: 'function',
          function: {
            name: func.name,
            description: func.description,
            parameters: convertGeminiSchemaToOpenAI(func.parameters)
          }
        })
      }
    }
  }

  return openaiTools
}

// Convert Gemini schema (OBJECT/STRING/etc.) to OpenAI schema (object/string/etc.)
function convertGeminiSchemaToOpenAI(schema: any): any {
  if (!schema) return { type: 'object', properties: {} }

  const typeMap: Record<string, string> = {
    'OBJECT': 'object',
    'STRING': 'string',
    'NUMBER': 'number',
    'INTEGER': 'integer',
    'BOOLEAN': 'boolean',
    'ARRAY': 'array'
  }

  const converted: any = {
    type: typeMap[schema.type] || schema.type?.toLowerCase() || 'object'
  }

  if (schema.description) {
    converted.description = schema.description
  }

  if (schema.properties) {
    converted.properties = {}
    for (const [key, value] of Object.entries(schema.properties)) {
      converted.properties[key] = convertGeminiSchemaToOpenAI(value)
    }
  }

  if (schema.required && schema.required.length > 0) {
    converted.required = schema.required
  }

  if (schema.items) {
    converted.items = convertGeminiSchemaToOpenAI(schema.items)
  }

  if (schema.enum) {
    converted.enum = schema.enum
  }

  return converted
}

// Convert Gemini history to OpenAI messages format
function convertHistoryToOpenAI(
  history: Array<{ role: string; parts: Array<{ text: string }> }> | undefined,
  systemInstruction: string | undefined
): any[] {
  const messages: any[] = []

  // Add system message if provided
  if (systemInstruction) {
    messages.push({
      role: 'system',
      content: systemInstruction
    })
  }

  // Convert history
  if (history) {
    for (const msg of history) {
      const role = msg.role === 'model' ? 'assistant' : msg.role
      const content = msg.parts.map(p => p.text).join('')
      messages.push({ role, content })
    }
  }

  return messages
}

async function callOpenAIAPI(
  apiKey: string,
  model: string,
  prompt: string | undefined,
  responseFormat: 'json' | 'text',
  systemInstruction: string | undefined,
  tools: any[] | undefined,
  history: Array<{ role: string; parts: Array<{ text: string }> }> | undefined,
  functionResponses: Array<{ id: string; name: string; response: any }> | undefined
): Promise<AICallResult> {
  const messages = convertHistoryToOpenAI(history, systemInstruction)

  // Handle function responses (tool results)
  if (functionResponses && functionResponses.length > 0) {
    for (const fr of functionResponses) {
      messages.push({
        role: 'tool',
        tool_call_id: fr.id,
        content: JSON.stringify(fr.response)
      })
    }
  } else if (prompt) {
    messages.push({
      role: 'user',
      content: prompt
    })
  }

  const openaiPayload: any = {
    model,
    messages
  }

  // Add response format for JSON mode
  if (responseFormat === 'json') {
    openaiPayload.response_format = { type: 'json_object' }
  }

  // Convert and add tools if provided
  if (tools && tools.length > 0) {
    openaiPayload.tools = convertToolsToOpenAI(tools)
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(openaiPayload)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error: ${errorText}`)
  }

  const data = await response.json()
  const choice = data.choices?.[0]
  const message = choice?.message

  // Extract function calls from tool_calls
  const functionCalls = message?.tool_calls?.map((tc: any) => ({
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments || '{}')
  }))

  return {
    result: {
      text: message?.content || '',
      functionCalls: functionCalls?.length > 0 ? functionCalls : undefined
    },
    usage: parseOpenAIUsage(data),
  }
}

// ============================================================================
// Anthropic API
// ============================================================================

// Convert Gemini tools to Anthropic format
function convertToolsToAnthropic(geminiTools: any[]): any[] {
  const anthropicTools: any[] = []

  for (const tool of geminiTools) {
    if (tool.functionDeclarations) {
      for (const func of tool.functionDeclarations) {
        anthropicTools.push({
          name: func.name,
          description: func.description,
          input_schema: convertGeminiSchemaToOpenAI(func.parameters) // Same schema format as OpenAI
        })
      }
    }
  }

  return anthropicTools
}

// Convert Gemini history to Anthropic messages format
function convertHistoryToAnthropic(
  history: Array<{ role: string; parts: Array<{ text: string }> }> | undefined
): any[] {
  const messages: any[] = []

  if (history) {
    for (const msg of history) {
      const role = msg.role === 'model' ? 'assistant' : msg.role
      const content = msg.parts.map(p => p.text).join('')
      messages.push({ role, content })
    }
  }

  return messages
}

async function callAnthropicAPI(
  apiKey: string,
  model: string,
  prompt: string | undefined,
  responseFormat: 'json' | 'text',
  systemInstruction: string | undefined,
  tools: any[] | undefined,
  history: Array<{ role: string; parts: Array<{ text: string }> }> | undefined,
  functionResponses: Array<{ id: string; name: string; response: any }> | undefined
): Promise<AICallResult> {
  const messages = convertHistoryToAnthropic(history)

  // Handle function responses (tool results)
  if (functionResponses && functionResponses.length > 0) {
    for (const fr of functionResponses) {
      messages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: fr.id,
          content: JSON.stringify(fr.response)
        }]
      })
    }
  } else if (prompt) {
    messages.push({
      role: 'user',
      content: prompt
    })
  }

  const anthropicPayload: any = {
    model,
    max_tokens: 8192,
    messages
  }

  // Add system prompt if provided
  if (systemInstruction) {
    anthropicPayload.system = systemInstruction
  }

  // Convert and add tools if provided
  if (tools && tools.length > 0) {
    anthropicPayload.tools = convertToolsToAnthropic(tools)
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(anthropicPayload)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Anthropic API error: ${errorText}`)
  }

  const data = await response.json()

  // Extract text and tool use from content blocks
  let text = ''
  const functionCalls: Array<{ name: string; args: Record<string, any> }> = []

  for (const block of data.content || []) {
    if (block.type === 'text') {
      text += block.text
    } else if (block.type === 'tool_use') {
      functionCalls.push({
        name: block.name,
        args: block.input || {}
      })
    }
  }

  return {
    result: {
      text,
      functionCalls: functionCalls.length > 0 ? functionCalls : undefined
    },
    usage: parseAnthropicUsage(data),
  }
}

// ============================================================================
// Main Handler
// ============================================================================
serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflight(req)
  if (preflightResponse) return preflightResponse

  // Get CORS headers for this request (validates origin)
  const corsHeaders = getCorsHeaders(req)

  try {
    // Get auth header and extract token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')

    // Create Supabase client and verify user with the token directly
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Use getUser with the JWT token directly
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

    if (authError || !user) {
      console.error('Auth error:', authError?.message)
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Rate limiting
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const { allowed } = await checkRateLimit(
      supabaseAdmin,
      `user:${user.id}:fn:ai-generate`,
      20,
      60
    )
    if (!allowed) {
      return corsErrorResponse('Rate limit exceeded. Try again shortly.', req, 429)
    }

    // Parse request body
    const body: AIRequest = await req.json()
    const {
      prompt,
      model = 'gemini-3-flash-preview',
      responseFormat = 'json',
      systemInstruction,
      tools,
      history,
      functionResponses
    } = body

    if (!prompt && !functionResponses) {
      return new Response(
        JSON.stringify({ error: 'Missing prompt or functionResponses' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Input size validation
    if (prompt && prompt.length > 50_000) {
      return new Response(JSON.stringify({ error: 'Prompt too long' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (systemInstruction && systemInstruction.length > 10_000) {
      return new Response(JSON.stringify({ error: 'System instruction too long' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (history && history.length > 50) {
      return new Response(JSON.stringify({ error: 'History too long' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Validate model name to prevent URL injection
    if (!/^(gemini|gpt-|o[134]|claude)-[a-zA-Z0-9._-]+$/.test(model)) {
      return new Response(JSON.stringify({ error: 'Invalid model' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Library-aware pattern injection (Detection Intelligence Loop)
    let patternContext = '';
    const techniqueId = body.technique_id;
    const detectionCategory = body.detection_category;

    if (techniqueId || detectionCategory) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const patternClient = createClient(supabaseUrl, serviceRoleKey);

        let patternQuery = patternClient
          .from('detection_patterns')
          .select('fields_used, query_languages, log_sources, severity, query_snippet, detection_categories')
          .limit(10);

        if (techniqueId) patternQuery = patternQuery.contains('technique_ids', [techniqueId]);
        if (detectionCategory) patternQuery = patternQuery.contains('detection_categories', [detectionCategory]);

        const { data: patterns } = await patternQuery;

        if (patterns && patterns.length > 0) {
          // Aggregate patterns into context
          const fieldCounts = new Map<string, number>();
          const logSourceCounts = new Map<string, number>();
          const categoryCounts = new Map<string, number>();
          const languages = new Set<string>();
          const snippets: string[] = [];

          for (const p of patterns) {
            for (const f of (p.fields_used || [])) fieldCounts.set(f, (fieldCounts.get(f) || 0) + 1);
            for (const ls of (p.log_sources || [])) logSourceCounts.set(ls, (logSourceCounts.get(ls) || 0) + 1);
            for (const cat of (p.detection_categories || [])) categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
            for (const lang of (p.query_languages || [])) languages.add(lang);
            if (p.query_snippet && snippets.length < 3) snippets.push(p.query_snippet);
          }

          const topFields = [...fieldCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([f]) => f);
          const topLogSources = [...logSourceCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([ls, c]) => `${ls} (${c})`);
          const categoryBreakdown = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]).map(([cat, c]) => `${cat} (${c})`);

          patternContext = [
            `[Library Context] The user's library has ${patterns.length} existing detections${techniqueId ? ` for ${techniqueId}` : ''}.`,
            `Categories: ${categoryBreakdown.join(', ')}.`,
            `Common log sources: ${topLogSources.join(', ')}.`,
            `Common fields: ${topFields.join(', ')}.`,
            `Languages used: ${[...languages].join(', ')}.`,
            snippets.length > 0 ? `\nRepresentative query snippets:\n${snippets.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '',
            `\nGenerate a detection following these conventions unless the user asks for a different approach.`,
          ].filter(Boolean).join('\n');
        }
      } catch (err) {
        console.warn('[ai-generate] Pattern context injection failed:', err);
        // Continue without pattern context
      }
    }

    // Build full system instruction with optional pattern context prepended
    const fullSystemInstruction = patternContext
      ? `${patternContext}\n\n${systemInstruction || ''}`
      : systemInstruction;

    // Determine provider from model name or explicit provider
    const provider = body.provider || getProvider(model)

    // Get API key for the provider
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
      console.error(`${provider.toUpperCase()} API key not configured`)
      return new Response(
        JSON.stringify({ error: `AI service not configured for provider: ${provider}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Route to the appropriate provider, wrapped in cost-center telemetry.
    // The telemetry wrapper records usage + cost and (when AI_BUDGET_ENFORCEMENT
    // is on) pre-checks budgets — but never modifies the provider call body.
    const feature = normalizeFeatureCode(body.feature)
    const result = await withAiTelemetry(
      {
        userId: user.id,
        feature,
        model,
        provider,
        category: 'llm',
        metadata: body.technique_id ? { technique_id: body.technique_id } : undefined,
      },
      async () => {
        switch (provider) {
          case 'google':
            return await callGeminiAPI(
              apiKey, model, prompt, responseFormat,
              fullSystemInstruction, tools, history, functionResponses
            )
          case 'openai':
            return await callOpenAIAPI(
              apiKey, model, prompt, responseFormat,
              fullSystemInstruction, tools, history, functionResponses
            )
          case 'anthropic':
            return await callAnthropicAPI(
              apiKey, model, prompt, responseFormat,
              fullSystemInstruction, tools, history, functionResponses
            )
          default:
            throw new Error(`Unsupported provider: ${provider}`)
        }
      }
    )

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    // BudgetExceededError → 429 with budget context for client display
    if (error instanceof BudgetExceededError) {
      return new Response(
        JSON.stringify({
          error: 'AI budget exceeded',
          budget: {
            scope: error.match.scope,
            scopeValue: error.match.scopeValue,
            limitUsd: error.match.limitUsd,
            currentUsd: error.match.currentUsd,
          },
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: 'An internal error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
