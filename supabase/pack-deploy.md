# Pack deployment repair

Scope: the wizard, queue API, worker, integration write boundary, progress UI and deployment coverage.

1. Share status/language eligibility and query selection. Preview every detection with a reason;
   skip tracked rules and direct their updates to individual Deploy review.
2. Queue immutable per-rule payloads in one transaction with a request idempotency key.
   Authenticate and authorize every user action; restrict queue writes/RPCs to the server.
3. Claim one item with an expiring job lease, use an internal authenticated deployment route,
   and checkpoint results atomically. Explicitly uncertain vendor outcomes require reconciliation,
   not automatic replay. Retry only known-safe transient failures.
4. Use service-authenticated continuations plus a scheduled dispatcher, without persisted user JWTs.
   Preserve cancellation, recover expired work, and compute counters from item state.
5. Fix pack coverage totals and latest successful lifecycle state; refresh progress on reconnect.
6. Verify policy, worker/API, client and SQL state transitions, then run type-check, tests and build.

Rollout order: migration/schema and scheduler, integration-ops, pack-deploy-worker, frontend.
Do not run a live SIEM deployment as part of verification. Existing cancelled jobs stay cancelled.
Existing unfinished jobs without frozen payloads must be requeued through the new wizard.

Implemented: all six steps above. Bound rules are skipped with an individual-review instruction.
Permanent validation failures are not retried; throttles and explicitly safe server failures get at
most three automatic attempts. Transport failures or ambiguous vendor writes require reconciliation.
The ten-minute lease exceeds the hosted worker lifetime; expired undispatched work is reclaimed,
and recorded successful writes are recovered without replay. Cancellation cannot be overwritten.

Deployment prerequisites: `pg_cron`, `pg_net`, Vault secrets `tr_supabase_url` and
`tr_service_role_key`, and the `pack-deploy-dispatcher` minute schedule. The migration installs the
schedule when cron exists; `bun run setup` provisions it for new installations. Job creation refuses
to run without recovery configured. No production migration or live vendor writes were performed
during implementation.

Validation: Vitest covers policy, per-rule snapshots, error parsing, worker authorization,
internal-route authorization, the client service, wizard, and progress panel. SQL regression tests
cover transactional creation, owner checks, duplicate claims/dispatch, cancellation, lease recovery,
retry delay, uncertain outcomes, coverage totals, and a 60-rule job. The SQL suite runs in schema CI.

Hosted rollout (2026-09-18 IST): the queue migration is applied to `xomjbualngsqrsvuvdgh`
(hosted migration identifier `20260917202504_pack_deploy_durable_queue`), the minute dispatcher
is active, and `pack_deploy_ready()` returns true. Deployed integration-ops v49 followed by
pack-deploy-worker v11, including all shared dependencies. The frontend runs only at
`http://localhost:5173/`; it was not published. See `docs/blackhat-demo-runbook.md` for checks,
database-derived 50/0 eligibility counts for both demo packs, and the outstanding authenticated
preview/browser verification. No live SIEM writes or legacy-job replay occurred.

Configuration follow-up: integration-ops v50 and pack-deploy-worker v12 now derive Defender
category per detection instead of accepting a pack-wide category. Sentinel continues to inherit
each detection's MITRE data; Review now explains this rather than showing empty default arrays.
Provider forms use the app Select and the pack wizard has readable light/dark warning text.
54 focused tests, type checks, lint and build passed. Frontend remains localhost-only.


Rehearsal follow-up (2026-09-18): user-created Sentinel job completed partially (41/50 created, nine non-retryable ATT&CK format errors). The updated Sentinel adapter separates parent techniques from subtechniques via 2025-07-01-preview. The local provider form captures checkbox state synchronously, fixing lost enable choices. Preview and write rechecks skip successful previous creates even without a native binding. Deployed integration-ops v52 then pack-deploy-worker v13; readiness remains true. No job was replayed and no Microsoft rules were changed by the assistant. See docs/blackhat-demo-runbook.md for evidence and query-validation limitations.

Manual-deletion follow-up: integration-ops v53 and pack-deploy-worker v14 replace the Sentinel history-only guard with read-only remote existence checks. Complete inventory absence permits recreation of previously created unbound rules, with an individual GET recheck immediately before writing. Existing rules and uncertain outcomes stay blocked; failed inventory reads fail closed. Pack creation no longer falls back to updating a deleted historical vendor ID. All 41 historical Sentinel IDs were confirmed missing after the user's deletion; the expected refreshed preview is 50 eligible / 0 skipped. Historical jobs and detections are preserved, no Microsoft writes were performed, and frontend remains localhost-only. See the newest runbook checkpoint for validation evidence.

Enabled rehearsal follow-up: the next user job was cancelled after 21 attempts. Eight rules were created enabled; five were misreported due to the historical `idx_active_deployment` constraint, and 13 were rejected for missing query tables. Applied `20260917220205_pack_deploy_recreation_history.sql` (hosted version `20260917220706`) to allow distinct remote create identities while preserving original events. Deployed integration-ops v54 and pack-deploy-worker v15 to retain known remote identities even if recording fails. Fresh/upgrade SQL tests, 52 focused Vitest tests and Deno checks passed. The user deleted the eight rules and prohibited backfill: no job/history correction or Microsoft writes were performed. Five existing uncertain items remain excluded from future pack previews. See the runbook for actual timings, table dependencies and preserved cancellation state.

Wizard reconciliation follow-up: integration-ops v55 / pack-deploy-worker v16 support a read-only Reconcile with Sentinel action in Configure and Review. It refreshes eligibility without backfilling historical uncertainty flags. Completed legacy recording failures with lost IDs are checked against the complete inventory by frozen name or query; any match remains blocked. Active/unsupported unknown outcomes and failed scans stay blocked. Queue creation and writes recheck eligibility. All five affected items had no current match in the hosted read-only verification, while the cancelled job stayed unchanged. 70 focused tests, types, lint and build passed. Microsoft KQL validation remains separate.

Defender investigation follow-up: integration-ops v59 adds the client-provided ID required by the current Graph create contract and verifies inventory membership before accepting single/pack deployment success. Accepted but unverified writes retain their vendor identity and error, are not retried automatically, and cannot silently trigger another create. Reviewed native updates use the same inventory guard. The latest user Sentinel job records 50/50 success with disabled config; Defender records 37/50 success, but all 37 IDs only have individual-GET evidence and are absent from inventory. Twelve explicit failures concern missing DeviceId output and one concerns extractjson typing. The September 16 single-rule baseline (456) also has the list/GET discrepancy; February ID 222 passes the new read-only verification. Root cause of portal absence and effectiveness of the stable-ID create correction remain unproven without a live write, which was not performed. 127 tests, TypeScript and Deno checks passed. Queue readiness remains true, worker v16 and localhost-only frontend remain in place. See the runbook for evidence and preservation constraints.

Explicit-action follow-up: integration-ops v60 removes history-driven Create-to-Update conversion; the modal omits old vendor IDs for Create and names the selected provider rather than Splunk. Defender IDs are unique per individual deployment or stable per pack item, and its opt-in dev proxy also uses the verified backend. The user explicitly authorized removal of September 18 IST pack history only: four terminal jobs, 200 items and 171 linked history entries were backed up locally and deleted transactionally. All 32 individual history records and the April job's 60 items were preserved. 92 tests, TypeScript, Deno and build passed; scoped lint has no errors. No Microsoft rules were changed or deployments started. The runbook contains the cleanup scope, recovery-file checksum and validation limits.
