// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IMPORT_READERS } from '../siem-readers/import-readers';
import { defenderUpdate, sentinelUpdate, semanticContent, defenderCreateSchedule } from '../siem-microsoft-writes';
import { applyNativeMutation } from '../native-siem-service';
import { contentHash, type Json } from '../native-siem-model';
import { providerScope } from '../siem-providers';
import { runSentinelQuery, sentinelQueryUrl, sentinelToken } from '../sentinel-query';

const defender = {
  id: '222', displayName: 'Test rule', description: 'Description', status: 'enabled',
  schedule: { frequency: 'PT1H' }, queryCondition: { queryText: 'DeviceEvents', otherSetting: true },
  detectionAction: { alertTemplate: { title: 'Existing alert title', severity: 'high',
    category: 'Execution', impactedAssets: [{ identifier: 'deviceId' }], mitreTechniques: ['T1059'] },
    responseActions: [{ action: 'existing action' }] },
  lastRunDetails: { lastRunDateTime: 'yesterday' },
};
const sentinel = {
  id: '/alertRules/rule-1', name: 'rule-1', kind: 'Scheduled', etag: 'revision-1',
  properties: { displayName: 'Test rule', description: 'Description', enabled: true, severity: 'High',
    query: 'SecurityEvent', queryFrequency: 'PT1H', queryPeriod: 'P1D',
    suppressionEnabled: false, suppressionDuration: 'PT5H', triggerOperator: 'GreaterThan', triggerThreshold: 0,
    entityMappings: [{ entityType: 'Host', fieldMappings: [{ identifier: 'HostName', columnName: 'Computer' }] }],
    incidentConfiguration: { createIncident: true }, tactics: ['Execution'], techniques: ['T1059'],
    lastModifiedUtc: 'yesterday' },
};
const config = { tenantId: 'tenant', subscriptionId: 'sub', resourceGroup: 'rg', workspaceName: 'ws' };

it('preserves documented continuous creation while moving scheduled rules to frequency', () => {
  expect(defenderCreateSchedule('0')).toEqual({ period: '0' });
  expect(defenderCreateSchedule('24H')).toEqual({ frequency: 'P1D' });
  expect(defenderCreateSchedule('PT1H')).toEqual({ frequency: 'PT1H' });
});

it('keeps meaningful settings but excludes runtime revisions from older snapshots', () => {
  const common = { name: 'Rule', description: '', query: 'query', severity: 'high', enabled: true, language: 'SPL' };
  expect(semanticContent('splunk', { ...common, config: { is_scheduled: true, next_scheduled_time: 'tomorrow' } }))
    .toMatchObject({ severity: 'High', config: { is_scheduled: true } });
  expect(semanticContent('elastic', { ...common, config: { revision: 2, version: 3, objectId: 'id', unmappedFields: ['updated_at'], interval: '1h' } }).config)
    .toEqual({ interval: '1h' });
  expect(semanticContent('chronicle', { ...common, config: { revisionId: 'rev2', revisionCreateTime: 'now', compilationState: 'SUCCEEDED',
    compilationError: null, alerting: 'true', archived: 'false' } }).config).toEqual({ alerting: 'true', archived: 'false' });
});

describe.each(['defender_xdr', 'sentinel'] as const)('%s native redeployment', provider => {
  async function normalized(raw: unknown) {
    const result = await IMPORT_READERS[provider]!.readRule(async () => raw as never, config, 'rule-1');
    if (result.status !== 'ok') throw new Error(result.error);
    return result.content;
  }

  it('preserves existing provider settings and ignores execution timestamps during readback', async () => {
    const raw = provider === 'sentinel' ? sentinel : defender;
    const content = await normalized(raw);
    const desired = { ...content, query: `${content.query}\n| take 5`, severity: 'Medium' };
    const payload = provider === 'sentinel' ? sentinelUpdate(raw as never, desired) : defenderUpdate(raw as never, desired);
    const returned = provider === 'sentinel'
      ? { ...sentinel, ...payload, properties: { ...(payload.properties as object), lastModifiedUtc: 'now' } }
      : { ...defender, ...payload, lastRunDetails: { lastRunDateTime: 'now' } };
    expect(await normalized(returned)).toEqual(desired);
    if (provider === 'sentinel') {
      expect(payload.properties).toMatchObject({ entityMappings: sentinel.properties.entityMappings,
        incidentConfiguration: sentinel.properties.incidentConfiguration });
      expect(payload).toHaveProperty('etag', 'revision-1');
    } else {
      expect(payload.detectionAction).toEqual({ ...defender.detectionAction,
        alertTemplate: { ...defender.detectionAction.alertTemplate, severity: 'medium' } });
      expect(payload).not.toHaveProperty('isEnabled');
      expect(payload.schedule).toEqual({ frequency: 'PT1H' });
    }
  });

  it('uses the selected provider endpoint and commits only a verified update', async () => {
    let raw: Record<string, Json> = structuredClone(provider === 'sentinel' ? sentinel : defender);
    const remote = await normalized(raw);
    const hash = await contentHash(remote);
    const vendorId = provider === 'sentinel' ? 'rule-1' : '222';
    const binding = { id: 'binding', integration_id: 'connection', detection_id: 'detection', provider,
      provider_scope: providerScope(provider, config), vendor_rule_id: vendorId, selected_query_id: 'selected',
      query_language: 'KQL', desired_content: remote, baseline_snapshot_id: 'snapshot',
      latest_remote_snapshot_id: 'snapshot', binding_status: 'active', availability: 'present' };
    const from = vi.fn((table: string) => {
      const data = table === 'integrations' ? { id: 'connection', provider, config, status: 'connected' } :
        table === 'siem_rule_bindings' ? binding : table === 'siem_remote_rules' ? [{ rule_family: provider === 'sentinel' ? 'scheduled' : 'detection' }] :
        table === 'siem_rule_snapshots' ? [{ id: 'snapshot', content: remote, content_hash: hash }] :
        table === 'detections' ? { id: 'detection', version: 3, name: remote.name, description: remote.description,
          severity: remote.severity, queries: [{ id: 'selected', language: 'KQL', query: remote.query + '\n| take 5' }] } : null;
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in', 'single']) chain[method] = () => chain;
      chain.then = (resolve: (r: unknown) => void) => resolve({ data, error: null });
      return chain;
    });
    const rpc = vi.fn(async (name: string) => ({ data: name === 'siem_begin_deployment' ? 'operation' : true, error: null }));
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      if (_url.includes('detectionRules?$filter=')) return Response.json({ value: [{ id: vendorId }] });
      if (['PATCH', 'PUT'].includes(init.method!)) {
        raw = { ...raw, ...JSON.parse(String(init.body)) };
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify(raw));
    });
    await applyNativeMutation({ db: { from, rpc } as never, credentials: async () => ({}),
      token: { [provider]: async () => ({ Authorization: 'Bearer test' }) } as never,
      fetch, writesEnabled: true, wait: async () => {} },
    { bindingId: 'binding', operation: 'update', expectedHash: hash, expectedVersion: 3 }, 'owner');
    const writes = fetch.mock.calls.filter(([, init]) => ['PATCH', 'PUT'].includes(init.method!));
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toContain(provider === 'sentinel' ? '/alertRules/rule-1?' : '/rules/detectionRules/222');
    if (provider === 'sentinel') expect(writes[0][1].headers).toMatchObject({ 'If-Match': 'revision-1' });
    expect(rpc).toHaveBeenCalledWith('siem_finish_deployment', expect.objectContaining({ p_operation: 'operation' }));
  });
});

it('normalizes old Defender schedules and runtime metadata without manufacturing a local change', () => {
  const content = { name: 'A', description: '', query: 'DeviceEvents', language: 'KQL', severity: 'high', enabled: true,
    config: { frequency: '24H', alertTemplate: { severity: 'high', title: 'A' }, lastRunDetails: { timestamp: 'old' } } };
  expect(semanticContent('defender_xdr', content)).toMatchObject({ severity: 'High', config: { frequency: 'P1D', alertTemplate: { title: 'A' } } });
  expect(semanticContent('defender_xdr', content).config).not.toHaveProperty('lastRunDetails');
});

describe('Sentinel query execution', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('uses the saved workspace coordinates and its own token audience', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'test' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tables: [{ name: 'PrimaryResult',
        columns: [{ name: 'Count', type: 'long' }], rows: [[17]] }] })));
    vi.stubGlobal('fetch', fetch);
    const token = await sentinelToken(config, { clientId: 'id', clientSecret: 'secret' });
    expect(String(fetch.mock.calls[0][1].body)).toContain(encodeURIComponent('https://api.loganalytics.io/.default'));
    const result = await runSentinelQuery(token, config, 'SecurityEvent | count', 60);
    expect(fetch.mock.calls[1][0]).toBe(sentinelQueryUrl(config));
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ query: 'SecurityEvent | count', timespan: 'P60D' });
    expect(result).toMatchObject({ ok: true, results: [{ Count: 17 }] });
  });
  it('does not label a partial query result as successful', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'PartialError' }, tables: [] }))));
    expect(await runSentinelQuery('token', config, 'SecurityEvent', 7)).toMatchObject({ ok: false, kind: 'http' });
  });
});
