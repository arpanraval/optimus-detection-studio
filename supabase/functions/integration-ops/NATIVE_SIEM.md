# Native SIEM library rollout

The first adapter supports CrowdStrike Falcon **correlation rules**. Other providers retain their existing workflows until their native adapters are verified.

## Installation order

1. Apply every `supabase/migrations/*native_siem*.sql` in filename order. Fresh installations use the mirrored `supabase/schema.sql` instead — the two must agree, and `schema-check` CI now proves it by upgrading a pre-SIEM database with the migrations and diffing the resulting SIEM surface against a fresh install (`supabase/tests/siem-surface-fingerprint.sql`). A migration that forgets to mirror into `schema.sql` fails that job.
2. Deploy the updated `integration-ops` Edge Function and its shared modules.
3. Deploy the frontend. Both CrowdStrike integration views now read the same persisted inventory. Legacy deploy, toggle and delete now **route** a tracked rule through the same reviewed `applyNativeMutation` path instead of being refused outright, so the client-side `requireUnboundTarget` guard that used to block them ahead of the request has been removed.

Two scheduled jobs are registered when `pg_cron` is available: `native-siem-sync` (every minute, dispatches queued work) and `native-siem-retention` (03:17 daily, prunes superseded catalog observations). Both are guarded so a database without `pg_cron` still applies the files cleanly.

The sync migration registers the `native-siem-sync` cron dispatcher when `pg_cron`, `pg_net`, and Vault are available. It uses the installation's existing Vault secrets `tr_supabase_url` and `tr_service_role_key` at execution time. No key is embedded in SQL or returned to the browser. Verify that those secrets exist and the cron job is active before rollout. A lost immediate worker hand-off is recovered on the next minute's scheduled run. Do not use a browser polling loop as the worker.

`integrations:import` plus `detection:create` and ownership of the connection are required for native import. Owner/admin/lead defaults include native import; permission overrides can revoke it. Normalized detection content is shared through the existing Production Library policy. Bindings, raw payload snapshots, sync diagnostics, and local revision snapshots remain connection-owner scoped.

The adapter requires a valid CrowdStrike API origin and customer ID. Configure encrypted credentials through the normal integration settings. Legacy browser-only development credentials must be migrated through that existing settings flow; the native worker never receives browser-supplied credentials or rule payloads.

## Job kinds

Fetching a connection builds a read-only **inventory**: the worker discovers and normalizes every supported rule but creates no Production Library detection. The user reviews the inventory and imports selectively. Three run kinds exist: `inventory` (browse, nothing imported), `refresh_tracked` (re-observes rules that already have an active binding, updating their latest snapshot without creating anything new), and `import_selection` (creates detections and bindings only for the rules the user chose). `native_sync_start` is kept as an alias for `native_inventory_start` so the current frontend keeps working without importing anything.

## Partial detail responses

`entities/rules/v1` can legitimately return fewer resources than requested. A short batch response is not evidence of deletion: the worker retries one individual read per omitted id (capped at the chunk size, so a degraded vendor cannot turn one chunk into a request storm — any ids left over from the cap simply stay pending for the next chunk). A rule that still comes back empty (HTTP 200, empty `resources`) on its own read is reported to the user as unreadable, with an actionable message naming both possibilities (deleted, or a rule type this connection cannot read); it is never treated as deleted. Only a completed scan — one that reads every tracked rule without a partial or failed batch — marks a rule `Not found`.

A thrown error on the individual retry (auth failure, rate limit, 5xx, or a non-empty `errors` array) is a different signal entirely and is never reinterpreted as a missing rule: it propagates out of the chunk, the run's existing fenced-failure handling requeues it with backoff, and the run only gives up after repeated attempts. Reporting a systemic outage as "this rule may have been deleted" across every id in the chunk would be actively misleading.

## Production write gate

Keep `NATIVE_SIEM_MUTATIONS` unset or `false` until sandbox verification succeeds. This permits persistence, local query/configuration editing, comparisons, accepting production changes, and local revision restore. It blocks native production mutations on the server. Deploy is the only write path: the unified Deploy button routes a tracked rule through `applyNativeMutation`, the same gated function that legacy deploy, toggle and delete now reach for a linked rule (including bulk callers and the development proxy entry points), so `NATIVE_SIEM_MUTATIONS` off still blocks the vendor write regardless of which entry point is used.

After validating the supported rule family in a sandbox, `NATIVE_SIEM_MUTATIONS=true` enables reviewed updates and enable/disable/delete operations against the original remote identity. Imported detections start as unreviewed Drafts in Production Library and must pass the existing lifecycle eligibility gate before mutation. A fresh remote read rejects a stale review; a second read verifies the write. Ambiguous outcomes block retries until sync observes production again. There is no automatic missing-rule recreation.

CrowdStrike does not provide an atomic conditional-write guarantee in this adapter. A change between the pre-write read and PATCH remains a race; readback detects divergence but cannot undo another actor's overwritten change. Keep writes gated if that limitation is unacceptable.

## Feature support matrix

| Capability | State | Gate |
| --- | --- | --- |
| Browse a connection's rules (inventory) | Supported | `integrations:import` + connection ownership |
| Read-only preview of an unimported rule | Supported | as above |
| Selective import, including all-filtered-matches | Supported | as above, plus `detection:create` |
| Cancel / retry / resume an import | Supported | as above |
| Match an existing library rule to a remote rule | Supported | plus `detection:edit` on the target |
| Reconcile a link with no agreed baseline | Supported | as above |
| Compare library vs production, edit the library copy | Supported | read-only; no vendor write |
| Accept the production version into the library | Supported | local write only |
| Update / enable / disable / delete **in CrowdStrike** | **Gated off** | Deploy button → `NATIVE_SIEM_MUTATIONS` → the per-rule gate below, pending sandbox qualification |
| Providers other than CrowdStrike | Not implemented | absent from `PROVIDER_CAPABILITIES`, which is default-deny |
| Rule families other than correlation rules | Not implemented | — |

## Adding a provider

`PROVIDER_CAPABILITIES` in `native-siem-model.ts` declares, per provider, which rule families the
adapter can read, which it can also serialize back for a write, and which operations exist. It is
default-deny: a provider absent from the table supports nothing, so an adapter cannot expose
import or mutation controls by accident before its payload contract has been verified.

Query-language compatibility is deliberately **not** a capability. Two providers accepting the same
query text says nothing about whether their deployment payloads round-trip losslessly, and treating
it as proof is the specific mistake the table exists to prevent.

Adding a provider means: its own normalizer and serializer, its own fixtures, an entry in this
table naming only what has actually been exercised, and the same immutable-inventory, frozen-
selection, reconciliation, permission and audit contracts CrowdStrike uses. Do it one provider at a
time, and not before CrowdStrike write qualification passes — the contracts are still being proven
against the first adapter.

## Why a production write is unavailable

`NATIVE_SIEM_MUTATIONS` is the installation switch, not the whole gate. Each operation is also
gated per rule by `mutationBlockedReason()`, which the server refuses with and the comparison view
publishes as `capabilities` so a disabled button carries its own explanation. These reasons are now
surfaced on the Deploy action itself — Deploy is the only write path, and the comparison view
reviews and edits the library copy but no longer offers a vendor write of its own. The reasons, in
the order they are reported:

| Condition | Effect |
| --- | --- |
| installation gate off | every operation unavailable |
| rule family outside `SUPPORTED_MUTATION_FAMILIES` (only `correlation`) | every operation unavailable — `crowdStrikeUpdate` has no mapping to serialize it back |
| binding no longer active | every operation unavailable |
| an earlier write ended **uncertain** (`pending_operation_id` set) | every operation unavailable until production is observed again |
| rule missing in CrowdStrike | every operation unavailable |
| rule could not be read on the last check | every operation unavailable — `unknown` is not the same claim as `missing` |
| link never reconciled (`no_baseline`) | every operation unavailable, including toggles, which would otherwise carry the unreconciled query along |
| library already matches production | update unavailable (nothing to send) |
| production changed since the last check | enable/disable unavailable — a toggle resends the current remote content with one field flipped, and would revert whatever changed there |

An uncertain outcome is the important one: the request reached CrowdStrike and the response was
lost, so the change may or may not have landed. Retrying blind could apply it twice. The binding
stays pinned until a fetch observes production and the user reconciles.

## Sandbox qualification checklist (required before `NATIVE_SIEM_MUTATIONS=true`)

Everything above is enforced and tested against mocked vendor responses. What mocks cannot
establish is how Falcon itself behaves, so this must be run against **disposable rules in a
sandbox tenant**, never production:

1. **Identity.** Create a rule, edit it twice so it is past version 1, then confirm which id each
   endpoint expects: `entities/rules/v1` PATCH, DELETE, and the readback GET. The reader already
   accepts either `id` or `rule_id` (`matchesVendorRule`), but which one a *write* must address is
   a vendor behaviour, not something the code can assert.
2. **Round trips.** Query, schedule, severity, enable, disable, delete — one at a time, verifying
   in the Falcon console after each that only the intended field changed and notification,
   suppression and case-template settings are untouched.
3. **Concurrency.** Edit the rule in the Falcon console between the preflight read and the PATCH;
   confirm the readback reports divergence rather than silently overwriting.
4. **Authorization loss.** Revoke the API client's write scope mid-session; confirm the failure is
   reported as not-applied rather than uncertain.
5. **Lost response.** Kill the connection after the PATCH is sent; confirm the operation is
   recorded uncertain, the binding is pinned, and no retry is offered until a fetch observes
   production.
6. **Unsupported payload.** Point the adapter at a rule whose configuration `crowdStrikeUpdate`
   refuses; confirm it fails before `attempted` is set, so nothing is recorded as uncertain.

Record the evidence per operation. Until every row passes, the gate stays off — and leaving it off
costs nothing except production writes: import, comparison, local editing and reconciliation all
work with it closed.

## Retry, cancellation and recovery

An import run is durable: closing the tab does not stop it, and reopening the connection recovers the run and its per-rule outcomes from `siem_sync_items` rather than resubmitting anything.

- **Cancel** stops only unclaimed work. Rules already adopted stay in the library; that is deliberate and is stated in the results panel.
- **Retry** resets every `failed` item to pending AND resumes items that were never attempted, which is what a run that exhausted its transient retries leaves behind. It refuses only when nothing is resumable.
- **`changed_since_preview` is never retried.** That rule's content in production no longer matches what the user reviewed, so re-adopting it would import something nobody saw. It needs a fresh check and a new selection.
- A chunk whose lease expires mid-flight is requeued by the worker's fenced catch; the replacement worker cannot have its state overwritten by the expired one. Detail reads stop at a 25-second budget inside the 45-second lease so a slow-but-successful vendor cannot starve the commit.

## Operating the worker

`public.siem_worker_health` is the operator view: it lists every run that is queued, running or failed, with a `diagnosis` naming the recovery. The product UI only ever shows the newest run for a connection, so a stalled older one is invisible there.

```sql
select connection_name, kind, status, attempts, pending_items, diagnosis
  from siem_worker_health order by created_at;
```

- `lease expired` — the dispatcher reclaims it on the next minute. If it recurs, the vendor is slow or rate-limiting; check `error_message`.
- `gave up after repeated failures` — retry the import; its pending rules resume.
- `backing off before the next attempt` — nothing to do.

## Retention

`native-siem-retention` runs `siem_run_retention(5)` nightly, keeping the five most recent superseded observations per rule, per connection.

**Protected from pruning, by construction:**

- the snapshot each catalog row currently points at (`latest_snapshot_id`), by identity rather than recency;
- every snapshot of a rule that has a pending import item;
- **all** binding snapshots (`siem_rule_snapshots`) — baselines and deployment history reference them, and retention never touches that table;
- sync runs, per-rule import results (`siem_sync_items`), and the audit trail (`siem_rule_events`), which are **not pruned at all**. They are the record of what was imported and by whom; if that changes, it should be a deliberate policy decision, not a side effect of snapshot cleanup.

Each sweep writes one `siem_maintenance_runs` row: counts, timings and error text only. It carries no rule content or vendor payload, and is readable by `service_role` only — the rows span every connection, so there is no owner to scope them to.

```sql
select started_at, connections_processed, connections_failed, snapshots_removed, error_message
  from siem_maintenance_runs order by started_at desc limit 10;
```

A non-zero `connections_failed` means retention skipped a connection and carried on; the run is still recorded rather than failing silently.

## Verification

- `bun run type-check`, `bun run test`, `bun run build`.
- `supabase/tests/native-siem.sql` runs inside a rollback-only transaction against an isolated database. Schema-check CI executes it after loading the full schema. It verifies identity, deduplication, local-edit preservation, lease rejection, atomic acceptance, operation serialization, tombstones, and private snapshot access.
- Model/worker tests cover configuration fidelity, multi-query selection, drift states, partial provider responses, stale reviews, installation gating, and uncertain writes. Hook tests cover reload persistence and changing connections.
- `supabase/tests/native-siem-inventory.sql` and `native-siem-import.sql` cover the catalog, the reviewed-selection freeze, retry/resume, retention and the worker-health diagnosis. All three suites run in schema-check CI.
- `supabase/tests/siem-surface-fingerprint.sql` is the shared comparison used by the upgrade check; it is not a suite of its own.
- Scale behaviour (2,000-rule freeze, chunked adoption, duplicate protection, concurrent-import refusal) is exercised against real Postgres semantics, outside CI because it costs minutes. The vendor half of a large import still needs a sandbox.
- Before enabling writes, exercise query, schedule, severity, enable/disable, and delete round trips with disposable rules. Verify the remote ID and rule count, unchanged notification/suppression fields, permission-denied behavior, concurrent portal changes, and timeout reconciliation. Note that an edited rule comes back from `entities/rules/v1` with `id` set to the CURRENT VERSION and the stable identity in `rule_id`; every read path shares `matchesVendorRule()` for that reason, and sandbox qualification must confirm which identity each mutation endpoint expects.

Current limits: legacy imports with ambiguous connection identity remain in the sync's attention list; they are never automatically merged by name. Provider expansion, an explicit missing-rule recreation flow, and general delegated connection permissions remain separate rollout work. Local archive retains bindings and prevents automatic reimport; remote deletion retains the library record and history.

Provider serialization was checked against the [CrowdStrike correlation-rule API reference](https://developer.crowdstrike.com/api-reference/collections/correlation-rules/). Deployment fidelity still requires a live sandbox check for the installation's rule families and API behavior.
