// supabase/functions/threat-research-orchestrator/lib/__tests__/golden/detection-golden-set.ts
//
// A labelled set of detection-engineering situations, used to measure the
// pipeline's judgement instead of asserting it.
//
// WHY THIS EXISTS
//
// QA issued a clean `pass` once in 31 production sessions. The tempting reading
// is "the rubric is too strict", and the tempting fix is to loosen it until more
// things pass. That would be measuring the wrong thing: QA has caught real
// defects — a non-existent Defender column, an ago(30d) hunting artefact, a
// severity mismatch — so `pass_with_concerns` may simply be the honest verdict
// and the weakness may be in generation.
//
// A verdict-distribution target cannot tell those apart, and optimising for one
// rewards prompt manipulation. A labelled set can: it says what the RIGHT answer
// is for each case, so a rubric change is judged on agreement rather than on
// producing more passes.
//
// TWO KINDS OF CASE
//
// `deterministic` — the correct answer follows from the artefact, not from
//   taste. A query referencing a column that does not exist is wrong; a Sentinel
//   table in a Sentinel session is not. These need no human labelling and are
//   asserted today.
//
// `judged` — genuinely a matter of detection-engineering judgement: is this
//   broad query usefully broad or carelessly broad? Did a revision improve
//   precision without gutting recall? These carry `expected` as a PROPOSAL
//   pending staff labels, and are reported rather than enforced. Marked so a
//   green run can never be mistaken for validated judgement.

export type CaseKind = 'deterministic' | 'judged';

/** What the pipeline should conclude, expressed in the terms the pipeline
 *  actually uses (readiness.ts / coverage.ts), not in prose. */
export interface ExpectedOutcome {
  /** QA verdict, where one is objectively determined. */
  verdict?: 'pass' | 'pass_with_concerns' | 'fail';
  /** Whether the deterministic schema check should flag this query. */
  schemaFlagged?: boolean;
  /** Whether an existing library rule should suppress generation. */
  suppressGeneration?: boolean;
  /** Readiness the leaf should land on. */
  readiness?: 'draft' | 'production_candidate';
  /** Deterministic validator findings to feed the case, keyed by check name.
   *  Present when the point of the case is what readiness does with them. */
  validatorFindings?: Record<string, string>;
  /** For revision cases: which version should end up active. */
  activeVersion?: number;
  /** Detection type the query really is, when the point of the case is that
   *  metadata should change rather than the query being rejected. */
  detectionType?: 'Detection' | 'Hunting';
  /** Columns the deterministic schema check should report as not existing on
   *  the query's table. `[]` asserts a clean query is left alone — the half of
   *  this contract that a false-positive-prone extractor would break. */
  unknownColumns?: string[];
}

export interface GoldenCase {
  id: string;
  kind: CaseKind;
  /** What this case is actually testing, in one line. */
  intent: string;
  /** Why the expected answer is what it is. Kept with the case so a future
   *  reader does not have to reconstruct the reasoning from a diff. */
  rationale: string;
  product: string | null;
  language: string;
  query: string;
  /** The opportunity this query is supposed to serve. */
  observableChain: string[];
  telemetry: string[];
  mitreIds: string[];
  expected: ExpectedOutcome;
}

const DEFENDER = 'Microsoft Defender XDR';
const SENTINEL = 'Microsoft Sentinel';

/** A slice of the real Defender XDR schema — enough to decide the column cases
 *  without a database.
 *
 *  This exists because the previous version of the schema cases asserted only
 *  `supportsDefenderSchemaValidation(product)`, which compares two strings. The
 *  query, chain and telemetry on those cases were decorative: a case could pass
 *  while the column extractor was completely broken. With a fixture, the cases
 *  run the real parser and check its answer. */
export const DEFENDER_COLUMN_FIXTURE: Readonly<Record<string, readonly string[]>> = {
  deviceprocessevents: [
    'Timestamp', 'DeviceId', 'DeviceName', 'ActionType', 'FileName', 'FolderPath',
    'SHA256', 'ProcessId', 'ProcessCommandLine', 'ProcessVersionInfoOriginalFileName',
    'ProcessVersionInfoCompanyName', 'AccountName', 'AccountDomain',
    'InitiatingProcessFileName', 'InitiatingProcessCommandLine',
    'InitiatingProcessParentFileName', 'ReportId',
  ],
};

/** Columns in `query` that do not exist on `table`, per the fixture above.
 *  Mirrors what `validate_defender_xdr_columns` does server-side, so a case can
 *  assert the deterministic verdict offline. */
export function unknownColumnsAgainstFixture(table: string, refs: readonly string[]): string[] {
  const known = new Set(
    (DEFENDER_COLUMN_FIXTURE[table.toLowerCase()] ?? []).map(c => c.toLowerCase()),
  );
  return refs.filter(r => !known.has(r.toLowerCase()));
}

export const GOLDEN_CASES: readonly GoldenCase[] = [
  {
    id: 'sentinel-tables-in-sentinel-session',
    kind: 'deterministic',
    intent: 'A correct Sentinel query must not be flagged for using Sentinel tables.',
    rationale:
      'Both Microsoft SIEMs write KQL, and the pipeline validated every KQL query ' +
      'against the Defender XDR schema. SecurityEvent/SigninLogs/AuditLogs came back ' +
      'as unknown tables, the note reached QA, and QA could "repair" a working query ' +
      'into the wrong product. There is no Sentinel schema here, so the correct ' +
      'behaviour is to skip the check, not to guess.',
    product: SENTINEL,
    language: 'KQL',
    query: 'SecurityEvent | where EventID == 4688 | where NewProcessName endswith "mshta.exe"',
    observableChain: ['mshta.exe process creation recorded by the Windows security log'],
    telemetry: ['SecurityEvent'],
    mitreIds: ['T1218.005'],
    // EventID and NewProcessName are real Sentinel columns. The Defender schema
    // has never heard of either, so these are exactly what the pipeline used to
    // report as invalid on a working query. Asserting them makes the gate
    // load-bearing: flip it off and this case says what breaks.
    expected: { schemaFlagged: false, unknownColumns: ['EventID', 'NewProcessName'] },
  },
  {
    id: 'defender-tables-in-defender-session',
    kind: 'deterministic',
    intent: 'A Defender query in a Defender session is schema-checkable.',
    rationale:
      'The counterpart to the case above: skipping validation everywhere would be ' +
      'as dishonest as running it everywhere. Where a schema exists, use it.',
    product: DEFENDER,
    language: 'KQL',
    query: 'DeviceProcessEvents | where FileName =~ "mshta.exe" | where ProcessCommandLine has "http"',
    observableChain: ['mshta.exe launched with a remote URL'],
    telemetry: ['DeviceProcessEvents'],
    mitreIds: ['T1218.005'],
    // Every column here is real, so the check must stay silent. This is the
    // half that catches an over-eager extractor: a validator that flags
    // legitimate columns trains users to ignore it.
    expected: { schemaFlagged: true, verdict: 'pass_with_concerns', unknownColumns: [] },
  },
  {
    id: 'hallucinated-column-is-a-deterministic-fail',
    kind: 'deterministic',
    intent: 'A query referencing a column that does not exist is wrong, provably, with no model.',
    rationale:
      '`Computer` is the Sentinel/Log Analytics name; the Defender equivalent is ' +
      'DeviceName. This is the single most common KQL hallucination, and it is the ' +
      'one QA finding that needs no judgement — the column either exists or it does ' +
      'not. Grounding a fail here is legitimate; inferring one from a model\'s ' +
      'opinion about a schema it cannot query is not.',
    product: DEFENDER,
    language: 'KQL',
    query: 'DeviceProcessEvents | where Computer == "host1" | where FileName =~ "mshta.exe"',
    observableChain: ['mshta.exe process creation'],
    telemetry: ['DeviceProcessEvents'],
    mitreIds: ['T1218.005'],
    expected: { schemaFlagged: true, unknownColumns: ['Computer'], verdict: 'fail' },
  },
  {
    id: 'derived-column-is-not-a-hallucination',
    kind: 'deterministic',
    intent: 'A column the query itself introduces must not be reported as non-existent.',
    rationale:
      'extend/project/let bindings are local names, not schema columns. Flagging them ' +
      'was this validator\'s most common false positive, and a false schema finding is ' +
      'what lets QA "repair" a working query into a broken one.',
    product: DEFENDER,
    language: 'KQL',
    query: 'DeviceProcessEvents | extend CmdLower = tolower(ProcessCommandLine) | where CmdLower has "mshta.exe"',
    observableChain: ['mshta.exe process creation'],
    telemetry: ['DeviceProcessEvents'],
    mitreIds: ['T1218.005'],
    expected: { schemaFlagged: true, unknownColumns: [] },
  },
  {
    id: 'thirty-day-lookback-is-a-hunt',
    kind: 'deterministic',
    intent: 'A 30-day lookback is a classification fact, not a defect.',
    rationale:
      'ago(30d) cannot run as a scheduled alert, but the query is not wrong — it is ' +
      'a retro-hunt. Failing it discards a correct artefact; reclassifying it keeps ' +
      'the work and fixes the metadata. QA flagged exactly this in session 30afda88.',
    product: DEFENDER,
    language: 'KQL',
    query: 'DeviceProcessEvents | where Timestamp > ago(30d) | where FileName =~ "adfind.exe"',
    observableChain: ['historical AdFind execution across the estate'],
    telemetry: ['DeviceProcessEvents'],
    mitreIds: ['T1018'],
    expected: { detectionType: 'Hunting', verdict: 'pass_with_concerns', readiness: 'production_candidate' },
  },
  {
    id: 'broad-lolbin-query-is-usefully-broad',
    kind: 'judged',
    intent: 'A broad dual-use LOLBin query should survive as a medium-confidence detection.',
    rationale:
      'Generic remote MSHTA abuse is a legitimate detection primitive. Demanding zero ' +
      'false positives from it produces an over-constrained rule that only catches one ' +
      'chain. Retain with tuning guidance rather than failing. NEEDS A STAFF LABEL: ' +
      'where usefully-broad ends and carelessly-broad begins is a judgement call.',
    product: DEFENDER,
    language: 'KQL',
    query: 'DeviceProcessEvents | where FileName =~ "mshta.exe" | where ProcessCommandLine has_any ("http://", "https://")',
    observableChain: ['mshta.exe retrieving a remote payload'],
    telemetry: ['DeviceProcessEvents'],
    mitreIds: ['T1218.005'],
    expected: { verdict: 'pass_with_concerns', readiness: 'production_candidate' },
  },
  {
    id: 'overconstrained-narrowing-loses-recall',
    kind: 'judged',
    intent: 'Narrowing a primitive to one chain trades recall for fidelity.',
    rationale:
      'Adding explorer.exe parent AND PowerShell child AND a network event raises ' +
      'fidelity and detects only ClickFix, missing generic remote MSHTA. This used ' +
      'to be a REVISION case — the QA critic prompted exactly this narrowing and ' +
      'both versions had to survive so the analyst could choose. There is no critic ' +
      'now, so the only way this query appears is if the engineer writes it, and ' +
      'the judgement being tested is whether that was the right call. NEEDS A ' +
      'STAFF LABEL.',
    product: DEFENDER,
    language: 'KQL',
    query: 'DeviceProcessEvents | where FileName =~ "mshta.exe" and InitiatingProcessFileName =~ "explorer.exe" | where ProcessCommandLine has "http"',
    observableChain: ['mshta.exe retrieving a remote payload'],
    telemetry: ['DeviceProcessEvents'],
    mitreIds: ['T1218.005'],
    expected: { readiness: 'production_candidate' },
  },
  {
    id: 'registry-surface-is-not-covered-by-a-process-rule',
    kind: 'deterministic',
    intent: 'A process-events rule must not suppress the RunMRU opportunity.',
    rationale:
      'Both are T1218.005. They watch different telemetry, so one is not coverage for ' +
      'the other. MITRE overlap alone would suppress this and the gap would never be ' +
      'generated — invisible to the user, which is the worst kind of loss.',
    product: DEFENDER,
    language: 'KQL',
    query: 'DeviceProcessEvents | where FileName =~ "mshta.exe" | where ProcessCommandLine has "http"',
    observableChain: ['RunMRU registry value recording the pasted command'],
    telemetry: ['DeviceRegistryEvents'],
    mitreIds: ['T1218.005'],
    expected: { suppressGeneration: false },
  },
  {
    id: 'same-surface-is-genuine-coverage',
    kind: 'deterministic',
    intent: 'A deployed, runnable rule on the same surface should suppress generation.',
    rationale:
      'The counterpart to the case above. If nothing ever suppresses, the library is ' +
      'decorative and every session pays to rewrite rules the user already runs. ' +
      'The chain names http because the rule PINS http: coverage now requires that ' +
      'neither side demand something the other never mentions, so an opportunity ' +
      'silent about the protocol is a different (broader) opportunity — see the ' +
      'narrower-rule case below.',
    product: DEFENDER,
    language: 'KQL',
    query: 'DeviceProcessEvents | where FileName =~ "mshta.exe" | where ProcessCommandLine has "http"',
    observableChain: ['mshta.exe retrieving a remote payload over http'],
    telemetry: ['DeviceProcessEvents'],
    mitreIds: ['T1218.005'],
    expected: { suppressGeneration: true },
  },
  {
    id: 'renamed-binary-is-not-covered-by-a-filename-rule',
    kind: 'deterministic',
    intent: 'A FileName predicate cannot cover an opportunity about a renamed binary.',
    rationale:
      'Forward containment. Same technique, same table, and the rule is deployed and ' +
      'runnable — every gate except this one passes. But the whole point of the ' +
      'opportunity is that FileName is attacker-controlled, so a rule keyed on ' +
      'FileName is blind to it by construction. The previous unit test asserted this ' +
      'case as COVERED, on the grounds that both read DeviceProcessEvents.',
    product: DEFENDER,
    language: 'KQL',
    query: 'DeviceProcessEvents | where FileName =~ "mshta.exe" | where ProcessCommandLine has "http"',
    observableChain: ['ProcessVersionInfoOriginalFileName is mshta.exe while FileName differs'],
    telemetry: ['DeviceProcessEvents'],
    mitreIds: ['T1218.005'],
    expected: { suppressGeneration: false },
  },
  {
    id: 'narrower-rule-does-not-cover-a-broader-opportunity',
    kind: 'deterministic',
    intent: 'A rule requiring a predicate the opportunity never asks for is not coverage.',
    rationale:
      'Backward containment, and the direction a one-sided overlap test cannot express. ' +
      'Both sides are mshta.exe on DeviceProcessEvents, so table-level or ' +
      'field-level matching grants this. The rule demands `http`, so it cannot serve ' +
      'an opportunity about inline vbscript/javascript handlers — reusing it would ' +
      'report coverage for a surface that is genuinely unmonitored.',
    product: DEFENDER,
    language: 'KQL',
    query: 'DeviceProcessEvents | where FileName =~ "mshta.exe" | where ProcessCommandLine has "http"',
    observableChain: ['mshta.exe with an inline vbscript or javascript protocol handler'],
    telemetry: ['DeviceProcessEvents'],
    mitreIds: ['T1218.005'],
    expected: { suppressGeneration: false },
  },
  {
    id: 'telemetry-the-estate-may-lack-is-still-the-users-call',
    kind: 'deterministic',
    intent: 'A telemetry gap is information for the user, not a gate.',
    rationale:
      'This case used to expect needs_telemetry. The check behind it compared '
      + 'the planner\'s free-text telemetry prose against environment_profiles '
      + 'labels by word overlap, so a detection\'s fate turned on whether its '
      + 'phrasing happened to contain "sysmon". In session 7382a9c2 it blocked '
      + 'three of seven detections, two of which described their own '
      + 'requirement as optional ("Optional code-signing metadata", "...where '
      + 'available") and a third of which named OriginalFileName — carried by '
      + 'Sysmon EID 1, which the profile did list. A heuristic that wrong '
      + 'cannot be allowed to decide what ships, so it decides nothing.',
    product: DEFENDER,
    language: 'KQL',
    query: 'DeviceNetworkEvents | where RemoteUrl has "attacker.example" | where InitiatingProcessFileName =~ "mshta.exe"',
    observableChain: ['mshta.exe making an outbound connection to attacker.example'],
    telemetry: ['Zeek conn.log'],
    mitreIds: ['T1218.005'],
    expected: { readiness: 'production_candidate' },
  },
  {
    id: 'a-generated-query-reaches-the-user',
    kind: 'deterministic',
    intent: 'Nothing between the engineer and the user may withhold a query.',
    rationale:
      'Session bc5804b3 generated ten queries, hit six QA errors, and delivered '
      + 'one — an unreachable critic silently discarding work that was already '
      + 'written and paid for. With no critic at all, that failure mode cannot '
      + 'recur: a query exists, so it is a candidate, and the user decides.',
    product: DEFENDER,
    language: 'KQL',
    query: 'DeviceProcessEvents | where FileName =~ "adfind.exe"',
    observableChain: ['AdFind execution'],
    telemetry: ['DeviceProcessEvents'],
    mitreIds: ['T1018'],
    expected: { readiness: 'production_candidate' },
  },
];

export function deterministicCases(): GoldenCase[] {
  return GOLDEN_CASES.filter(c => c.kind === 'deterministic');
}

export function judgedCases(): GoldenCase[] {
  return GOLDEN_CASES.filter(c => c.kind === 'judged');
}
