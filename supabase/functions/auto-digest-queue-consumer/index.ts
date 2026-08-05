/**
 * Durable Auto-Digest queue consumer.
 *
 * PGMQ keeps the message until this worker archives it after the target
 * operation returns successfully. A failed invocation leaves the message
 * hidden until its visibility timeout expires, allowing bounded redelivery.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsErrorResponse, corsJsonResponse, handleCorsPreflight } from '../_shared/cors.ts'

const MAX_DELIVERIES = 5
const VISIBILITY_SECONDS = 180

interface QueueMessage {
  msg_id: number
  read_ct: number
  message: {
    kind?: string
    job_id?: string
    entry_id?: string | null
    payload?: Record<string, unknown>
  }
}

function isServiceRoleRequest(req: Request, serviceRoleKey: string): boolean {
  const authorization = req.headers.get('Authorization')
  const apiKey = req.headers.get('apikey')
  return Boolean(serviceRoleKey) &&
    (authorization === `Bearer ${serviceRoleKey}` || apiKey === serviceRoleKey)
}

async function invokeOrchestrator(
  supabaseUrl: string,
  serviceRoleKey: string,
  action: 'start_job' | 'run_phase',
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const query = action === 'run_phase' ? '?action=run_phase&sync=1' : '?action=start_job'
  const response = await fetch(
    `${supabaseUrl}/functions/v1/auto-digest-orchestrator${query}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(150_000),
    },
  )

  if (response.ok) return { ok: true, status: response.status }

  // Do not persist provider response bodies or URLs in queue logs.
  return { ok: false, status: response.status, error: `orchestrator returned HTTP ${response.status}` }
}

async function quarantineMessage(
  admin: any,
  message: QueueMessage,
): Promise<void> {
  const { job_id: jobId, entry_id: entryId } = message.message || {}

  if (entryId) {
    await admin.rpc('complete_auto_digest_entry', {
      p_entry_id: entryId,
      p_status: 'quarantined',
      p_error_code: 'QUEUE_POISON_MESSAGE',
      p_error: 'Queue delivery limit exceeded',
    })
  } else if (jobId) {
    await admin
      .from('auto_digest_jobs')
      .update({
        status: 'failed',
        outcome: 'failed',
        phase: null,
        error: 'Queue delivery limit exceeded',
        completed_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .eq('status', 'processing')
  }
}

serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!isServiceRoleRequest(req, serviceRoleKey)) {
    return corsErrorResponse('Forbidden - service role required', req, 403)
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: messages, error: readError } = await admin.rpc('auto_digest_read_queue', {
      p_visibility_seconds: VISIBILITY_SECONDS,
      p_quantity: 1,
    })

    if (readError) {
      return corsErrorResponse('Queue read failed', req, 503)
    }

    const message = (messages || [])[0] as QueueMessage | undefined
    if (!message) {
      return corsJsonResponse({ ok: true, processed: 0, message: 'Queue empty' }, req)
    }

    const payload = message.message || {}
    const jobId = typeof payload.job_id === 'string' ? payload.job_id : null
    const kind = payload.kind

    if (!jobId || (kind !== 'run_job' && kind !== 'run_phase')) {
      await admin.rpc('auto_digest_archive_queue_message', { p_message_id: message.msg_id })
      return corsJsonResponse({ ok: true, processed: 1, archived: true, reason: 'invalid_message' }, req)
    }

    const operation = kind === 'run_job'
      ? await invokeOrchestrator(supabaseUrl, serviceRoleKey, 'start_job', { job_id: jobId })
      : await invokeOrchestrator(supabaseUrl, serviceRoleKey, 'run_phase', {
        job_id: jobId,
        expected_phase: payload.payload?.phase,
      })

    if (!operation.ok) {
      if (Number(message.read_ct) >= MAX_DELIVERIES) {
        await quarantineMessage(admin, message)
        await admin.rpc('auto_digest_archive_queue_message', { p_message_id: message.msg_id })
        return corsJsonResponse({ ok: false, processed: 1, quarantined: true }, req)
      }
      // Do not archive. PGMQ will make the message visible after the lease.
      return corsErrorResponse(operation.error || 'Queue operation failed', req, 503)
    }

    const { error: archiveError } = await admin.rpc('auto_digest_archive_queue_message', {
      p_message_id: message.msg_id,
    })
    if (archiveError) return corsErrorResponse('Queue archive failed', req, 503)

    return corsJsonResponse({ ok: true, processed: 1, archived: true, job_id: jobId, kind }, req)
  } catch (_error) {
    return corsErrorResponse('Queue consumer failed', req, 503)
  }
})
