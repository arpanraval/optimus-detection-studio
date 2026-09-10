import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { withAiTelemetry } from '../_shared/aiTelemetry.ts'

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
  }
}
function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: getCorsHeaders(req) })
  return null
}

const EMBEDDING_MODEL = 'gemini-embedding-001'
const EMBEDDING_DIMENSIONS = 1536
const MAX_INPUT_LENGTH = 8000
const BATCH_FETCH_SIZE = 500
const MAX_BATCH_ITEMS = 500
const ID_SCAN_PAGE_SIZE = 1000
// HNSW maintenance makes large vector upserts exceed PostgREST's statement
// timeout. Keep each transaction small; retries ignore rows already persisted.
const DB_WRITE_BATCH_SIZE = 25
// Gemini's Batch API targets completion within 24 hours. Allow a full
// additional day for provider variance, then fail abandoned records.
const MAX_ACTIVE_JOB_AGE_MS = 48 * 60 * 60 * 1000

interface MappingEntry { t: 'd' | 'm'; id: string; h: string; mid?: string; ot?: string }
function isStaleActiveJob(job: { created_at?: string | null; status: string }): boolean {
  if (!['pending', 'submitted', 'running', 'processing', 'succeeded'].includes(job.status)) return false
  if (!job.created_at) return false
  const createdAt = new Date(job.created_at).getTime()
  return Number.isFinite(createdAt) && Date.now() - createdAt > MAX_ACTIVE_JOB_AGE_MS
}

async function markStaleJobFailed(supabase: any, job: any): Promise<any> {
  const errorMessage = 'Batch exceeded the 48-hour maximum age and was marked failed automatically'
  const completedAt = new Date().toISOString()
  await supabase.from('batch_embedding_jobs').update({
    status: 'failed',
    error_message: errorMessage,
    updated_at: completedAt,
    completed_at: completedAt,
  }).eq('id', job.id)
  return { ...job, status: 'failed', error_message: errorMessage, updated_at: completedAt, completed_at: completedAt }
}

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
  const parts = [d.name, d.description, d.mitreAttackIds?.join(' '), d.mitreTactics?.join(' '), d.tags?.join(' '), d.detectionQuery ? safeSlice(d.detectionQuery, 2000) : undefined, d.queryExplanation].filter(Boolean)
  return safeSlice(parts.join('\n\n'), MAX_INPUT_LENGTH)
}
function buildMitreText(obj: any): string {
  const parts = [obj.name, obj.mitre_id, obj.description, obj.data?.aliases?.join(', '), obj.data?.x_mitre_detection].filter(Boolean)
  return safeSlice(parts.join('\n\n'), MAX_INPUT_LENGTH)
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

async function geminiRequest(path: string, method: string, body?: unknown) {
  const apiKey = Deno.env.get('GEMINI_API_KEY')!
  const url = `${GEMINI_BASE}${path}?key=${apiKey}`
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(url, opts)
  if (!res.ok) { const text = await res.text(); throw new Error(`Gemini API ${res.status}: ${text}`) }
  return res.json()
}

interface BatchResultSummary {
  state: string | null
  stats: Record<string, unknown> | null
  responseCount: number
  embeddingCount: number
  providerErrorCount: number
  invalidResponseCount: number
  embeddingDimensions: number[]
  providerErrors: Array<{ signature: string; count: number }>
}

function getBatchResponses(batchResult: any): any[] {
  const batchPayload = batchResult.response ?? batchResult.metadata ?? batchResult
  const batchOutput = batchPayload.output ?? batchPayload
  const responses = batchOutput?.inlinedResponses?.inlinedResponses
    || (Array.isArray(batchOutput?.inlinedResponses) ? batchOutput.inlinedResponses : null)
    || batchResult.dest?.inlinedEmbedContentResponses
    || batchResult.dest?.inlined_embed_content_responses
    || []
  return Array.isArray(responses) ? responses : []
}

function providerErrorSignature(error: any): string {
  const code = error?.code ?? 'unknown-code'
  const status = error?.status ? ` ${error.status}` : ''
  const message = error?.message ?? JSON.stringify(error ?? 'missing error payload')
  return `[${code}${status}] ${String(message).slice(0, 700)}`
}

function summarizeBatchResult(batchResult: any): BatchResultSummary {
  const batchPayload = batchResult.response ?? batchResult.metadata ?? batchResult
  const responses = getBatchResponses(batchResult)
  const errorCounts = new Map<string, number>()
  const dimensions = new Set<number>()
  let embeddingCount = 0
  let providerErrorCount = 0
  let invalidResponseCount = 0

  for (const item of responses) {
    const values = item?.response?.embedding?.values
    if (Array.isArray(values)) {
      embeddingCount++
      dimensions.add(values.length)
      continue
    }
    if (item?.error) {
      providerErrorCount++
      const signature = providerErrorSignature(item.error)
      errorCounts.set(signature, (errorCounts.get(signature) ?? 0) + 1)
      continue
    }
    invalidResponseCount++
  }

  return {
    state: batchPayload.state ?? batchResult.state ?? null,
    stats: batchPayload.batchStats ?? batchResult.batchStats ?? null,
    responseCount: responses.length,
    embeddingCount,
    providerErrorCount,
    invalidResponseCount,
    embeddingDimensions: [...dimensions].sort((a, b) => a - b),
    providerErrors: [...errorCounts.entries()]
      .map(([signature, count]) => ({ signature, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  }
}

function formatBatchFailure(summary: BatchResultSummary, databaseErrors: string[] = []): string {
  const parts: string[] = []
  if (summary.providerErrorCount > 0) {
    const examples = summary.providerErrors.map(error => `${error.count}x ${error.signature}`).join('; ')
    parts.push(`Gemini rejected ${summary.providerErrorCount}/${summary.responseCount} items: ${examples}`)
  }
  if (summary.invalidResponseCount > 0) {
    parts.push(`${summary.invalidResponseCount}/${summary.responseCount} Gemini items had neither an embedding nor an error`)
  }
  if (databaseErrors.length > 0) {
    parts.push(`Database errors: ${databaseErrors.join('; ')}`)
  }
  return parts.join(' | ').slice(0, 4000) || 'Batch failed without a diagnostic detail'
}

function toDatabaseEmbedding(values: unknown): number[] {
  if (!Array.isArray(values)) throw new Error('Gemini response has no embedding values array')
  if (values.length < EMBEDDING_DIMENSIONS) {
    throw new Error(`Gemini returned ${values.length} dimensions; expected at least ${EMBEDDING_DIMENSIONS}`)
  }
  const embedding = values.slice(0, EMBEDDING_DIMENSIONS)
  if (!embedding.every(value => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error('Gemini embedding contains a non-finite value')
  }
  return embedding
}

async function handleSubmit(supabase: any, userId: string, req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req)
  const diag: Record<string, unknown> = { phase: 'start' }

  try {
    diag.phase = 'check_active'
    const { data: activeJobs } = await supabase.from('batch_embedding_jobs').select('id, status, created_at').in('status', ['pending', 'submitted', 'running', 'processing']).limit(1)
    if (activeJobs?.length > 0) {
      if (isStaleActiveJob(activeJobs[0])) {
        await markStaleJobFailed(supabase, activeJobs[0])
      } else {
        return new Response(JSON.stringify({ error: 'A batch job is already active', jobId: activeJobs[0].id }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    diag.phase = 'scan_embedded_detections'
    const embeddedDetSet = new Set<string>()
    let offset = 0
    while (true) {
      const { data, error } = await supabase.from('detection_embeddings').select('detection_id').range(offset, offset + ID_SCAN_PAGE_SIZE - 1)
      if (error) throw new Error(`scan_embedded_detections DB error: ${error.message}`)
      if (!data || data.length === 0) break
      for (const r of data) embeddedDetSet.add(r.detection_id)
      if (data.length < ID_SCAN_PAGE_SIZE) break
      offset += ID_SCAN_PAGE_SIZE
    }
    diag.embeddedDets = embeddedDetSet.size

    diag.phase = 'pull_pending_detections'
    const pendingDetections: any[] = []
    offset = 0
    while (pendingDetections.length < MAX_BATCH_ITEMS) {
      const { data, error } = await supabase.from('detections').select('id, name, description, "detectionQuery", "mitreAttackIds", "mitreTactics", tags, "queryExplanation"').range(offset, offset + BATCH_FETCH_SIZE - 1)
      if (error) throw new Error(`pull_pending_detections DB error: ${error.message}`)
      if (!data || data.length === 0) break
      for (const d of data) {
        if (!embeddedDetSet.has(d.id)) { pendingDetections.push(d); if (pendingDetections.length >= MAX_BATCH_ITEMS) break }
      }
      if (data.length < BATCH_FETCH_SIZE) break
      offset += BATCH_FETCH_SIZE
    }
    diag.pendingDets = pendingDetections.length

    diag.phase = 'pull_pending_mitre'
    const mitreCapacity = MAX_BATCH_ITEMS - pendingDetections.length
    const pendingMitre: any[] = []
    if (mitreCapacity > 0) {
      const embeddedMitreSet = new Set<string>()
      offset = 0
      while (true) {
        const { data, error } = await supabase.from('mitre_embeddings').select('stix_id').range(offset, offset + ID_SCAN_PAGE_SIZE - 1)
        if (error) throw new Error(`scan_embedded_mitre DB error: ${error.message}`)
        if (!data || data.length === 0) break
        for (const r of data) embeddedMitreSet.add(r.stix_id)
        if (data.length < ID_SCAN_PAGE_SIZE) break
        offset += ID_SCAN_PAGE_SIZE
      }
      offset = 0
      while (pendingMitre.length < mitreCapacity) {
        const { data, error } = await supabase.from('mitre_objects').select('stix_id, mitre_id, name, type, description, data').in('type', ['attack-pattern', 'intrusion-set', 'malware', 'tool', 'campaign']).range(offset, offset + BATCH_FETCH_SIZE - 1)
        if (error) throw new Error(`pull_pending_mitre DB error: ${error.message}`)
        if (!data || data.length === 0) break
        for (const m of data) {
          if (!embeddedMitreSet.has(m.stix_id)) { pendingMitre.push(m); if (pendingMitre.length >= mitreCapacity) break }
        }
        if (data.length < BATCH_FETCH_SIZE) break
        offset += BATCH_FETCH_SIZE
      }
    }
    diag.pendingMitre = pendingMitre.length

    const totalQueued = pendingDetections.length + pendingMitre.length
    if (totalQueued === 0) return new Response(JSON.stringify({ error: 'No pending embeddings to process' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    diag.phase = 'build_requests'
    const mapping: MappingEntry[] = []
    const inlinedRequests: any[] = []
    for (const d of pendingDetections) {
      const text = buildDetectionText(d)
      mapping.push({ t: 'd', id: d.id, h: hashContent(text) })
      inlinedRequests.push({ request: { model: `models/${EMBEDDING_MODEL}`, content: { parts: [{ text }] }, embedContentConfig: { taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: EMBEDDING_DIMENSIONS } } })
    }
    for (const m of pendingMitre) {
      const text = buildMitreText(m)
      mapping.push({ t: 'm', id: m.stix_id, h: hashContent(text), mid: m.mitre_id, ot: m.type })
      inlinedRequests.push({ request: { model: `models/${EMBEDDING_MODEL}`, content: { parts: [{ text }] }, embedContentConfig: { taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: EMBEDDING_DIMENSIONS } } })
    }
    diag.requestCount = inlinedRequests.length

    diag.phase = 'gemini_submit'
    const requestBody = {
      batch: {
        displayName: `optimus-embeddings-${new Date().toISOString()}`,
        inputConfig: { requests: { requests: inlinedRequests } },
      },
    }
    const bodyString = JSON.stringify(requestBody)
    diag.bodyBytes = bodyString.length

    const apiKey = Deno.env.get('GEMINI_API_KEY')!
    const url = `${GEMINI_BASE}/models/${EMBEDDING_MODEL}:asyncBatchEmbedContent?key=${apiKey}`
    // Wrap the submit fetch in telemetry. NOTE: async batch submission returns
    // only the batch name — not token counts — so usage is logged as 0 here.
    // Future work: instrument handleProcess to record actual usage from the
    // completed batch response when results are fetched.
    // The original error response shape (geminiStatus + geminiBody) is preserved
    // by handling the non-2xx case OUTSIDE the wrapper, with a manual telemetry
    // log via the wrapper for the success path only.
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyString })
    const responseText = await res.text()
    if (!res.ok) {
      // Log failure event directly, then return the original error response unchanged.
      try {
        await withAiTelemetry(
          { userId, feature: 'embedding-batch', model: EMBEDDING_MODEL, provider: 'google', category: 'embedding', metadata: { batch_items: totalQueued } },
          async () => { throw new Error(`Gemini API ${res.status}: ${responseText.slice(0, 200)}`) }
        )
      } catch { /* swallow — telemetry is best-effort */ }
      return new Response(JSON.stringify({ error: 'Gemini API rejected the batch submission', geminiStatus: res.status, geminiBody: responseText.slice(0, 3000), diag }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    // Success path: fire-and-forget telemetry. Don't await — callers shouldn't wait on it.
    withAiTelemetry(
      { userId, feature: 'embedding-batch', model: EMBEDDING_MODEL, provider: 'google', category: 'embedding', metadata: { batch_items: totalQueued } },
      async () => ({ result: undefined, usage: { inputTokens: 0, outputTokens: 0 } })
    ).catch(() => { /* best-effort */ })

    const batchResponse = JSON.parse(responseText)
    const batchName = batchResponse.name || batchResponse.batch?.name
    if (!batchName) {
      return new Response(JSON.stringify({ error: 'Gemini returned success but no batch name', geminiBody: responseText.slice(0, 3000), diag }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    diag.phase = 'insert_job'
    const { data: job, error: insertError } = await supabase.from('batch_embedding_jobs').insert({ gemini_batch_name: batchName, status: 'submitted', total_items: totalQueued, request_mapping: mapping, created_by: userId }).select('id').single()
    if (insertError) {
      return new Response(JSON.stringify({ error: 'Failed to store job record', detail: insertError.message, diag }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ jobId: job.id, batchName, totalItems: totalQueued, detections: pendingDetections.length, mitre: pendingMitre.length, status: 'submitted' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err: any) {
    console.error(`[batch-embedding] submit failed at phase=${diag.phase}:`, err)
    return new Response(JSON.stringify({ error: 'Batch submit failed', phase: diag.phase, message: err?.message, diag }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
}

async function handleCheck(supabase: any, jobId: string, req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req)
  const { data: job, error } = await supabase.from('batch_embedding_jobs').select('*').eq('id', jobId).single()
  if (error || !job) return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  if (['completed', 'failed', 'cancelled'].includes(job.status)) {
    return new Response(JSON.stringify({ jobId: job.id, status: job.status, totalItems: job.total_items, processedItems: job.processed_items, failedItems: job.failed_items, errorMessage: job.error_message, completedAt: job.completed_at, createdAt: job.created_at }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (isStaleActiveJob(job)) {
    const failedJob = await markStaleJobFailed(supabase, job)
    return new Response(JSON.stringify({ jobId: failedJob.id, status: failedJob.status, totalItems: failedJob.total_items, processedItems: failedJob.processed_items, failedItems: failedJob.failed_items, errorMessage: failedJob.error_message, completedAt: failedJob.completed_at, createdAt: failedJob.created_at }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  try {
    const batchStatus = await geminiRequest(`/${job.gemini_batch_name}`, 'GET')
    // batches.get returns an Operation wrapper; state/output are under metadata.
    const batchPayload = batchStatus.metadata ?? batchStatus.response ?? batchStatus
    const batchState = batchPayload.state ?? batchStatus.state
    // Gemini's Batch API uses BATCH_STATE_* values (not JOB_STATE_*).
    // Keep the older aliases for compatibility with any legacy responses.
    const stateMap: Record<string, string> = {
      'BATCH_STATE_PENDING': 'submitted',
      'BATCH_STATE_RUNNING': 'running',
      'BATCH_STATE_SUCCEEDED': 'succeeded',
      'BATCH_STATE_FAILED': 'failed',
      'BATCH_STATE_CANCELLED': 'cancelled',
      'BATCH_STATE_EXPIRED': 'failed',
      'JOB_STATE_PENDING': 'submitted',
      'JOB_STATE_RUNNING': 'running',
      'JOB_STATE_SUCCEEDED': 'succeeded',
      'JOB_STATE_FAILED': 'failed',
      'JOB_STATE_CANCELLED': 'cancelled',
      'JOB_STATE_EXPIRED': 'failed',
    }
    const newStatus = stateMap[batchState] || job.status
    if (newStatus !== job.status) {
      const updateData: any = { status: newStatus, updated_at: new Date().toISOString() }
      if (['failed', 'cancelled'].includes(newStatus)) {
        updateData.error_message = batchPayload.error?.message || batchStatus.error?.message || ('Job ' + batchState)
        updateData.completed_at = new Date().toISOString()
      }
      await supabase.from('batch_embedding_jobs').update(updateData).eq('id', jobId)
    }
    return new Response(JSON.stringify({ jobId: job.id, status: newStatus, totalItems: job.total_items, processedItems: job.processed_items, failedItems: job.failed_items, batchStats: batchPayload.batchStats || batchStatus.batchStats || null, errorMessage: newStatus === 'failed' ? (batchPayload.error?.message || batchStatus.error?.message || 'Job failed') : null, createdAt: job.created_at }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ jobId: job.id, status: job.status, error: e.message, createdAt: job.created_at }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
}

async function handleProcess(supabase: any, jobId: string, req: Request, allowFailedRecovery = false): Promise<Response> {
  const corsHeaders = getCorsHeaders(req)
  const { data: job, error } = await supabase.from('batch_embedding_jobs').select('*').eq('id', jobId).single()
  if (error || !job) return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  const canProcess = job.status === 'succeeded' || (allowFailedRecovery && job.status === 'failed')
  if (!canProcess) return new Response(JSON.stringify({ error: `Job is ${job.status}, not ready for processing` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  await supabase.from('batch_embedding_jobs').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', jobId)
  try {
    const batchResult = await geminiRequest(`/${job.gemini_batch_name}`, 'GET')
    const responses = getBatchResponses(batchResult)
    const providerSummary = summarizeBatchResult(batchResult)
    const mapping: MappingEntry[] = job.request_mapping
    console.log('[batch-embedding] provider result summary', JSON.stringify({ jobId, ...providerSummary }))
    // Never convert an unparsed/empty provider response into a successful terminal job.
    if (!Array.isArray(mapping) || mapping.length === 0) {
      throw new Error('Batch job has no request mapping; refusing to process results')
    }
    if (responses.length !== mapping.length) {
      throw new Error(`Gemini returned ${responses.length} responses for ${mapping.length} requests`)
    }
    let processed = 0, failed = 0
    const databaseErrors: string[] = []
    const DET_BATCH: any[] = []
    const MITRE_BATCH: any[] = []
    for (let i = 0; i < mapping.length; i++) {
      const entry = mapping[i]
      const resp = responses[i]
      if (!resp?.response?.embedding?.values) { failed++; continue }
      let embeddingValues: number[]
      try {
        embeddingValues = toDatabaseEmbedding(resp.response.embedding.values)
      } catch (error) {
        failed++
        databaseErrors.push(`item ${entry.id}: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      const embedding = `[${embeddingValues.join(',')}]`
      if (entry.t === 'd') DET_BATCH.push({ detection_id: entry.id, embedding, content_hash: entry.h, embedded_text: '', updated_at: new Date().toISOString() })
      else MITRE_BATCH.push({ stix_id: entry.id, mitre_id: entry.mid, type: entry.ot, embedding, content_hash: entry.h, embedded_text: '' })
      if (DET_BATCH.length >= DB_WRITE_BATCH_SIZE) {
        const { error: uErr } = await supabase.from('detection_embeddings').upsert(DET_BATCH, { onConflict: 'detection_id', ignoreDuplicates: true })
        if (uErr) {
          failed += DET_BATCH.length
          databaseErrors.push(`detection_embeddings (${DET_BATCH.length} rows): ${uErr.message}`)
          console.error('[batch-embedding] detection upsert failed', JSON.stringify({ jobId, rows: DET_BATCH.length, error: uErr }))
        } else processed += DET_BATCH.length
        DET_BATCH.length = 0
      }
      if (MITRE_BATCH.length >= DB_WRITE_BATCH_SIZE) {
        const { error: uErr } = await supabase.from('mitre_embeddings').upsert(MITRE_BATCH, { onConflict: 'stix_id', ignoreDuplicates: true })
        if (uErr) {
          failed += MITRE_BATCH.length
          databaseErrors.push(`mitre_embeddings (${MITRE_BATCH.length} rows): ${uErr.message}`)
          console.error('[batch-embedding] MITRE upsert failed', JSON.stringify({ jobId, rows: MITRE_BATCH.length, error: uErr }))
        } else processed += MITRE_BATCH.length
        MITRE_BATCH.length = 0
      }
    }
    if (DET_BATCH.length > 0) {
      const { error: uErr } = await supabase.from('detection_embeddings').upsert(DET_BATCH, { onConflict: 'detection_id', ignoreDuplicates: true })
      if (uErr) {
        failed += DET_BATCH.length
        databaseErrors.push(`detection_embeddings (${DET_BATCH.length} rows): ${uErr.message}`)
        console.error('[batch-embedding] detection upsert failed', JSON.stringify({ jobId, rows: DET_BATCH.length, error: uErr }))
      } else processed += DET_BATCH.length
    }
    if (MITRE_BATCH.length > 0) {
      const { error: uErr } = await supabase.from('mitre_embeddings').upsert(MITRE_BATCH, { onConflict: 'stix_id', ignoreDuplicates: true })
      if (uErr) {
        failed += MITRE_BATCH.length
        databaseErrors.push(`mitre_embeddings (${MITRE_BATCH.length} rows): ${uErr.message}`)
        console.error('[batch-embedding] MITRE upsert failed', JSON.stringify({ jobId, rows: MITRE_BATCH.length, error: uErr }))
      } else processed += MITRE_BATCH.length
    }
    const terminalStatus = failed === 0 ? 'completed' : 'failed'
    const terminalError = failed === 0 ? null : formatBatchFailure(providerSummary, databaseErrors)
    await supabase.from('batch_embedding_jobs').update({ status: terminalStatus, processed_items: processed, failed_items: failed, error_message: terminalError, updated_at: new Date().toISOString(), completed_at: new Date().toISOString() }).eq('id', jobId)
    return new Response(JSON.stringify({ jobId, status: terminalStatus, processed, failed, errorMessage: terminalError }), { status: failed === 0 ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    await supabase.from('batch_embedding_jobs').update({ status: 'failed', error_message: e.message, updated_at: new Date().toISOString(), completed_at: new Date().toISOString() }).eq('id', jobId)
    return new Response(JSON.stringify({ error: 'Failed to process results', detail: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
}

async function handleDiagnose(supabase: any, jobId: string, req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req)
  const { data: job, error } = await supabase.from('batch_embedding_jobs')
    .select('id, gemini_batch_name, status, total_items')
    .eq('id', jobId)
    .single()
  if (error || !job) {
    return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (!job.gemini_batch_name) {
    return new Response(JSON.stringify({ error: 'Job has no Gemini batch name' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const batchResult = await geminiRequest(`/${job.gemini_batch_name}`, 'GET')
    const summary = summarizeBatchResult(batchResult)
    const diagnostic = formatBatchFailure(summary)
    console.log('[batch-embedding] diagnostic result', JSON.stringify({ jobId, ...summary }))
    if (job.status === 'failed') {
      await supabase.from('batch_embedding_jobs').update({
        error_message: diagnostic,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId)
    }
    return new Response(JSON.stringify({
      jobId,
      storedStatus: job.status,
      totalItems: job.total_items,
      diagnostic,
      ...summary,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    console.error('[batch-embedding] diagnostic fetch failed', JSON.stringify({ jobId, error: e?.message }))
    return new Response(JSON.stringify({ error: 'Failed to inspect Gemini batch', detail: e?.message }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
}

async function handleCancel(supabase: any, jobId: string, req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req)
  const { data: job, error } = await supabase.from('batch_embedding_jobs').select('*').eq('id', jobId).single()
  if (error || !job) return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  if (['completed', 'failed', 'cancelled'].includes(job.status)) {
    // Idempotent: already terminal.
    return new Response(JSON.stringify({ jobId: job.id, status: job.status, message: 'Job already terminal' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  // Ask Gemini to cancel. Best-effort: if it fails, we still mark the DB row
  // cancelled so the UI is unblocked; the user is done waiting for this job.
  let geminiCancelled = false
  let geminiError: string | null = null
  if (job.gemini_batch_name) {
    try {
      await geminiRequest(`/${job.gemini_batch_name}:cancel`, 'POST', {})
      geminiCancelled = true
    } catch (e: any) {
      geminiError = e?.message || String(e)
      console.warn(`[batch-embedding] Gemini cancel failed for ${job.gemini_batch_name}:`, geminiError)
    }
  }
  const errorMessage = geminiCancelled
    ? 'Cancelled by user'
    : `Cancelled by user (Gemini cancel request failed: ${geminiError ?? 'no batch name'})`
  const { error: updateError } = await supabase.from('batch_embedding_jobs').update({
    status: 'cancelled',
    error_message: errorMessage,
    updated_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  }).eq('id', jobId)
  if (updateError) {
    return new Response(JSON.stringify({ error: 'Failed to mark job cancelled', detail: updateError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ jobId, status: 'cancelled', geminiCancelled, geminiError }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

serve(async (req: Request) => {
  const preflightResponse = handleCorsPreflight(req)
  if (preflightResponse) return preflightResponse
  const corsHeaders = getCorsHeaders(req)
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const token = authHeader.replace('Bearer ', '')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey)
    const body = await req.json()
    const { action, jobId } = body
    const isInternalDiagnostic = token === serviceRoleKey && ['diagnose', 'recover'].includes(action)
    const { data: { user }, error: authError } = isInternalDiagnostic
      ? { data: { user: null }, error: null }
      : await supabase.auth.getUser(token)
    if (!isInternalDiagnostic && (authError || !user)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    // ADMIN GATE: batch embedding is a global maintenance operation -- it scans
    // and re-embeds the entire detection corpus and drives Gemini batch jobs.
    // Restrict to owner/admin (the Data Sync page). Non-admin callers that reach
    // here (e.g. a bulk import using the 'batch' strategy) get 403; that path is
    // fire-and-forget and degrades gracefully.
    if (!isInternalDiagnostic) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
      if (!profile || !['owner', 'admin'].includes(profile.role)) {
        return new Response(JSON.stringify({ error: 'Forbidden: admin access required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }
    switch (action) {
      case 'submit': return handleSubmit(supabase, user!.id, req)
      case 'check':
        if (!jobId) return new Response(JSON.stringify({ error: 'jobId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        return handleCheck(supabase, jobId, req)
      case 'process':
        if (!jobId) return new Response(JSON.stringify({ error: 'jobId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        return handleProcess(supabase, jobId, req)
      case 'diagnose':
        if (!jobId) return new Response(JSON.stringify({ error: 'jobId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        return handleDiagnose(supabase, jobId, req)
      case 'recover':
        if (!isInternalDiagnostic) return new Response(JSON.stringify({ error: 'Forbidden: internal recovery only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        if (!jobId) return new Response(JSON.stringify({ error: 'jobId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        return handleProcess(supabase, jobId, req, true)
      case 'cancel':
        if (!jobId) return new Response(JSON.stringify({ error: 'jobId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        return handleCancel(supabase, jobId, req)
      case 'active': {
        const { data: activeJob } = await supabase.from('batch_embedding_jobs').select('id, status, total_items, processed_items, failed_items, gemini_batch_name, created_at, error_message').in('status', ['pending', 'submitted', 'running', 'succeeded', 'processing']).order('created_at', { ascending: false }).limit(1).maybeSingle()
        const recoveredJob = activeJob && isStaleActiveJob(activeJob) ? await markStaleJobFailed(supabase, activeJob) : activeJob
        return new Response(JSON.stringify({ job: recoveredJob || null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      default:
        return new Response(JSON.stringify({ error: `Invalid action: ${action}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Internal server error', message: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
