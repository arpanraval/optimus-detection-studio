/** Authenticated backend boundary for threat-intel feed configuration. */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsErrorResponse, corsJsonResponse, handleCorsPreflight } from '../_shared/cors.ts'
import { encryptCredentials } from '../_shared/credential-crypto.ts'
import { validateUrl } from '../_shared/url-validator.ts'

const ALLOWED_FEED_TYPES = new Set(['rss', 'taxii'])
const CRON_PARTS = /^[-/,*0-9A-Za-z ?]+$/

function validSchedule(schedule: unknown): schedule is string {
  return typeof schedule === 'string' && schedule.length <= 120 && schedule.trim().split(/\s+/).length === 5 && CRON_PARTS.test(schedule)
}

function publicFeed(row: Record<string, unknown>): Record<string, unknown> {
  const { taxii_config: _legacyConfig, ...safe } = row
  return {
    ...safe,
    taxii_config: row.taxii_config || {},
    taxii_credential_present: Boolean(row.taxii_credential_id),
  }
}

serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return corsErrorResponse('Missing authorization', req, 401)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const token = authorization.slice('Bearer '.length)
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return corsErrorResponse('Invalid token', req, 401)

    const body = await req.json() as Record<string, any>
    const incoming = body.feed && typeof body.feed === 'object' ? body.feed : body
    const feedId = typeof body.feed_id === 'string' ? body.feed_id : typeof incoming.id === 'string' ? incoming.id : null
    let existingAutoDigest = false
    if (feedId) {
      const { data: existing, error } = await admin.from('threat_intel_feeds')
        .select('user_id, is_auto_digest').eq('id', feedId).single()
      if (error || !existing) return corsErrorResponse('Feed not found', req, 404)
      existingAutoDigest = existing.is_auto_digest === true
      if (!existingAutoDigest && existing.user_id !== user.id) return corsErrorResponse('Forbidden', req, 403)
    }
    const isAutoDigest = existingAutoDigest || incoming.is_auto_digest !== false
    let feedUserId = user.id
    if (isAutoDigest) {
      const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
      if (!['owner', 'admin'].includes(profile?.role)) return corsErrorResponse('Only admins can manage team sources', req, 403)
      const { data: team, error } = await admin.from('auto_digest_team').select('user_id').single()
      if (error || !team) return corsErrorResponse('Team digest is not configured', req, 409)
      feedUserId = team.user_id
    }
    const feedType = incoming.feed_type || 'rss'
    if (!ALLOWED_FEED_TYPES.has(feedType)) return corsErrorResponse('Unsupported feed type', req, 400)
    const validation = validateUrl(String(incoming.url || ''))
    if (!validation.valid) return corsErrorResponse(`Invalid feed URL: ${validation.error}`, req, 400)
    if (!validSchedule(incoming.schedule_cron || '0 */6 * * *')) return corsErrorResponse('Invalid schedule', req, 400)

    const safeMetadata = {
      api_root: feedType === 'taxii' ? String(incoming.taxii_api_root || incoming.taxii_config?.api_root || incoming.url) : null,
      collection_id: feedType === 'taxii' ? String(incoming.taxii_collection_id || incoming.taxii_config?.collection_id || '') : null,
    }
    if (feedType === 'taxii' && !safeMetadata.collection_id) return corsErrorResponse('TAXII collection_id is required', req, 400)

    const feedPayload: Record<string, unknown> = {
      name: String(incoming.name || '').trim().slice(0, 200),
      feed_type: feedType,
      url: validation.sanitizedUrl,
      schedule_cron: incoming.schedule_cron || '0 */6 * * *',
      is_enabled: incoming.is_enabled !== false,
      is_auto_digest: isAutoDigest,
      extraction_method: incoming.extraction_method === 'jina_reader' ? 'jina_reader' : 'direct',
      taxii_config: feedType === 'taxii' ? safeMetadata : {},
      taxii_api_root: safeMetadata.api_root,
      taxii_collection_id: safeMetadata.collection_id,
    }
    if (!feedPayload.name) return corsErrorResponse('Feed name is required', req, 400)

    let saved: Record<string, unknown> | null = null
    if (feedId) {
      const { data, error } = await admin.from('threat_intel_feeds')
        .update(feedPayload).eq('id', feedId).eq('user_id', feedUserId).select('*').single()
      if (error || !data) return corsErrorResponse('Feed update failed', req, 500)
      saved = data
    } else {
      const { data, error } = await admin.from('threat_intel_feeds')
        .insert({ ...feedPayload, user_id: feedUserId }).select('*').single()
      if (error || !data) return corsErrorResponse('Feed creation failed', req, 500)
      saved = data
    }

    if (!saved) return corsErrorResponse('Feed persistence failed', req, 500)
    const credentials = body.credentials && typeof body.credentials === 'object' ? body.credentials : null
    if (feedType === 'taxii' && credentials && Object.values(credentials).some(value => typeof value === 'string' && value.length > 0)) {
      const encrypted = await encryptCredentials(Object.fromEntries(
        Object.entries(credentials).filter(([, value]) => typeof value === 'string' && value.length > 0) as [string, string][],
      ))
      let integrationId: string | null = null
      if (saved.taxii_credential_id) {
        const { data: existingCredential } = await admin.from('integration_credentials')
          .select('integration_id').eq('id', saved.taxii_credential_id).maybeSingle()
        integrationId = existingCredential?.integration_id || null
      }
      if (!integrationId) {
        const { data: integration, error: integrationError } = await admin.from('integrations').insert({
          user_id: feedUserId, provider: 'taxii', name: String(feedPayload.name), category: 'threat_intel',
          config: safeMetadata, auth_type: 'credentials', status: 'configured',
        }).select('id').single()
        if (integrationError || !integration) return corsErrorResponse('Credential integration creation failed', req, 500)
        integrationId = integration.id
      }
      await admin.from('integration_credentials').delete().eq('integration_id', integrationId)
      const { data: credential, error: credentialError } = await admin.from('integration_credentials').insert({
        integration_id: integrationId, encrypted_data: encrypted, credential_type: 'taxii',
      }).select('id').single()
      if (credentialError || !credential) return corsErrorResponse('Credential save failed', req, 500)
      const { data: linked, error: linkError } = await admin.from('threat_intel_feeds')
        .update({ taxii_credential_id: credential.id }).eq('id', saved.id).eq('user_id', feedUserId).select('*').single()
      if (linkError || !linked) return corsErrorResponse('Credential link failed', req, 500)
      saved = linked
    }

    return corsJsonResponse({ feed: publicFeed(saved!) }, req)
  } catch (_error) {
    return corsErrorResponse('Feed operation failed', req, 500)
  }
})
