import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { checkPermission } from '../_shared/permissions.ts';
import { previewPack, processPackItem } from '../_shared/pack-deploy-runtime.ts';
import type { PackPresence } from '../_shared/pack-deploy-presence.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const url = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function kick() {
  const response = await fetch(`${url}/functions/v1/pack-deploy-worker`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'tick' }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Worker dispatch failed: ${response.status}`);
}

function background(task: Promise<unknown>) {
  // Scheduled dispatch recovers a failed continuation. Never persist the user's JWT.
  EdgeRuntime.waitUntil(task.catch((error) => console.error('Pack deployment:', error)));
}

serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const headers = { ...getCorsHeaders(req), 'Content-Type': 'application/json' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Authentication required' }, 401);
    const body = await req.json();
    if (body.action === 'tick') {
      if (!key || token !== key) return json({ error: 'Worker authorization required' }, 403);
      background(
        (async () => {
          const processed = await processPackItem(db, (payload) =>
            fetch(`${url}/functions/v1/integration-ops`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(110000),
            }),
          );
          if (processed) await kick();
        })(),
      );
      return json({ accepted: true }, 202);
    }
    const auth = await db.auth.getUser(token);
    if (auth.error || !auth.data.user) return json({ error: 'Unauthorized' }, 401);
    const actor = auth.data.user.id;
    if (!(await checkPermission(db, actor, 'integrations:sync')).allowed)
      return json({ error: 'Deployment permission required' }, 403);
    if (body.action === 'preview' || body.action === 'reconcile' || body.action === 'create') {
      if (body.action === 'create') {
        const readiness = await db.rpc('pack_deploy_ready');
        if (readiness.error || readiness.data !== true) {
          return json(
            {
              error: 'Background deployment is not configured. Ask an administrator to finish backend setup.',
            },
            503,
          );
        }
      }
      if (body.action === 'create' && body.requestKey) {
        const existing = await db
          .from('pack_deploy_jobs')
          .select('id,integration_id')
          .eq('created_by', actor)
          .eq('request_key', body.requestKey)
          .maybeSingle();
        if (existing.error) throw new Error(existing.error.message);
        if (existing.data) {
          if (existing.data.integration_id !== body.integrationId)
            return json({ error: 'Request key belongs to another connection' }, 409);
          background(kick());
          return json({ jobId: existing.data.id }, 202);
        }
      }
      if (!Array.isArray(body.detectionIds) || !body.detectionIds.every((id: unknown) => typeof id === 'string')) {
        return json({ error: 'Detection IDs required' }, 400);
      }
      const items = await previewPack(db, actor, body.integrationId, body.detectionIds, body.ruleConfig ?? {}, async (integration, vendorRuleIds, uncertain) => {
        const response = await fetch(`${url}/functions/v1/integration-ops`, {
          method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'pack_deploy_presence', actorId: actor, integrationId: integration.id, vendorRuleIds,
            reconcileDetectionIds: uncertain?.length ? body.detectionIds : [] }),
          signal: AbortSignal.timeout(45000),
        });
        const result = await response.json();
        if (!response.ok || !result.presence) throw new Error(result.error || 'Could not verify existing Sentinel rules.');
        return new Map(Object.entries(result.presence) as Array<[string, PackPresence]>);
      }, body.action === 'reconcile' || body.reconcile === true);
      if (body.action === 'preview' || body.action === 'reconcile') return json({ items });
      if (!items.some((item) => !item.reason)) return json({ error: 'No deployable rules', items }, 400);
      if (body.packId) {
        const userDb = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const pack = await userDb.from('detection_packs').select('id').eq('id', body.packId).single();
        if (pack.error || !pack.data) return json({ error: 'Pack not found' }, 403);
      }
      const result = await db.rpc('pack_deploy_create', {
        p_actor: actor,
        p_integration: body.integrationId,
        p_pack: body.packId ?? null,
        p_request: body.requestKey,
        p_config: body.ruleConfig ?? {},
        p_items: items,
      });
      if (result.error) throw new Error(result.error.message);
      background(kick());
      return json({ jobId: result.data }, 202);
    }
    if (body.action === 'retry' || body.action === 'cancel') {
      const result = await db.rpc('pack_deploy_control', { p_actor: actor, p_job: body.jobId, p_action: body.action });
      if (result.error) throw new Error(result.error.message);
      if (body.action === 'retry') background(kick());
      return json({ ok: true });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
