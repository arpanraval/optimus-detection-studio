import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders, handleCorsPreflight, corsErrorResponse } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rate-limiter.ts'
import { withAiTelemetry } from '../_shared/aiTelemetry.ts'
import { parseGeminiEmbeddingUsage } from '../_shared/aiUsageParsers.ts'

// =============================================================================
// CONFIGURATION
// =============================================================================

const EMBEDDING_MODEL = 'gemini-embedding-001'
const EMBEDDING_DIMENSIONS = 1536 // Gemini supports 128-3072, using 1536 to match DB schema
const MAX_INPUT_LENGTH = 8000 // Token limit safety (Gemini limit is ~2048 tokens)

// =============================================================================
// TYPES
// =============================================================================

interface EmbeddingRequest {
  type: 'detection' | 'mitre' | 'batch_detections' | 'batch_mitre' | 'query'
  id?: string
  ids?: string[]
  text?: string
  forceRegenerate?: boolean
  feature?: string
}

interface Detection {
  id: string
  name: string
  description: string
  detectionQuery: string
  mitreAttackIds: string[]
  mitreTactics: string[]
  tags: string[]
  queryExplanation: string
}

interface MitreObject {
  stix_id: string
  mitre_id: string
  name: string
  type: string
  description: string
  data: {
    aliases?: string[]
    x_mitre_detection?: string
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Safely slice a string without breaking surrogate pairs.
 * JavaScript .slice() counts UTF-16 code units, so slicing in the middle
 * of an emoji (surrogate pair) produces invalid UTF-8 that PostgREST rejects.
 */
function safeSlice(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  let end = maxLen
  // If we're splitting a surrogate pair, back up one
  const code = str.charCodeAt(end - 1)
  if (code >= 0xD800 && code <= 0xDBFF) {
    end--
  }
  return str.slice(0, end)
}

function hashContent(text: string): string {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16)
}

function buildDetectionEmbeddingText(detection: Detection): string {
  const parts = [
    detection.name,
    detection.description,
    detection.mitreAttackIds?.join(' '),
    detection.mitreTactics?.join(' '),
    detection.tags?.join(' '),
    detection.detectionQuery ? safeSlice(detection.detectionQuery, 2000) : undefined,
    detection.queryExplanation
  ].filter(Boolean)

  return safeSlice(parts.join('\n\n'), MAX_INPUT_LENGTH)
}

function buildMitreEmbeddingText(obj: MitreObject): string {
  const parts = [
    obj.name,
    obj.mitre_id,
    obj.description,
    obj.data?.aliases?.join(', '),
    obj.data?.x_mitre_detection
  ].filter(Boolean)

  return safeSlice(parts.join('\n\n'), MAX_INPUT_LENGTH)
}

// =============================================================================
// GEMINI EMBEDDING API
// =============================================================================

async function generateEmbedding(
  text: string,
  ctx: { userId: string | null; feature: string }
): Promise<number[]> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured')
  }

  return withAiTelemetry(
    {
      userId: ctx.userId,
      feature: ctx.feature,
      model: EMBEDDING_MODEL,
      provider: 'google',
      category: 'embedding',
    },
    async () => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY!,
          },
          body: JSON.stringify({
            model: `models/${EMBEDDING_MODEL}`,
            content: {
              parts: [{ text }]
            },
            taskType: 'RETRIEVAL_DOCUMENT',
            outputDimensionality: EMBEDDING_DIMENSIONS
          })
        }
      )

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Gemini API error: ${error}`)
      }

      const data = await response.json()
      return {
        result: data.embedding.values as number[],
        usage: parseGeminiEmbeddingUsage(data),
      }
    }
  )
}

async function generateBatchEmbeddings(
  texts: string[],
  ctx: { userId: string | null; feature: string }
): Promise<number[][]> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured')
  }

  // Gemini supports batchEmbedContents for multiple texts
  const requests = texts.map(text => ({
    model: `models/${EMBEDDING_MODEL}`,
    content: {
      parts: [{ text }]
    },
    taskType: 'RETRIEVAL_DOCUMENT',
    outputDimensionality: EMBEDDING_DIMENSIONS
  }))

  return withAiTelemetry(
    {
      userId: ctx.userId,
      feature: ctx.feature,
      model: EMBEDDING_MODEL,
      provider: 'google',
      category: 'embedding',
    },
    async () => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY!,
          },
          body: JSON.stringify({ requests })
        }
      )

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Gemini API error: ${error}`)
      }

      const data = await response.json()
      // batchEmbedContents returns { embeddings: [{ values: number[] }, ...] }
      return {
        result: (data.embeddings as Array<{ values: number[] }>).map(e => e.values),
        usage: parseGeminiEmbeddingUsage(data),
      }
    }
  )
}

// =============================================================================
// HANDLERS
// =============================================================================

async function handleSingleDetection(
  supabase: any,
  id: string,
  forceRegenerate: boolean,
  ctx: { userId: string | null; feature: string }
): Promise<{ status: string; id: string }> {
  // Fetch detection
  const { data: detection, error } = await supabase
    .from('detections')
    .select('id, name, description, "detectionQuery", "mitreAttackIds", "mitreTactics", tags, "queryExplanation"')
    .eq('id', id)
    .single()

  if (error || !detection) {
    return { status: 'error', id }
  }

  // Build embedding text
  const embeddingText = buildDetectionEmbeddingText(detection)
  const contentHash = hashContent(embeddingText)

  // Check if embedding exists and is current
  if (!forceRegenerate) {
    const { data: existing } = await supabase
      .from('detection_embeddings')
      .select('content_hash')
      .eq('detection_id', id)
      .single()

    if (existing?.content_hash === contentHash) {
      return { status: 'unchanged', id }
    }
  }

  // Generate embedding
  const embedding = await generateEmbedding(embeddingText, ctx)

  // Upsert embedding
  const { error: upsertError } = await supabase
    .from('detection_embeddings')
    .upsert({
      detection_id: id,
      embedding: `[${embedding.join(',')}]`,
      content_hash: contentHash,
      embedded_text: safeSlice(embeddingText, 5000),
      updated_at: new Date().toISOString()
    }, { onConflict: 'detection_id' })

  if (upsertError) {
    console.error('Upsert error:', upsertError)
    return { status: 'error', id }
  }

  return { status: 'generated', id }
}

async function handleBatchDetections(
  supabase: any,
  ids: string[],
  forceRegenerate: boolean,
  ctx: { userId: string | null; feature: string }
): Promise<{ processed: number; generated: number; unchanged: number; errors: number; errorDetails?: string[] }> {
  const results: { processed: number; generated: number; unchanged: number; errors: number; errorDetails: string[] } =
    { processed: 0, generated: 0, unchanged: 0, errors: 0, errorDetails: [] }

  // Fetch all detections
  const { data: detections, error } = await supabase
    .from('detections')
    .select('id, name, description, "detectionQuery", "mitreAttackIds", "mitreTactics", tags, "queryExplanation"')
    .in('id', ids)

  if (error || !detections) {
    console.error('Fetch detections failed:', error?.message || 'no data returned')
    results.errorDetails.push('Fetch detections failed')
    return { ...results, processed: 0, generated: 0, unchanged: 0, errors: ids.length }
  }

  // Get existing embeddings
  const { data: existingEmbeddings } = await supabase
    .from('detection_embeddings')
    .select('detection_id, content_hash')
    .in('detection_id', ids)

  const existingMap = new Map(
    (existingEmbeddings || []).map((e: any) => [e.detection_id, e.content_hash])
  )

  // Build texts and check which need regeneration
  const toEmbed: { detection: Detection; text: string; hash: string }[] = []

  for (const detection of detections) {
    const text = buildDetectionEmbeddingText(detection)
    const hash = hashContent(text)

    if (forceRegenerate || existingMap.get(detection.id) !== hash) {
      toEmbed.push({ detection, text, hash })
    } else {
      results.unchanged++
    }
    results.processed++
  }

  if (toEmbed.length === 0) {
    return results
  }

  // Generate embeddings in batches of 100 (Gemini batch limit)
  const BATCH_SIZE = 100
  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    const batch = toEmbed.slice(i, i + BATCH_SIZE)
    const texts = batch.map(b => b.text)

    try {
      const embeddings = await generateBatchEmbeddings(texts, ctx)

      // Prepare upsert data — convert embedding to pgvector string format
      // to avoid JSON-to-vector casting issues in PostgREST
      const upsertData = batch.map((item, idx) => ({
        detection_id: item.detection.id,
        embedding: `[${embeddings[idx].join(',')}]`,
        content_hash: item.hash,
        embedded_text: safeSlice(item.text, 5000),
        updated_at: new Date().toISOString()
      }))

      // Upsert batch
      const { error: upsertError } = await supabase
        .from('detection_embeddings')
        .upsert(upsertData, { onConflict: 'detection_id' })

      if (upsertError) {
        console.error('Batch upsert error:', upsertError)
        // Batch failed — fall back to individual inserts to isolate bad rows
        for (let j = 0; j < batch.length; j++) {
          const { error: singleError } = await supabase
            .from('detection_embeddings')
            .upsert({
              detection_id: batch[j].detection.id,
              embedding: `[${embeddings[j].join(',')}]`,
              content_hash: batch[j].hash,
              embedded_text: safeSlice(batch[j].text, 5000),
              updated_at: new Date().toISOString()
            }, { onConflict: 'detection_id' })

          if (singleError) {
            results.errors++
            console.error(`Row ${batch[j].detection.id} upsert failed:`, singleError.message, singleError.code)
            results.errorDetails.push(`Row ${batch[j].detection.id}: storage failed`)
          } else {
            results.generated++
          }
        }
      } else {
        results.generated += batch.length
      }
    } catch (e: any) {
      console.error('Batch embedding error:', e)
      results.errors += batch.length
      console.error('Gemini API error:', e?.message || String(e))
      results.errorDetails.push('Embedding generation failed')
    }
  }

  return results
}

async function handleSingleMitre(
  supabase: any,
  stixId: string,
  forceRegenerate: boolean,
  ctx: { userId: string | null; feature: string }
): Promise<{ status: string; id: string }> {
  // Fetch MITRE object
  const { data: mitreObj, error } = await supabase
    .from('mitre_objects')
    .select('stix_id, mitre_id, name, type, description, data')
    .eq('stix_id', stixId)
    .single()

  if (error || !mitreObj) {
    return { status: 'error', id: stixId }
  }

  // Build embedding text
  const embeddingText = buildMitreEmbeddingText(mitreObj)
  const contentHash = hashContent(embeddingText)

  // Check if embedding exists and is current
  if (!forceRegenerate) {
    const { data: existing } = await supabase
      .from('mitre_embeddings')
      .select('content_hash')
      .eq('stix_id', stixId)
      .single()

    if (existing?.content_hash === contentHash) {
      return { status: 'unchanged', id: stixId }
    }
  }

  // Generate embedding
  const embedding = await generateEmbedding(embeddingText, ctx)

  // Upsert embedding
  const { error: upsertError } = await supabase
    .from('mitre_embeddings')
    .upsert({
      stix_id: stixId,
      mitre_id: mitreObj.mitre_id,
      type: mitreObj.type,
      embedding: `[${embedding.join(',')}]`,
      content_hash: contentHash,
      embedded_text: safeSlice(embeddingText, 5000)
    }, { onConflict: 'stix_id' })

  if (upsertError) {
    console.error('Upsert error:', upsertError)
    return { status: 'error', id: stixId }
  }

  return { status: 'generated', id: stixId }
}

async function handleBatchMitre(
  supabase: any,
  stixIds: string[],
  forceRegenerate: boolean,
  ctx: { userId: string | null; feature: string }
): Promise<{ processed: number; generated: number; unchanged: number; errors: number }> {
  const results = { processed: 0, generated: 0, unchanged: 0, errors: 0 }

  // Fetch all MITRE objects
  const { data: mitreObjs, error } = await supabase
    .from('mitre_objects')
    .select('stix_id, mitre_id, name, type, description, data')
    .in('stix_id', stixIds)

  if (error || !mitreObjs) {
    return { processed: 0, generated: 0, unchanged: 0, errors: stixIds.length }
  }

  // Get existing embeddings
  const { data: existingEmbeddings } = await supabase
    .from('mitre_embeddings')
    .select('stix_id, content_hash')
    .in('stix_id', stixIds)

  const existingMap = new Map(
    (existingEmbeddings || []).map((e: any) => [e.stix_id, e.content_hash])
  )

  // Build texts and check which need regeneration
  const toEmbed: { obj: MitreObject; text: string; hash: string }[] = []

  for (const obj of mitreObjs) {
    const text = buildMitreEmbeddingText(obj)
    const hash = hashContent(text)

    if (forceRegenerate || existingMap.get(obj.stix_id) !== hash) {
      toEmbed.push({ obj, text, hash })
    } else {
      results.unchanged++
    }
    results.processed++
  }

  if (toEmbed.length === 0) {
    return results
  }

  // Generate embeddings in batches
  const BATCH_SIZE = 100
  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    const batch = toEmbed.slice(i, i + BATCH_SIZE)
    const texts = batch.map(b => b.text)

    try {
      const embeddings = await generateBatchEmbeddings(texts, ctx)

      const upsertData = batch.map((item, idx) => ({
        stix_id: item.obj.stix_id,
        mitre_id: item.obj.mitre_id,
        type: item.obj.type,
        embedding: `[${embeddings[idx].join(',')}]`,
        content_hash: item.hash,
        embedded_text: safeSlice(item.text, 5000)
      }))

      const { error: upsertError } = await supabase
        .from('mitre_embeddings')
        .upsert(upsertData, { onConflict: 'stix_id' })

      if (upsertError) {
        console.error('Batch upsert error:', upsertError)
        results.errors += batch.length
      } else {
        results.generated += batch.length
      }
    } catch (e) {
      console.error('Batch embedding error:', e)
      results.errors += batch.length
    }
  }

  return results
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
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

    // Create Supabase client with service role for database operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify user token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Rate limiting
    const { allowed } = await checkRateLimit(
      supabase,
      `user:${user.id}:fn:generate-embedding`,
      30,
      60
    )
    if (!allowed) {
      return corsErrorResponse('Rate limit exceeded. Try again shortly.', req, 429)
    }

    // Parse request
    const body: EmbeddingRequest = await req.json()
    const { type, id, ids, text, forceRegenerate = false } = body

    // Telemetry context — passed through to every embedding call
    const ctx = { userId: user.id, feature: body.feature || 'embedding-detection' }

    // Validate batch size and UUID format
    const MAX_BATCH_SIZE = 100
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (ids && ids.length > MAX_BATCH_SIZE) {
      return new Response(JSON.stringify({ error: `Batch exceeds ${MAX_BATCH_SIZE}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (ids && ids.some((i: string) => !UUID_RE.test(i))) {
      return new Response(JSON.stringify({ error: 'Invalid ID format' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    let result: any

    switch (type) {
      case 'query':
        if (!text || !text.trim()) {
          return new Response(
            JSON.stringify({ error: 'Missing text for query embedding' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        {
          const queryText = safeSlice(text.trim(), MAX_INPUT_LENGTH)
          const embedding = await generateEmbedding(queryText, ctx)
          result = { embedding }
        }
        break

      case 'detection':
        if (!id) {
          return new Response(
            JSON.stringify({ error: 'Missing id for detection embedding' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        result = await handleSingleDetection(supabase, id, forceRegenerate, ctx)
        break

      case 'batch_detections':
        if (!ids || ids.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Missing ids for batch detection embedding' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        result = await handleBatchDetections(supabase, ids, forceRegenerate, ctx)
        break

      case 'mitre':
        if (!id) {
          return new Response(
            JSON.stringify({ error: 'Missing id for MITRE embedding' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        result = await handleSingleMitre(supabase, id, forceRegenerate, ctx)
        break

      case 'batch_mitre':
        if (!ids || ids.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Missing ids for batch MITRE embedding' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        result = await handleBatchMitre(supabase, ids, forceRegenerate, ctx)
        break

      default:
        return new Response(
          JSON.stringify({ error: `Invalid type: ${type}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Embedding generation error:', error)
    return new Response(
      JSON.stringify({ error: 'An internal error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
