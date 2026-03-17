import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'

// =============================================================================
// CONFIGURATION
// =============================================================================

const EMBEDDING_MODEL = 'gemini-embedding-001'
const EMBEDDING_DIMENSIONS = 1536
const MAX_INPUT_LENGTH = 8000
const BATCH_FETCH_SIZE = 500

// =============================================================================
// TYPES
// =============================================================================

interface MappingEntry {
  /** 'd' = detection, 'm' = mitre */
  t: 'd' | 'm'
  /** detection UUID or MITRE stix_id */
  id: string
  /** content hash for change detection */
  h: string
  /** mitre_id (MITRE only) */
  mid?: string
  /** object type (MITRE only, e.g. 'attack-pattern') */
  ot?: string
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function safeSlice(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  let end = maxLen
  const code = str.charCodeAt(end - 1)
  if (code >= 0xD800 && code <= 0xDBFF) end--
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

function buildDetectionText(d: any): string {
  const parts = [
    d.name, d.description,
    d.mitreAttackIds?.join(' '), d.mitreTactics?.join(' '),
    d.tags?.join(' '),
    d.detectionQuery ? safeSlice(d.detectionQuery, 2000) : undefined,
    d.queryExplanation
  ].filter(Boolean)
  return safeSlice(parts.join('\n\n'), MAX_INPUT_LENGTH)
}

function buildMitreText(obj: any): string {
  const parts = [
    obj.name, obj.mitre_id, obj.description,
    obj.data?.aliases?.join(', '),
    obj.data?.x_mitre_detection
  ].filter(Boolean)
  return safeSlice(parts.join('\n\n'), MAX_INPUT_LENGTH)
}

// =============================================================================
// GEMINI BATCH API
// =============================================================================

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

async function geminiRequest(path: string, method: string, body?: unknown) {
  const apiKey = Deno.env.get('GEMINI_API_KEY')!
  const url = `${GEMINI_BASE}${path}?key=${apiKey}`

  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body) opts.body = JSON.stringify(body)

  const res = await fetch(url, opts)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gemini API ${res.status}: ${text}`)
  }
  return res.json()
}

// =============================================================================
// HANDLERS
// =============================================================================

async function handleSubmit(supabase: any, userId: string, req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req)

  // Check for existing active job
  const { data: activeJobs } = await supabase
    .from('batch_embedding_jobs')
    .select('id, status')
    .in('status', ['pending', 'submitted', 'running', 'processing'])
    .limit(1)

  if (activeJobs?.length > 0) {
    return new Response(
      JSON.stringify({ error: 'A batch job is already active', jobId: activeJobs[0].id }),
      { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── Collect pending detections ──
  const embeddedDetSet = new Set<string>()
  let offset = 0
  while (true) {
    const { data } = await supabase
      .from('detection_embeddings').select('detection_id')
      .range(offset, offset + 999)
    if (!data || data.length === 0) break
    for (const r of data) embeddedDetSet.add(r.detection_id)
    if (data.length < 1000) break
    offset += 1000
  }

  const pendingDetections: any[] = []
  offset = 0
  while (true) {
    const { data } = await supabase
      .from('detections')
      .select('id, name, description, "detectionQuery", "mitreAttackIds", "mitreTactics", tags, "queryExplanation"')
      .range(offset, offset + BATCH_FETCH_SIZE - 1)
    if (!data || data.length === 0) break
    for (const d of data) {
      if (!embeddedDetSet.has(d.id)) pendingDetections.push(d)
    }
    if (data.length < BATCH_FETCH_SIZE) break
    offset += BATCH_FETCH_SIZE
  }

  // ── Collect pending MITRE objects ──
  const embeddedMitreSet = new Set<string>()
  offset = 0
  while (true) {
    const { data } = await supabase
      .from('mitre_embeddings').select('stix_id')
      .range(offset, offset + 999)
    if (!data || data.length === 0) break
    for (const r of data) embeddedMitreSet.add(r.stix_id)
    if (data.length < 1000) break
    offset += 1000
  }

  const pendingMitre: any[] = []
  offset = 0
  while (true) {
    const { data } = await supabase
      .from('mitre_objects')
      .select('stix_id, mitre_id, name, type, description, data')
      .in('type', ['attack-pattern', 'intrusion-set', 'malware', 'tool', 'campaign'])
      .range(offset, offset + BATCH_FETCH_SIZE - 1)
    if (!data || data.length === 0) break
    for (const m of data) {
      if (!embeddedMitreSet.has(m.stix_id)) pendingMitre.push(m)
    }
    if (data.length < BATCH_FETCH_SIZE) break
    offset += BATCH_FETCH_SIZE
  }

  const totalPending = pendingDetections.length + pendingMitre.length
  if (totalPending === 0) {
    return new Response(
      JSON.stringify({ error: 'No pending embeddings to process' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── Build embedding requests and mapping ──
  const mapping: MappingEntry[] = []
  const embeddingRequests: any[] = []

  for (const d of pendingDetections) {
    const text = buildDetectionText(d)
    mapping.push({ t: 'd', id: d.id, h: hashContent(text) })
    embeddingRequests.push({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: EMBEDDING_DIMENSIONS,
    })
  }

  for (const m of pendingMitre) {
    const text = buildMitreText(m)
    mapping.push({ t: 'm', id: m.stix_id, h: hashContent(text), mid: m.mitre_id, ot: m.type })
    embeddingRequests.push({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: EMBEDDING_DIMENSIONS,
    })
  }

  // ── Submit to Gemini Batch API ──
  console.log(`Submitting batch embedding job: ${totalPending} items (${pendingDetections.length} detections, ${pendingMitre.length} MITRE)`)

  const batchResponse = await geminiRequest('/batches:batchEmbedContents', 'POST', {
    displayName: `optimus-embeddings-${new Date().toISOString()}`,
    model: `models/${EMBEDDING_MODEL}`,
    requests: embeddingRequests,
  })

  const batchName = batchResponse.name
  console.log(`Batch job created: ${batchName}`)

  // ── Store job record ──
  const { data: job, error: insertError } = await supabase
    .from('batch_embedding_jobs')
    .insert({
      gemini_batch_name: batchName,
      status: 'submitted',
      total_items: totalPending,
      request_mapping: mapping,
      created_by: userId,
    })
    .select('id')
    .single()

  if (insertError) {
    console.error('Failed to store batch job:', insertError)
    return new Response(
      JSON.stringify({ error: 'Failed to store job record', detail: insertError.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({
      jobId: job.id,
      batchName,
      totalItems: totalPending,
      detections: pendingDetections.length,
      mitre: pendingMitre.length,
      status: 'submitted',
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleCheck(supabase: any, jobId: string, req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req)

  const { data: job, error } = await supabase
    .from('batch_embedding_jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (error || !job) {
    return new Response(
      JSON.stringify({ error: 'Job not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // If already terminal, just return current state
  if (['completed', 'failed', 'cancelled'].includes(job.status)) {
    return new Response(
      JSON.stringify({
        jobId: job.id,
        status: job.status,
        totalItems: job.total_items,
        processedItems: job.processed_items,
        failedItems: job.failed_items,
        errorMessage: job.error_message,
        completedAt: job.completed_at,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Poll Gemini for status
  try {
    const batchStatus = await geminiRequest(`/${job.gemini_batch_name}`, 'GET')

    const stateMap: Record<string, string> = {
      'JOB_STATE_PENDING': 'submitted',
      'JOB_STATE_RUNNING': 'running',
      'JOB_STATE_SUCCEEDED': 'succeeded',
      'JOB_STATE_FAILED': 'failed',
      'JOB_STATE_CANCELLED': 'cancelled',
      'JOB_STATE_EXPIRED': 'failed',
    }

    const newStatus = stateMap[batchStatus.state] || job.status

    if (newStatus !== job.status) {
      const updateData: any = { status: newStatus, updated_at: new Date().toISOString() }
      if (['failed', 'cancelled'].includes(newStatus)) {
        updateData.error_message = batchStatus.error?.message || `Job ${batchStatus.state}`
        updateData.completed_at = new Date().toISOString()
      }
      await supabase.from('batch_embedding_jobs').update(updateData).eq('id', jobId)
    }

    return new Response(
      JSON.stringify({
        jobId: job.id,
        status: newStatus,
        totalItems: job.total_items,
        processedItems: job.processed_items,
        failedItems: job.failed_items,
        batchStats: batchStatus.batchStats || null,
        errorMessage: newStatus === 'failed' ? (batchStatus.error?.message || 'Job failed') : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e: any) {
    console.error('Error checking batch status:', e)
    return new Response(
      JSON.stringify({ jobId: job.id, status: job.status, error: e.message }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function handleProcess(supabase: any, jobId: string, req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req)

  const { data: job, error } = await supabase
    .from('batch_embedding_jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (error || !job) {
    return new Response(
      JSON.stringify({ error: 'Job not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (job.status !== 'succeeded') {
    return new Response(
      JSON.stringify({ error: `Job is ${job.status}, not ready for processing` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Mark as processing
  await supabase.from('batch_embedding_jobs')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', jobId)

  try {
    // Get batch results from Gemini
    const batchResult = await geminiRequest(`/${job.gemini_batch_name}`, 'GET')

    // The results should be in dest.inlinedEmbedContentResponses for inline requests
    const responses = batchResult.dest?.inlinedEmbedContentResponses
      || batchResult.dest?.inlined_embed_content_responses
      || []

    const mapping: MappingEntry[] = job.request_mapping
    let processed = 0
    let failed = 0

    // Process in upsert batches
    const DET_BATCH: any[] = []
    const MITRE_BATCH: any[] = []

    for (let i = 0; i < mapping.length; i++) {
      const entry = mapping[i]
      const resp = responses[i]

      if (!resp?.response?.embedding?.values) {
        failed++
        continue
      }

      const embedding = `[${resp.response.embedding.values.join(',')}]`

      if (entry.t === 'd') {
        DET_BATCH.push({
          detection_id: entry.id,
          embedding,
          content_hash: entry.h,
          embedded_text: '', // We don't store text in mapping to keep it small
          updated_at: new Date().toISOString(),
        })
      } else {
        MITRE_BATCH.push({
          stix_id: entry.id,
          mitre_id: entry.mid,
          type: entry.ot,
          embedding,
          content_hash: entry.h,
          embedded_text: '',
        })
      }

      // Upsert in chunks of 100
      if (DET_BATCH.length >= 100) {
        const { error: uErr } = await supabase.from('detection_embeddings')
          .upsert(DET_BATCH, { onConflict: 'detection_id' })
        if (uErr) { console.error('Detection upsert error:', uErr); failed += DET_BATCH.length }
        else { processed += DET_BATCH.length }
        DET_BATCH.length = 0
      }
      if (MITRE_BATCH.length >= 100) {
        const { error: uErr } = await supabase.from('mitre_embeddings')
          .upsert(MITRE_BATCH, { onConflict: 'stix_id' })
        if (uErr) { console.error('MITRE upsert error:', uErr); failed += MITRE_BATCH.length }
        else { processed += MITRE_BATCH.length }
        MITRE_BATCH.length = 0
      }
    }

    // Flush remaining
    if (DET_BATCH.length > 0) {
      const { error: uErr } = await supabase.from('detection_embeddings')
        .upsert(DET_BATCH, { onConflict: 'detection_id' })
      if (uErr) { console.error('Detection upsert error:', uErr); failed += DET_BATCH.length }
      else { processed += DET_BATCH.length }
    }
    if (MITRE_BATCH.length > 0) {
      const { error: uErr } = await supabase.from('mitre_embeddings')
        .upsert(MITRE_BATCH, { onConflict: 'stix_id' })
      if (uErr) { console.error('MITRE upsert error:', uErr); failed += MITRE_BATCH.length }
      else { processed += MITRE_BATCH.length }
    }

    // Update job status
    await supabase.from('batch_embedding_jobs').update({
      status: 'completed',
      processed_items: processed,
      failed_items: failed,
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }).eq('id', jobId)

    return new Response(
      JSON.stringify({ jobId, status: 'completed', processed, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (e: any) {
    console.error('Error processing batch results:', e)
    await supabase.from('batch_embedding_jobs').update({
      status: 'failed',
      error_message: e.message,
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }).eq('id', jobId)

    return new Response(
      JSON.stringify({ error: 'Failed to process results', detail: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { action, jobId } = body

    switch (action) {
      case 'submit':
        return handleSubmit(supabase, user.id, req)
      case 'check':
        if (!jobId) {
          return new Response(
            JSON.stringify({ error: 'jobId required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        return handleCheck(supabase, jobId, req)
      case 'process':
        if (!jobId) {
          return new Response(
            JSON.stringify({ error: 'jobId required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        return handleProcess(supabase, jobId, req)
      case 'active':
        // Return any active batch job
        const { data: activeJob } = await supabase
          .from('batch_embedding_jobs')
          .select('id, status, total_items, processed_items, failed_items, gemini_batch_name, created_at, error_message')
          .in('status', ['pending', 'submitted', 'running', 'succeeded', 'processing'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        return new Response(
          JSON.stringify({ job: activeJob || null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      default:
        return new Response(
          JSON.stringify({ error: `Invalid action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (e) {
    console.error('Batch embedding error:', e instanceof Error ? e.message : e)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
