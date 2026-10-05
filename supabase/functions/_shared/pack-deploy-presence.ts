import { IMPORT_READERS, type VendorRequest } from './siem-readers/import-readers.ts';
import { SENTINEL_API_VERSION } from './sentinel-mitre.ts';

export interface PackUncertainItem {
  id: string;
  vendor_rule_id: string | null;
  error_message: string | null;
  payload: { query?: string; ruleConfig?: { name?: string } } | null;
  pack_deploy_jobs: { status: string } | Array<{ status: string }>;
}

export type PackPresence = 'present' | 'missing';
export type PackPresenceChecker = (
  integration: { id: string; provider: string; config: Record<string, unknown> },
  vendorIds: string[],
  uncertain?: PackUncertainItem[],
) => Promise<Map<string, PackPresence>>;

/** Read-only. An incomplete scan or an authorization error is never evidence of deletion. */
export async function sentinelPackPresence(request: VendorRequest, vendorIds: string[], uncertain: PackUncertainItem[] = []): Promise<Map<string, PackPresence>> {
  const ids = [...new Set(vendorIds)];
  const result = new Map<string, PackPresence>();
  if (!ids.length && !uncertain.length) return result;
  if (ids.length === 1 && !uncertain.length) {
    const outcome = await IMPORT_READERS.sentinel!.readRule(request, {}, ids[0]);
    if (outcome.status === 'ok' || outcome.status === 'unsupported') result.set(ids[0], 'present');
    else if (outcome.status === 'not_found') result.set(ids[0], 'missing');
    else throw new Error(`Cannot verify the previous Sentinel rule: ${outcome.error}`);
    return result;
  }
  // A completed, paginated workspace listing is cheaper than one request per historical rule.
  const found = new Set<string>();
  const observed: Array<{ name: string; query: string }> = [];
  let cursor = { offset: 0, token: null as string | null };
  const seen = new Set<string>();
  const started = Date.now();
  for (let page = 0; page < 100 && Date.now() - started < 25000; page++) {
    const fingerprint = JSON.stringify(cursor);
    if (seen.has(fingerprint)) throw new Error('Sentinel inventory repeated a page; deletion could not be verified.');
    seen.add(fingerprint);
    const page = await request(cursor.token ?? `alertRules?api-version=${SENTINEL_API_VERSION}`) as {
      value?: Array<{ name?: string; kind?: string; properties?: { displayName?: string; query?: string } }>;
      nextLink?: string;
    };
    if (!Array.isArray(page.value)) throw new Error('Invalid Sentinel inventory; reconciliation could not complete.');
    for (const rule of page.value) {
      if (!rule.name) throw new Error('Sentinel returned a rule without an identity.');
      found.add(rule.name.toLowerCase());
      if (uncertain.length && (rule.kind === 'Scheduled' || rule.kind === 'NRT')) {
        if (typeof rule.properties?.displayName !== 'string' || typeof rule.properties?.query !== 'string') {
          throw new Error('Sentinel returned incomplete rule content; reconciliation could not complete.');
        }
        observed.push({ name: rule.properties.displayName, query: rule.properties.query });
      }
    }
    if (!page.nextLink) {
      ids.forEach((id) => result.set(id, found.has(id.toLowerCase()) ? 'present' : 'missing'));
      const normalize = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();
      for (const item of uncertain) {
        // Never clear an active write or infer an identity from an arbitrary transport failure.
        const job = Array.isArray(item.pack_deploy_jobs) ? (item.pack_deploy_jobs.length === 1 ? item.pack_deploy_jobs[0] : null) : item.pack_deploy_jobs;
        if (!job || !['cancelled', 'partial', 'failed', 'succeeded'].includes(job.status)) continue;
        if (item.vendor_rule_id) {
          result.set(`item:${item.id}`, found.has(item.vendor_rule_id.toLowerCase()) ? 'present' : 'missing');
        } else if (item.error_message?.startsWith('Vendor write succeeded but recording it failed:') &&
          item.payload?.query?.trim() && item.payload.ruleConfig?.name?.trim()) {
          // Legacy recording failures lost the new ID. Any name OR query match remains blocked.
          const match = observed.some((rule) => normalize(rule.name) === normalize(item.payload!.ruleConfig!.name!) ||
            normalize(rule.query) === normalize(item.payload!.query!));
          result.set(`item:${item.id}`, match ? 'present' : 'missing');
        }
      }
      return result;
    }
    if (typeof page.nextLink !== 'string') throw new Error('Invalid Sentinel continuation.');
    cursor = { offset: 0, token: page.nextLink };
  }
  throw new Error('Sentinel inventory did not complete; deletion could not be verified.');
}
