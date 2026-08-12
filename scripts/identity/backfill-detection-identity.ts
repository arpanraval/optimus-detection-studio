/**
 * Compute detection_identity_keys rows for every detection this environment's
 * anon client can see, and emit batched SQL as INSERT files for a privileged
 * connection to apply.
 *
 * Values are generated, never reimplemented in SQL -- the same method used by
 * migrations 20260807110000 and 20260811130000, and for the same reason: a
 * second implementation is the drift this codebase keeps being bitten by. The
 * derivation itself lives in `_shared/detection-identity.ts` and is imported
 * unchanged here; this file is paging and batching only.
 *
 * This machine carries only `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` --
 * there is no service-role key -- and `detection_identity_keys` deliberately
 * has no INSERT policy, so an anon client cannot write to it. The script
 * therefore reads with the anon client (RLS admits every row this backfill
 * needs: all `production` detections plus `development` ones that are
 * `shared` or owned), computes every key, and writes batched
 * `INSERT ... FROM jsonb_to_recordset(...)` statements to a gitignored
 * scratch directory instead of writing to the database itself. A privileged
 * connection applies those batches separately.
 *
 * Idempotent: the table's UNIQUE (detection_id, key_type, key_value) plus the
 * `ON CONFLICT ... DO NOTHING` in every emitted statement makes re-applying a
 * batch a no-op for unchanged rows.
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildIdentityKeys,
  type DetectionIdentityInput,
  type IdentityKeyRow,
} from '../../supabase/functions/_shared/detection-identity';

const PAGE_SIZE = 1000;
/**
 * Rows per emitted SQL file. Deliberately small: the batches are applied by
 * relaying each file's full text through a chat-mediated tool call (the
 * Supabase MCP `execute_sql` tool), and that relay path truncates well before
 * a 2,000-row (~340KB) file would fit in one call. 200 rows keeps every batch
 * comfortably under that ceiling.
 */
const BATCH_SIZE = 200;

/** Dollar-quote tag carrying the JSON payload. Chosen to be unlikely to occur
 *  in rule text; the script asserts it never does before writing a batch. */
const DOLLAR_TAG = '$dik$';

const OUTPUT_DIR = join(
  '.superpowers',
  'sdd',
  '2026-08-12-coverage-plan-1-detection-identity-foundation',
  'batches',
);

function toBatchSql(rows: IdentityKeyRow[]): string {
  const payload = JSON.stringify(rows);
  if (payload.includes(DOLLAR_TAG)) {
    throw new Error(
      `Batch payload contains the dollar-quote tag ${DOLLAR_TAG} -- cannot emit safely. ` +
        'Pick a different tag or escape the payload.',
    );
  }
  return [
    'INSERT INTO public.detection_identity_keys (detection_id, key_type, namespace, key_value)',
    'SELECT detection_id, key_type, namespace, key_value',
    `FROM jsonb_to_recordset(${DOLLAR_TAG}${payload}${DOLLAR_TAG}::jsonb)`,
    '  AS x(detection_id text, key_type text, namespace text, key_value text)',
    'ON CONFLICT (detection_id, key_type, key_value) DO NOTHING;',
    '',
  ].join('\n');
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set');
  }
  const supabase = createClient(url, key);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  let pending: IdentityKeyRow[] = [];
  let batchIndex = 0;
  let totalKeys = 0;
  let totalDetections = 0;

  function writeBatch(rows: IdentityKeyRow[]) {
    batchIndex += 1;
    const filename = join(OUTPUT_DIR, `batch-${String(batchIndex).padStart(4, '0')}.sql`);
    writeFileSync(filename, toBatchSql(rows), 'utf8');
    totalKeys += rows.length;
    console.log(`wrote ${filename} (${rows.length} rows)`);
  }

  function drain(final: boolean) {
    while (pending.length >= BATCH_SIZE) {
      writeBatch(pending.splice(0, BATCH_SIZE));
    }
    if (final && pending.length > 0) {
      writeBatch(pending.splice(0, pending.length));
    }
  }

  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('detections')
      .select('id, name, external_id, source, "detectionQuery", source_url')
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const detection of data as DetectionIdentityInput[]) {
      pending.push(...(await buildIdentityKeys(detection)));
    }
    totalDetections += data.length;

    drain(false);

    offset += data.length;
    console.log(`processed ${offset} detections, ${totalKeys + pending.length} keys computed`);
    if (data.length < PAGE_SIZE) break;
  }

  drain(true);

  console.log(
    `done: ${totalDetections} detections, ${totalKeys} identity keys in ${batchIndex} batch file(s) under ${OUTPUT_DIR}`,
  );
}

if (import.meta.main) {
  await main();
}
