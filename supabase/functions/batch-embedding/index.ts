import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

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

interface MappingEntry { t: 'd' | 'm'; id: string; h: string; mid?: string; ot?: string }

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

async function handleSubmit(supabase: any, userId: string, req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req)
  const diag: Record<string, unknown> = { phase: 'start' }

  try {
    diag.phase = 'check_active'
    const { data: activeJobs } = await supabase.from('batch_embedding_jobs').select('id, status').in('status', ['pending', 'submitted', 'running', 'processing']).limit(1)
    if (activeJobs?.length > 0) {
      return new Response(JSON.stringify({ error: 'A batch job is already active', jobId: activeJobs[0].id }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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
      inlinedRequests.push({ request: { model: `models/${EMBEDDING_MODEL}`, content: { parts: [{ text }] }, taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: EMBEDDING_DIMENSIONS } })
    }
    for (const m of pendingMitre) {
      const text = buildMitreText(m)
      mapping.push({ t: 'm', id: m.stix_id, h: hashContent(text), mid: m.mitre_id, ot: m.type })
      inlinedRequests.push({ request: { model: `models/${EMBEDDING_MODEL}`, content: { parts: [{ text }] }, taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: EMBEDDING_DIMENSIONS } })
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
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyString })
    const responseText = await res.text()
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Gemini API rejected the batch submission', geminiStatus: res.status, geminiBody: responseText.slice(0, 3000), diag }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
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
  try {
    const batchStatus = await geminiRequest(`/${job.gemini_batch_name}`, 'GET')
    const stateMap: Record<string, string> = { 'JOB_STATE_PENDING': 'submitted', 'JOB_STATE_RUNNING': 'running', 'JOB_STATE_SUCCEEDED': 'succeeded', 'JOB_STATE_FAILED': 'failed', 'JOB_STATE_CANCELLED': 'cancelled', 'JOB_STATE_EXPIRED': 'failed' }
    const newStatus = stateMap[batchStatus.state] || job.status
    if (newStatus !== job.status) {
      const updateData: any = { status: newStatus, updated_at: new Date().toISOString() }
      if (['failed', 'cancelled'].includes(newStatus)) {
        updateData.error_message = batchStatus.error?.message || `Job ${batchStatus.state}`
        updateData.completed_at = new Date().toISOString()
      }
      await supabase.from('batch_embedding_jobs').update(updateData).eq('id', jobId)
    }
    return new Response(JSON.stringify({ jobId: job.id, status: newStatus, totalItems: job.total_items, processedItems: job.processed_items, failedItems: job.failed_items, batchStats: batchStatus.batchStats || null, errorMessage: newStatus === 'failed' ? (batchStatus.error?.message || 'Job failed') : null, createdAt: job.created_at }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ jobId: job.id, status: job.status, error: e.message, createdAt: job.created_at }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
}

async function handleProcess(supabase: any, jobId: string, req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req)
  const { data: job, error } = await supabase.from('batch_embedding_jobs').select('*').eq('id', jobId).single()
  if (error || !job) return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  if (job.status !== 'succeeded') return new Response(JSON.stringify({ error: `Job is ${job.status}, not ready for processing` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  await supabase.from('batch_embedding_jobs').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', jobId)
  try {
    const batchResult = await geminiRequest(`/${job.gemini_batch_name}`, 'GET')
    const responses = batchResult.output?.inlinedResponses || batchResult.dest?.inlinedEmbedContentResponses || batchResult.dest?.inlined_embed_content_responses || []
    console.log(`[batch-embedding] process: got ${responses.length} responses for ${job.request_mapping?.length || 0} mapping entries`)
    const mapping: MappingEntry[] = job.request_mapping
    let processed = 0, failed = 0
    const DET_BATCH: any[] = []
    const MITRE_BATCH: any[] = []
    for (let i = 0; i < mapping.length; i++) {
      const entry = mapping[i]
      const resp = responses[i]
      if (!resp?.response?.embedding?.values) { failed++; continue }
      const embedding = `[${resp.response.embedding.values.join(',')}]`
      if (entry.t === 'd') DET_BATCH.push({ detection_id: entry.id, embedding, content_hash: entry.h, embedded_text: '', updated_at: new Date().toISOString() })
      else MITRE_BATCH.push({ stix_id: entry.id, mitre_id: entry.mid, type: entry.ot, embedding, content_hash: entry.h, embedded_text: '' })
      if (DET_BATCH.length >= 100) {
        const { error: uErr } = await supabase.from('detection_embeddings').upsert(DET_BATCH, { onConflict: 'detection_id' })
        if (uErr) failed += DET_BATCH.length; else processed += DET_BATCH.length
        DET_BATCH.length = 0
      }
      if (MITRE_BATCH.length >= 100) {
        const { error: uErr } = await supabase.from('mitre_embeddings').upsert(MITRE_BATCH, { onConflict: 'stix_id' })
        if (uErr) failed += MITRE_BATCH.length; else processed += MITRE_BATCH.length
        MITRE_BATCH.length = 0
      }
    }
    if (DET_BATCH.length > 0) {
      const { error: uErr } = await supabase.from('detection_embeddings').upsert(DET_BATCH, { onConflict: 'detection_id' })
      if (uErr) failed += DET_BATCH.length; else processed += DET_BATCH.length
    }
    if (MITRE_BATCH.length > 0) {
      const { error: uErr } = await supabase.from('mitre_embeddings').upsert(MITRE_BATCH, { onConflict: 'stix_id' })
      if (uErr) failed += MITRE_BATCH.length; else processed += MITRE_BATCH.length
    }
    await supabase.from('batch_embedding_jobs').update({ status: 'completed', processed_items: processed, failed_items: failed, updated_at: new Date().toISOString(), completed_at: new Date().toISOString() }).eq('id', jobId)
    return new Response(JSON.stringify({ jobId, status: 'completed', processed, failed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    await supabase.from('batch_embedding_jobs').update({ status: 'failed', error_message: e.message, updated_at: new Date().toISOString(), completed_at: new Date().toISOString() }).eq('id', jobId)
    return new Response(JSON.stringify({ error: 'Failed to process results', detail: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const body = await req.json()
    const { action, jobId } = body
    switch (action) {
      case 'submit': return handleSubmit(supabase, user.id, req)
      case 'check':
        if (!jobId) return new Response(JSON.stringify({ error: 'jobId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        return handleCheck(supabase, jobId, req)
      case 'process':
        if (!jobId) return new Response(JSON.stringify({ error: 'jobId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        return handleProcess(supabase, jobId, req)
      case 'cancel':
        if (!jobId) return new Response(JSON.stringify({ error: 'jobId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        return handleCancel(supabase, jobId, req)
      case 'active': {
        const { data: activeJob } = await supabase.from('batch_embedding_jobs').select('id, status, total_items, processed_items, failed_items, gemini_batch_name, created_at, error_message').in('status', ['pending', 'submitted', 'running', 'succeeded', 'processing']).order('created_at', { ascending: false }).limit(1).maybeSingle()
        return new Response(JSON.stringify({ job: activeJob || null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      default:
        return new Response(JSON.stringify({ error: `Invalid action: ${action}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Internal server error', message: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
