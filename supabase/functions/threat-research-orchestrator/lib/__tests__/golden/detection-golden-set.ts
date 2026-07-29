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
  readiness?: 'draft' | 'needs_review' | 'production_candidate';
  /** For revision cases: which version should end up active. */
  activeVersion?: number;
  /** Detection type the query really is, when the point of the case is that
   *  metadata should change rather than the query being rejected. */
  detectionType?: 'Detection' | 'Hunting';
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
    expected: { schemaFlagged: false },
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
    expected: { schemaFlagged: true, verdict: 'pass_with_concerns' },
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
    id: 'overconstrained-revision-loses-recall',
    kind: 'judged',
    intent: 'A revision that narrows a primitive to one chain must not silently replace it.',
    rationale:
      'Adding explorer.exe parent AND PowerShell child AND a network event raises ' +
      'fidelity and detects only ClickFix, missing generic remote MSHTA. Both versions ' +
      'must survive so the analyst chooses. NEEDS A STAFF LABEL: whether this ' +
      'particular narrowing was an improvement is exactly the judgement being tested.',
    product: DEFENDER,
    language: 'KQL',
    query: 'DeviceProcessEvents | where FileName =~ "mshta.exe" and InitiatingProcessFileName =~ "explorer.exe" | where ProcessCommandLine has "http"',
    observableChain: ['mshta.exe retrieving a remote payload'],
    telemetry: ['DeviceProcessEvents'],
    mitreIds: ['T1218.005'],
    expected: { activeVersion: 2, readiness: 'needs_review' },
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
      'decorative and every session pays to rewrite rules the user already runs.',
    product: DEFENDER,
    language: 'KQL',
    query: 'DeviceProcessEvents | where FileName =~ "mshta.exe" | where ProcessCommandLine has "http"',
    observableChain: ['mshta.exe retrieving a remote payload'],
    telemetry: ['DeviceProcessEvents'],
    mitreIds: ['T1218.005'],
    expected: { suppressGeneration: true },
  },
  {
    id: 'qa-transport-error-preserves-the-query',
    kind: 'deterministic',
    intent: 'A QA pipeline failure is not a quality verdict.',
    rationale:
      'Session bc5804b3 generated ten queries, hit six QA errors, and delivered one. ' +
      'An unreachable critic says nothing about the artefact; the query is preserved ' +
      'and marked for review.',
    product: DEFENDER,
    language: 'KQL',
    query: 'DeviceProcessEvents | where FileName =~ "adfind.exe"',
    observableChain: ['AdFind execution'],
    telemetry: ['DeviceProcessEvents'],
    mitreIds: ['T1018'],
    expected: { readiness: 'needs_review' },
  },
];

export function deterministicCases(): GoldenCase[] {
  return GOLDEN_CASES.filter(c => c.kind === 'deterministic');
}

export function judgedCases(): GoldenCase[] {
  return GOLDEN_CASES.filter(c => c.kind === 'judged');
}
