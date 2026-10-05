// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { packRuleConfig, packSkipReason, selectPackQuery, type PackDetection } from '../pack-deploy-policy';
import { executePackWrite, processPackItem, readPackOutcome, previewPack } from '../pack-deploy-runtime';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('pack write boundary', () => {
  function database(options: { tracked?: boolean; deployed?: boolean; changed?: boolean; permission?: boolean; sentinel?: boolean; uncertain?: boolean } = {}) {
    const frozen = { query: options.sentinel ? 'DeviceEvents' : 'index=endpoint', queryLanguage: options.sentinel ? 'KQL' : 'SPL', version: 1, ruleConfig: { name: 'Reviewed name', enabled: true, techniques: ['T1059.001'] } };
    const rpc = vi.fn().mockResolvedValue({
      data: {
        job: { id: 'job', created_by: 'owner', integration_id: 'siem', rule_config: {} },
        item: { id: 'item', detection_id: 'd1', payload: frozen },
      },
      error: null,
    });
    const from = (table: string) => {
      const rows: Record<string, unknown> = {
        profiles: { role: options.permission === false ? 'viewer' : 'admin' },
        integrations: { id: 'siem', user_id: 'owner', provider: options.sentinel ? 'sentinel' : 'splunk', category: 'siem', status: 'connected', config: {} },
        detections: [{ ...detection, version: options.changed ? 2 : 1 }],
        siem_rule_bindings: options.tracked ? [{ detection_id: 'd1' }] : [],
        pack_deploy_job_items: options.uncertain ? [{ id: 'old-item', detection_id: 'd1', vendor_rule_id: null, payload: frozen, error_message: 'Vendor write succeeded but recording it failed: duplicate key', pack_deploy_jobs: { status: 'cancelled' } }] : [],
        deployment_history: options.deployed ? [{ detection_id: 'd1', vendor_rule_id: 'existing-rule' }] : [],
      };
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        single: () => q,
        then: (resolve: (value: unknown) => void) => Promise.resolve({ data: rows[table], error: null }).then(resolve),
      };
      return q;
    };
    return { db: { rpc, from } as unknown as SupabaseClient, frozen };
  }
  const ids = { jobId: 'job', itemId: 'item', lease: 'lease' };
  it('requires explicit reconciliation for preview, then rechecks the unresolved history before writing', async () => {
    const { db } = database({ sentinel: true, uncertain: true });
    const presence = vi.fn().mockResolvedValue(new Map([['item:old-item', 'missing']]));
    expect((await previewPack(db, 'owner', 'siem', ['d1'], {}, presence))[0]).toMatchObject({ can_reconcile: true, reason: expect.stringContaining('unknown outcome') });
    expect(presence).not.toHaveBeenCalled();
    expect((await previewPack(db, 'owner', 'siem', ['d1'], {}, presence, true))[0].reason).toBeNull();
    presence.mockResolvedValue(new Map([['item:old-item', 'present']]));
    const deploy = vi.fn();
    expect(await (await executePackWrite(db, ids, deploy, presence)).json()).toMatchObject({ skipped: true, reason: expect.stringContaining('still exists') });
    expect(deploy).not.toHaveBeenCalled();
  });
  it('allows recreation after remote deletion and rechecks existence at the write boundary', async () => {
    const { db, frozen } = database({ sentinel: true, deployed: true });
    const presence = vi.fn().mockResolvedValue(new Map([['existing-rule', 'missing']]));
    const preview = await previewPack(db, 'owner', 'siem', ['d1'], {}, presence);
    expect(preview[0]).toMatchObject({ reason: null, notice: expect.stringContaining('new rule') });
    const deploy = vi.fn().mockResolvedValue(new Response('{}'));
    await executePackWrite(db, ids, deploy, presence);
    expect(presence).toHaveBeenCalledTimes(2);
    expect(deploy).toHaveBeenCalledWith(expect.objectContaining(frozen), 'owner', 'item');
    presence.mockResolvedValue(new Map([['existing-rule', 'present']]));
    deploy.mockClear();
    expect(await (await executePackWrite(db, ids, deploy, presence)).json()).toMatchObject({ skipped: true });
    expect(deploy).not.toHaveBeenCalled();
  });
  it('refuses to recreate when remote verification fails', async () => {
    const { db } = database({ sentinel: true, deployed: true });
    const deploy = vi.fn();
    const presence = vi.fn().mockRejectedValue(new Error('Sentinel unavailable'));
    await expect(previewPack(db, 'owner', 'siem', ['d1'], {}, presence)).rejects.toThrow('Sentinel unavailable');
    expect((await executePackWrite(db, ids, deploy, presence)).status).toBe(400);
    expect(deploy).not.toHaveBeenCalled();
  });
  it('deploys the frozen per-rule content under the job owner identity', async () => {
    const { db, frozen } = database();
    const deploy = vi.fn().mockResolvedValue(new Response('{}'));
    await executePackWrite(db, ids, deploy);
    expect(deploy).toHaveBeenCalledWith(
      { action: 'deploy_rule', integrationId: 'siem', detectionId: 'd1', ...frozen },
      'owner',
      'item',
    );
  });
  it.each([{ tracked: true }, { changed: true }, { deployed: true }])('skips a changed or already deployed target (%j)', async (options) => {
    const { db } = database(options);
    const deploy = vi.fn();
    const result = await executePackWrite(db, ids, deploy);
    expect(await result.json()).toMatchObject({ skipped: true });
    expect(deploy).not.toHaveBeenCalled();
  });
  it('rechecks permission immediately before deployment', async () => {
    const { db } = database({ permission: false });
    const deploy = vi.fn();
    expect((await executePackWrite(db, ids, deploy)).status).toBe(403);
    expect(deploy).not.toHaveBeenCalled();
  });
});

const detection: PackDetection = {
  id: 'd1',
  name: 'Suspicious PowerShell',
  description: 'Detect encoded commands',
  severity: 'High',
  status: 'Production',
  library_type: 'production',
  mitreTactics: ['Execution'],
  mitreAttackIds: ['T1059'],
  queries: [
    { language: 'KQL', query: 'DeviceEvents' },
    { language: 'SPL', query: 'index=endpoint' },
  ],
};

describe('pack eligibility and immutable payloads', () => {
  it.each(['defender_xdr', 'sentinel'])('keeps per-rule MITRE metadata despite empty %s defaults', (provider) => {
    const shared = { tactics: [], techniques: [], category: 'SuspiciousActivity' };
    const execution = packRuleConfig(detection, provider, shared);
    const persistence = packRuleConfig({ ...detection, mitreTactics: ['Persistence'], mitreAttackIds: ['T1547'] }, provider, shared);
    expect(execution).toMatchObject({ tactics: ['Execution'], techniques: ['T1059'] });
    expect(persistence).toMatchObject({ tactics: ['Persistence'], techniques: ['T1547'] });
    if (provider === 'defender_xdr') {
      expect(execution.category).toBe('Execution');
      expect(persistence.category).toBe('Persistence');
    }
  });
  it.each([
    { tactics: ['TA0006'], expected: 'CredentialAccess' },
    { tactics: ['  lateral-movement  '], expected: 'LateralMovement' },
    { tactics: ['CommandAndControl'], expected: 'CommandAndControl' },
    { tactics: ['Unknown', 'Defense Evasion', 'Execution'], expected: 'DefenseEvasion' },
    { tactics: [], expected: 'SuspiciousActivity' },
    { tactics: ['Unknown'], expected: 'SuspiciousActivity' },
  ])('derives Defender category from $tactics', ({ tactics, expected }) => {
    expect(packRuleConfig({ ...detection, mitreTactics: tactics }, 'defender_xdr', { category: 'Impact' }).category).toBe(expected);
  });
  it.each(['Draft', 'Development', 'Backlog', 'Deprecated', 'Archived'])('excludes %s', (status) => {
    expect(packSkipReason({ ...detection, status }, 'splunk')).toContain('requires Production, Testing or Review');
  });
  it.each(['Production', 'Testing', 'Review'])('allows %s', (status) => {
    expect(packSkipReason({ ...detection, status }, 'splunk')).toBeNull();
  });
  it('chooses the target language rather than the first query', () => {
    expect(selectPackQuery(detection, 'splunk')).toEqual({ language: 'SPL', query: 'index=endpoint' });
    expect(packSkipReason(detection, 'crowdstrike')).toContain('CQL');
  });
  it('rejects empty matching queries and permits a matching legacy fallback', () => {
    const d = { ...detection, queries: [{ language: 'SPL', query: ' ' }] };
    expect(selectPackQuery(d, 'splunk')).toBeNull();
    expect(selectPackQuery({ ...d, queryLanguage: 'SPL', detectionQuery: 'legacy' }, 'splunk')?.query).toBe('legacy');
  });
  it('skips tracked rules without weakening reviewed updates', () => {
    expect(packSkipReason(detection, 'splunk', true)).toContain('review its update');
  });
  it('preserves each detection metadata and strips pack-wide write actions', () => {
    const config = packRuleConfig(detection, 'splunk', {
      name: 'generic',
      cronSchedule: '*/5 * * * *',
      action: 'delete',
    });
    expect(config).toMatchObject({
      name: detection.name,
      description: detection.description,
      alertSeverity: '4',
      tactics: ['Execution'],
      techniques: ['T1059'],
      cronSchedule: '*/5 * * * *',
    });
    expect(config.action).toBeUndefined();
  });
  it('uses the selected Elastic query dialect and explicit severity overrides', () => {
    const config = packRuleConfig({ ...detection, queries: [{ language: 'ES|QL', query: 'FROM logs-*' }] }, 'elastic', {
      severity: 'low',
    });
    expect(config).toMatchObject({ type: 'esql', language: 'esql', severity: 'low' });
  });
});

describe('pack outcomes', () => {
  const response = (body: unknown, status: number) => new Response(JSON.stringify(body), { status });
  it.each([400, 401, 403, 404, 409])('does not retry HTTP %s and preserves details', async (status) => {
    expect(
      await readPackOutcome(
        response({ error: 'Not eligible', validation: { errors: [{ message: 'Missing SPL' }] } }, status),
      ),
    ).toMatchObject({ status: 'failed', error: 'Missing SPL', retryable: false, uncertain: false });
  });
  it('respects throttle retry timing', async () => {
    const r = response({ error: 'Throttled' }, 429);
    r.headers.set('Retry-After', '60');
    expect(await readPackOutcome(r)).toMatchObject({ retryable: true, retryAfter: 60, uncertain: false });
  });
  it('does not replay an unknown vendor result or a malformed success', async () => {
    expect(await readPackOutcome(response({}, 502))).toMatchObject({ retryable: false, uncertain: true });
    expect(await readPackOutcome(response({}, 200))).toMatchObject({ status: 'failed', uncertain: true });
  });
  it('accepts only success with a remote identity', async () => {
    expect(await readPackOutcome(response({ deployment: { vendor_rule_id: 'remote' } }, 200))).toEqual({
      status: 'succeeded',
      vendorRuleId: 'remote',
    });
  });
  it('preserves a known vendor identity when success recording fails without permitting replay', async () => {
    expect(await readPackOutcome(response({
      error: 'Vendor write succeeded but recording it failed', uncertain: true,
      deployment: { vendor_rule_id: 'created-rule' },
    }, 502))).toMatchObject({ status: 'failed', vendorRuleId: 'created-rule', uncertain: true, retryable: false });
  });
});

describe('bounded pack worker', () => {
  function database(claim: unknown, finishError: unknown = null) {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: claim, error: null })
      .mockResolvedValue({ data: true, error: finishError });
    const profile = { select: () => profile, eq: () => profile, single: async () => ({ data: { role: 'admin' } }) };
    return { rpc, from: () => profile };
  }
  const claim = { job: { id: 'job', created_by: 'owner', lease_token: 'lease' }, item: { id: 'item' } };
  it('does no work without a lease', async () => {
    const db = database(null);
    const deploy = vi.fn();
    expect(await processPackItem(db as unknown as SupabaseClient, deploy)).toBe(false);
    expect(deploy).not.toHaveBeenCalled();
  });
  it('processes just one item and passes only leased identifiers', async () => {
    const db = database(claim);
    const deploy = vi.fn().mockResolvedValue(new Response('{"deployment":{"vendor_rule_id":"remote"}}'));
    expect(await processPackItem(db as unknown as SupabaseClient, deploy)).toBe(true);
    expect(deploy).toHaveBeenCalledExactlyOnceWith({
      action: 'pack_deploy_item',
      jobId: 'job',
      itemId: 'item',
      lease: 'lease',
    });
    expect(db.rpc).toHaveBeenLastCalledWith(
      'pack_deploy_finish',
      expect.objectContaining({ p_result: { status: 'succeeded', vendorRuleId: 'remote' } }),
    );
  });
  it('records transport failures as uncertain without another vendor call', async () => {
    const db = database(claim);
    const deploy = vi.fn().mockRejectedValue(new Error('timeout'));
    await processPackItem(db as unknown as SupabaseClient, deploy);
    expect(deploy).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenLastCalledWith(
      'pack_deploy_finish',
      expect.objectContaining({ p_result: expect.objectContaining({ uncertain: true, retryable: false }) }),
    );
  });
  it('surfaces checkpoint failures instead of claiming success', async () => {
    const db = database(claim, { message: 'DB unavailable' });
    await expect(
      processPackItem(
        db as unknown as SupabaseClient,
        async () => new Response('{"deployment":{"vendor_rule_id":"remote"}}'),
      ),
    ).rejects.toThrow('DB unavailable');
  });
});
