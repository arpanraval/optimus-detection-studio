# SIEM provider capability record

Status: current as of 2026-09-16 (batch 7 of the multi-provider durable import execution).

This records what each of the six registered import providers
(`supabase/functions/_shared/siem-providers.ts:IMPORT_PROVIDERS`) actually supports today, and
what still blocks certifying it for a live tenant. **No provider in this document is "qualified."**
We hold no credentials for Splunk, Sentinel, Elastic, Defender XDR or Chronicle in this
environment, and the spec requires a live read probe before a provider is certified. Every one of
the five new providers below is **fixture-tested, not live-probed.** Only CrowdStrike has ever
been exercised against a real tenant, and that was under its own, separately qualified,
pre-existing path — this batch grants it no new capability.

## How the flag works

`ProviderMeta.nativeImportSupported` (`src/lib/providerMeta.ts`) is a compile-time mirror of the
server-owned `IMPORT_PROVIDERS` registry. It gates exactly one thing on the frontend: which panel
renders for a connection (`supportsNativeImport()` in `IntegrationDetail.tsx` and
`SiemHomePage.tsx`) and whether the legacy single-rule import path refuses a provider
(`integrationService.importVendorRule`). It is **rendering-only** — the backend independently
enforces which providers it will import from via `resolveProvider()`, regardless of what this
flag says, and no query that reads already-imported `detections` rows consults it at all. Turning
a provider's flag off therefore cannot hide detections already imported under that flag (G40):
there is nothing in the detection-library read path for a flag to gate.

All six providers currently ship with `nativeImportSupported: true` (set in an earlier batch of
this execution, before this session). **This is a UI-capability flag, not a certification
signal** — it means "the durable import engine has a reader for this provider," never "this
provider's reader has been proven against a live tenant." Certification (the "qualified" state
below) is a separate, unmet bar for every provider except CrowdStrike's original, narrower path.

## Per-provider record

### CrowdStrike Falcon
- **Status:** existing, separately qualified. Not touched by this execution's new-provider work.
- Tested API/configuration: production correlation-rules API, live tenant, pre-existing.
- Families: `correlation` (IOA). Scope: read + write (update/enable/disable/delete), the only
  provider with any write capability at all.
- Pagination: live-verified (pre-existing).
- Content mapping: live-verified (pre-existing).
- Disabled/unknown-state behaviour: live-verified (pre-existing); `status` field distinguishes
  enabled from disabled.
- Duplicate/link/delete/reimport: exercised via `siem_start_import`/inventory RPCs against
  fixtures in this execution's test suites (native-siem-import.sql, native-siem-inventory.sql).
- Permissions: documented, live-verified (pre-existing).
- **Certification: qualified for read+write.** No change in this batch.

### Splunk
- Tested configuration: `GET /servicesNS/{owner}/{app}/saved/searches?output_mode=json`
  (namespaced listing, `owner` defaults to `-`), verified against the Splunk REST manual
  (recon-provider-apis.md §1). **Fixture-tested, not live-probed.**
- Families: `savedsearch` / correlation searches surfaced as `splunk_savedsearch`. Scope:
  read-only — no write operations registered (`PROVIDER_CAPABILITIES.splunk.operations = []`).
- Pagination: offset-paged via the reader; fixture-verified only.
- Content mapping: SPL query text mapped from `content.search`; fixture-verified only.
- Disabled/unknown-state behaviour: `content.disabled` vs. `action.correlationsearch.enabled`
  fixture-verified against `devListSplunkRules`'/reader test fixtures; **which of the two enable
  flags is authoritative against a real tenant is an open question (see below).**
- Duplicate/link/delete/reimport: exercised against fixtures only (G29-class scenarios in
  native-siem-import.sql).
- Permissions: not independently verified against a live tenant.
- **Certification blockers (from recon-provider-apis.md §"Summary of unresolved items"):**
  1. Exact `paging{...}` key names under `output_mode=json` for `saved/searches` — not confirmed.
  2. False-case serialization of `action.correlationsearch.enabled`, and which of the two enable
     flags (`content.disabled` vs. `action.correlationsearch.enabled`) is authoritative.
  3. Whether a per-entry timestamp field (e.g. `updated`) is exposed under `output_mode=json`.

### Microsoft Sentinel
- Tested configuration: `GET .../workspaces/{workspaceName}/providers/Microsoft.SecurityInsights/
  alertRules?api-version=2025-06-01`, verified against Sentinel's own REST reference
  (recon-provider-apis.md §2). **Fixture-tested, not live-probed.**
- Families: analytics rules (`scheduled` confirmed; `NRT` inferred, not confirmed). Scope:
  read-only.
- Pagination: standard `nextLink`; fixture-verified only.
- Content mapping: KQL from `properties.query`; fixture-verified only.
- Disabled/unknown-state behaviour: `properties.enabled` boolean; fixture-verified only.
- Duplicate/link/delete/reimport: fixture-tested only.
- Permissions: not independently verified against a live tenant.
- **Certification blocker:** full `NrtAlertRule` JSON schema could not be retrieved — the
  discriminated-union branch for near-real-time rules was not rendered by the docs fetch; only
  inferred from prose that it lacks `queryFrequency`/`queryPeriod`/trigger fields. Needs a live
  probe or a successful fetch of that schema branch.

### Elastic Security
- Tested configuration: `GET {kibanaBase}/s/{spaceId}/api/detection_engine/rules/_find`
  (space-scoped, verified against Elastic's detection engine API). **Fixture-tested, not
  live-probed.**
- Families: `query`, `eql`, `esql`, `threshold`, `threat_match`, etc. (surfaced via `rule.type`).
  Scope: read-only.
- Pagination: `page`/`per_page`/`total`, bounded checkpointed paging (`ELASTIC_PAGE_SIZE`);
  fixture-verified only.
- Content mapping: query text/language from `rule.query`/`rule.language`; fixture-verified only.
- Disabled/unknown-state behaviour: `rule.enabled` boolean; fixture-verified only.
- Duplicate/link/delete/reimport: fixture-tested only. This batch also adds the dev-mode list path
  (`devListElasticRules`) that was missing from `IS_DEV listVendorRules`; toggle/delete already
  existed for Elastic in dev mode.
- Permissions: not independently verified against a live tenant.
- **Certification blocker:** exact ES|QL rule-type field name(s) for query text/source — the
  schema fetch was truncated before the `esql` branch rendered. Needs a live probe or a
  successful fetch of that branch.

### Microsoft Defender XDR
- Tested configuration: `GET https://graph.microsoft.com/beta/security/rules/detectionRules`
  (confirmed **beta-only**; no `v1.0` equivalent exists as of the source doc's 2026-07-01 update —
  recon-provider-apis.md §4). **Fixture-tested, not live-probed.**
- Families: custom detection rules. Scope: read-only.
- Pagination: standard Graph OData (`value[]` + `@odata.nextLink`); fixture-verified only.
- Content mapping: KQL from `queryCondition.queryText`; fixture-verified only. Note: the actual
  documented field names (`schedule.frequency`, `detectionAction.automatedActions.*`) differ from
  an earlier task brief's assumed names (`schedule.period`, `detectionAction.responseActions`,
  `detectionAction.organizationalScope`) — the reader uses the doc-confirmed names.
- Disabled/unknown-state behaviour: `status: "enabled"` string observed; the full enum (e.g.
  disabled sub-states) is not confirmed.
- Duplicate/link/delete/reimport: fixture-tested only.
- Permissions: least-privileged `CustomDetection.Read.All` documented; not independently verified
  against a live tenant.
- **Certification blockers:**
  1. Whether `detectorId` and `organizationalScope` exist at all as real fields — not present in
     the fetched example; needs the resource-type reference page or a live probe.
  2. Full enum of `status` values, and how continuous vs. scheduled custom detections differ in
     payload — not documented in the fetched page.

### Google Security Operations (Chronicle)
- Tested configuration: `GET https://{region}-chronicle.googleapis.com/v2/{customerId}/...` rules
  list + `RuleDeployment` sub-resource for enabled/alerting/archived state
  (recon-provider-apis.md §5). **Fixture-tested, not live-probed.**
- Families: `yara_l` only — curated/managed rules with unavailable source text are excluded from
  `readFamilies` rather than imported with a fabricated query. Scope: read-only.
- Pagination: `pageSize`/`pageToken`, AIP-158 standard; fixture-verified only.
- Content mapping: YARA-L from `text` (FULL view only — BASIC view, the list default, does not
  return rule text; a second per-rule `GetRule` call is required). Fixture-verified only.
- Disabled/unknown-state behaviour: `enabled`/`alerting`/`archived` live on the separate
  `RuleDeployment` resource, not on `Rule` itself; fixture-verified only.
- Duplicate/link/delete/reimport: fixture-tested only.
- Permissions: not independently verified against a live tenant.
- **Certification blockers:**
  1. Whether `view=FULL` is legal on `list` (vs. `get`-only) to fetch rule text in one call, or
     whether every rule needs a second per-rule `GetRule`.
  2. Complete `Rule` resource field list beyond the BASIC-view set plus `text` — the resource
     schema page rendered as a nav index, not the full field table.
  3. Exact deployment sub-resource ID pattern (fixed singleton `deployment` vs. an arbitrary ID),
     and what `getDeployment` returns before any deployment has been set on a newly created rule.

## Rollout order and rollback

- Ship server + migrations first, with a new provider's flag off, then enable it deliberately —
  this was the intended order; `nativeImportSupported` was already set `true` for all six by an
  earlier batch in this execution, ahead of any live certification. That decision is not reversed
  here (it renders the *import UI*, not a write capability, and no credentials exist to certify
  against regardless of the flag's value) — this record instead makes explicit that none of the
  five new providers should be described as certified while the flag is on.
- **Rollback is additive (G40):** disabling a provider's flag only changes which panel renders for
  a connection; it never touches how the detection library queries `detections` rows, so
  already-imported detections stay visible. See
  `src/lib/__tests__/providerMeta.nativeImport.test.ts` for the pinned invariant, and
  `src/lib/integrationService.ts:importVendorRule`/`src/lib/providerMeta.ts` for the only three
  call sites the flag has in `src/`.
- **Schema-before-capability (G39):** `supabase/schema.sql` — the single source of truth CI
  applies — already installs every column/function/grant this batch's readers and RPCs depend on;
  `.tmp/native-siem-validation/verify.mjs` (4 suites) confirms it applies cleanly and the
  native-siem SQL test suites pass against it. No migration in this execution is gated behind a
  runtime flag — the schema is unconditionally present regardless of which providers' UI flags are
  on, so a provider's capability can never be "enabled" ahead of the schema it depends on.

## Out of scope (unchanged from the plan)

- No new provider gains write/mutation capability. `PROVIDER_CAPABILITIES` in
  `supabase/functions/_shared/native-siem-model.ts` registers `operations: []` for every provider
  except `crowdstrike`.
- No live certification of any of the five new providers in this environment — no credentials
  exist. Every provider ships fixture-tested behind a flag that mirrors server capability, not a
  certification signal.
