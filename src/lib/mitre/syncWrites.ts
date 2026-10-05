import type { SupabaseClient } from '@supabase/supabase-js';

/** PostgREST errors resolve normally; never advance sync until the write is acknowledged. */
export async function writeMitreBatch(
  client: SupabaseClient,
  table: 'mitre_objects' | 'mitre_relationships',
  records: Record<string, unknown>[],
) {
  if (!records.length) return;
  const { data, error } = await client.from(table).upsert(records, { onConflict: 'stix_id' }).select('stix_id');
  if (error) throw new Error(`${table}: ${error.message}`);
  if (data?.length !== records.length) throw new Error(`${table}: not all records were saved. Sync is incomplete.`);
}

export async function publishMitreMetadata<T extends { framework_version: string }>(
  client: SupabaseClient,
  metadata: T,
) {
  const { data, error } = await client.from('mitre_metadata').insert(metadata).select('*').single();
  if (error) throw new Error(`MITRE metadata: ${error.message}`);
  if (!data || data.framework_version !== metadata.framework_version) throw new Error('MITRE version was not saved.');
  return data as T;
}

/** MITRE owns STIX fields; this application owns the separately sourced enrichment overlay. */
export function preserveTargetingIntel<T extends Record<string, unknown>>(
  incoming: T,
  previous?: Record<string, unknown>,
): T {
  return previous?.targeting_intel ? { ...incoming, targeting_intel: previous.targeting_intel } : incoming;
}
