# Native SIEM library rollout

The first adapter supports CrowdStrike Falcon **correlation rules**. Other providers retain their existing workflows until their native adapters are verified.

## Installation order

1. Apply `supabase/migrations/20260914153559_native_siem_library.sql` to the intended environment. Fresh installations use the mirrored `supabase/schema.sql`.
2. Deploy the updated `integration-ops` Edge Function and its shared modules.
3. Deploy the frontend. Both CrowdStrike integration views now read the same persisted inventory.

The migration registers the `native-siem-sync` cron dispatcher when `pg_cron`, `pg_net`, and Vault are available. It uses the installation's existing Vault secrets `tr_supabase_url` and `tr_service_role_key` at execution time. No key is embedded in SQL or returned to the browser. Verify that those secrets exist and the cron job is active before rollout. A lost immediate worker hand-off is recovered on the next minute's scheduled run. Do not use a browser polling loop as the worker.

`integrations:import` plus `detection:create` and ownership of the connection are required for native import. Owner/admin/lead defaults include native import; permission overrides can revoke it. Normalized detection content is shared through the existing Production Library policy. Bindings, raw payload snapshots, sync diagnostics, and local revision snapshots remain connection-owner scoped.

The adapter requires a valid CrowdStrike API origin and customer ID. Configure encrypted credentials through the normal integration settings. Legacy browser-only development credentials must be migrated through that existing settings flow; the native worker never receives browser-supplied credentials or rule payloads.

## Job kinds

Fetching a connection builds a read-only **inventory**: the worker discovers and normalizes every supported rule but creates no Production Library detection. The user reviews the inventory and imports selectively. Three run kinds exist: `inventory` (browse, nothing imported), `refresh_tracked` (re-observes rules that already have an active binding, updating their latest snapshot without creating anything new), and `import_selection` (creates detections and bindings only for the rules the user chose). `native_sync_start` is kept as an alias for `native_inventory_start` so the current frontend keeps working without importing anything.

## Partial detail responses

`entities/rules/v1` can legitimately return fewer resources than requested. A short batch response is not evidence of deletion: the worker retries one individual read per omitted id (capped at the chunk size, so a degraded vendor cannot turn one chunk into a request storm — any ids left over from the cap simply stay pending for the next chunk). A rule that still comes back empty (HTTP 200, empty `resources`) on its own read is reported to the user as unreadable, with an actionable message naming both possibilities (deleted, or a rule type this connection cannot read); it is never treated as deleted. Only a completed scan — one that reads every tracked rule without a partial or failed batch — marks a rule `Not found`.

A thrown error on the individual retry (auth failure, rate limit, 5xx, or a non-empty `errors` array) is a different signal entirely and is never reinterpreted as a missing rule: it propagates out of the chunk, the run's existing fenced-failure handling requeues it with backoff, and the run only gives up after repeated attempts. Reporting a systemic outage as "this rule may have been deleted" across every id in the chunk would be actively misleading.

## Production write gate

Keep `NATIVE_SIEM_MUTATIONS` unset or `false` until sandbox verification succeeds. This permits persistence, local query/configuration editing, comparisons, accepting production changes, and local revision restore. It blocks native production mutations on the server. Existing legacy deploy/toggle/delete paths also reject linked rules, including bulk callers and the development proxy entry points.

After validating the supported rule family in a sandbox, `NATIVE_SIEM_MUTATIONS=true` enables reviewed updates and enable/disable/delete operations against the original remote identity. Imported detections start as unreviewed Drafts in Production Library and must pass the existing lifecycle eligibility gate before mutation. A fresh remote read rejects a stale review; a second read verifies the write. Ambiguous outcomes block retries until sync observes production again. There is no automatic missing-rule recreation.

CrowdStrike does not provide an atomic conditional-write guarantee in this adapter. A change between the pre-write read and PATCH remains a race; readback detects divergence but cannot undo another actor's overwritten change. Keep writes gated if that limitation is unacceptable.

## Verification

- `bun run type-check`, `bun run test`, `bun run build`.
- `supabase/tests/native-siem.sql` runs inside a rollback-only transaction against an isolated database. Schema-check CI executes it after loading the full schema. It verifies identity, deduplication, local-edit preservation, lease rejection, atomic acceptance, operation serialization, tombstones, and private snapshot access.
- Model/worker tests cover configuration fidelity, multi-query selection, drift states, partial provider responses, stale reviews, installation gating, and uncertain writes. Hook tests cover reload persistence and changing connections.
- Before enabling writes, exercise query, schedule, severity, enable/disable, and delete round trips with disposable rules. Verify the remote ID and rule count, unchanged notification/suppression fields, permission-denied behavior, concurrent portal changes, and timeout reconciliation.

Current limits: legacy imports with ambiguous connection identity remain in the sync's attention list; they are never automatically merged by name. Provider expansion, an explicit missing-rule recreation flow, and general delegated connection permissions remain separate rollout work. Local archive retains bindings and prevents automatic reimport; remote deletion retains the library record and history.

Provider serialization was checked against the [CrowdStrike correlation-rule API reference](https://developer.crowdstrike.com/api-reference/collections/correlation-rules/). Deployment fidelity still requires a live sandbox check for the installation's rule families and API behavior.
