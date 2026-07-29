// supabase/functions/threat-research-orchestrator/lib/budget-policy.ts
//
// How much a session is allowed to spend, in tokens, and how that is divided
// between phases.
//
// Kept as pure functions with no Deno or esm.sh imports so the policy is unit
// testable. The SQL in 20260729160000 only enforces; the judgement lives here.
//
// WHY TOKENS, NOT CALLS
// The previous budget counted model calls. Measured across production:
//
//   session     model calls   tokens
//   bc5804b3            169   1,175,033
//   048fdd12             28     165,745
//
// Six times the calls, seven times the tokens. One 16K-token call costs about
// fifty times a 300-token one, so a call cap cannot bound spend.
//
// WHY PHASES GET FLOORS
// 199 recorded agent failures read "model-call budget exhausted". A single
// session-wide counter drawn down by parallel leaves starves whichever leaves
// run last -- and those are detection and QA, the only phases that produce
// something the user can act on. Sessions a6cfb090 and ce6be6cf each spent
// their cap exactly (257/257, 203/203) and then failed everything left.

/** Phases that draw on the token budget. preflight and finalise are excluded:
 *  measured at 4-6s and one small classification call, they are noise. */
export type BudgetedPhase =
  | 'research'
  | 'attack_research'
  | 'opportunity_planning'
  | 'detection'
  | 'qa';

export interface PhaseBudgets {
  /** Session-wide ceiling. Always >= the sum of the floors. */
  tokenCap: number;
  perPhase: Record<BudgetedPhase, number>;
  /** True when the work requested costs more than the runaway ceiling allows,
   *  so the floors were scaled down to fit. The session can still run, but it
   *  is capacity-limited and the caller must SAY SO — a silently under-funded
   *  session that dies two thirds of the way through is exactly the "breaks in
   *  between" failure this work exists to remove. */
  capped: boolean;
}

/** Per-unit-of-work token allowances.
 *
 *  Fitted to measured whole-session totals, NOT to the max_tokens ceilings —
 *  sizing from the ceilings produced budgets 2-3x larger than any real session
 *  and would have flagged routine work as capacity-limited:
 *
 *    session     behaviours   opportunities   total tokens
 *    30afda88             8               3        274,021
 *    6bb5124f             8               5        272,992
 *    b6a7c949             8               5        303,352
 *    54e5d586             9               7        321,693
 *    bebf42e6             8               8        314,534
 *    bc5804b3             8              11      1,175,033   <- 4.2h, 6 qa_errors
 *    ce6be6cf            11              41      1,694,734   <- old multi-round QA
 *
 *  A healthy session sits at 270-330K. The values below give roughly 2x that
 *  for retry headroom, which still bounds the two pathological runs: the
 *  budget bc5804b3 would have received is well under the 1.17M it actually
 *  spent looping, so the runaway would have been stopped rather than billed. */
const PER_UNIT = {
  /** One research job: tool turns plus the large final synthesis. */
  research: 120_000,
  /** Per behaviour. Measured at 64-69s per job, modest output. */
  attack_research: 20_000,
  /** One planning job over all behaviours. */
  opportunity_planning: 60_000,
  /** Per opportunity: generation plus up to one revision. */
  detection: 40_000,
  /** Per opportunity: critique, plus room for one re-critique. */
  qa: 15_000,
} as const;

/** Nothing plausible costs this much; a session hitting it is a runaway.
 *  The largest real session to date, bc5804b3, spent 1.17M tokens across a
 *  9.5-hour resume loop -- which is exactly the shape this is here to stop. */
export const SESSION_TOKEN_CEILING = 2_000_000;

/** Behaviour and opportunity counts the pipeline will actually plan for.
 *  A 30-behaviour fan-out at concurrency 2 is ~15 waves; budgeting for it
 *  honestly is better than discovering it as an overrun. */
export const MAX_BUDGETED_BEHAVIOURS = 30;
export const MAX_BUDGETED_OPPORTUNITIES = 40;

/** Budgets known after research completes, when the behaviour count is known
 *  but opportunities are not. Detection and QA are floored using an ESTIMATE
 *  of opportunities so their reservation exists before the planner runs --
 *  the whole point is that research and attack cannot spend it first.
 *
 *  The planner later calls sizeAfterPlanning with the real count, and floors
 *  may only rise (enforced in tr_set_phase_budgets). */
export function sizeAfterResearch(behaviourCount: number): PhaseBudgets {
  const behaviours = clamp(behaviourCount, 1, MAX_BUDGETED_BEHAVIOURS);
  // Before planning, assume the planner merges roughly 2:1. Measured:
  // 8 behaviours -> 3, 5, 6 opportunities; 9 -> 7. Rounding up is the safe
  // direction, since an under-reserved detection phase is the failure being
  // fixed.
  const estimatedOpportunities = clamp(Math.ceil(behaviours / 1.5), 1, MAX_BUDGETED_OPPORTUNITIES);
  return assemble(behaviours, estimatedOpportunities);
}

/** Budgets once the planner has produced canonical opportunities. */
export function sizeAfterPlanning(behaviourCount: number, opportunityCount: number): PhaseBudgets {
  return assemble(
    clamp(behaviourCount, 1, MAX_BUDGETED_BEHAVIOURS),
    clamp(opportunityCount, 1, MAX_BUDGETED_OPPORTUNITIES),
  );
}

function assemble(behaviours: number, opportunities: number): PhaseBudgets {
  const perPhase: Record<BudgetedPhase, number> = {
    research: PER_UNIT.research,
    attack_research: PER_UNIT.attack_research * behaviours,
    opportunity_planning: PER_UNIT.opportunity_planning,
    detection: PER_UNIT.detection * opportunities,
    qa: PER_UNIT.qa * opportunities,
  };

  const floorSum = Object.values(perPhase).reduce((a, b) => a + b, 0);
  // 15% headroom above the floors: a phase may exceed its own floor while the
  // session still has room, which keeps the floors a guarantee for the phases
  // that need them rather than a straitjacket on the ones that don't.
  const desiredCap = Math.ceil(floorSum * 1.15);

  if (desiredCap <= SESSION_TOKEN_CEILING) {
    return { tokenCap: desiredCap, perPhase, capped: false };
  }

  // The requested work costs more than the runaway ceiling permits. A 30
  // behaviour x 40 opportunity session wants ~3.5M tokens against a 2M
  // ceiling.
  //
  // Raising the ceiling to fit would defeat its purpose; leaving the floors
  // above it would make them meaningless exactly at the fan-outs where
  // starvation actually happens. So scale every floor by the same factor: the
  // session stays inside its bound, and detection and qa keep their SHARE of
  // it rather than being the phases that run out first.
  //
  // `capped: true` is not cosmetic. The caller has to surface it, because a
  // session quietly funded for two thirds of its work is the failure this is
  // meant to prevent, not a subtler version of it.
  const scale = SESSION_TOKEN_CEILING / desiredCap;
  const scaled = Object.fromEntries(
    Object.entries(perPhase).map(([phase, tokens]) => [phase, Math.floor(tokens * scale)]),
  ) as Record<BudgetedPhase, number>;

  return { tokenCap: SESSION_TOKEN_CEILING, perPhase: scaled, capped: true };
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

/** What a single call should reserve before it runs.
 *
 *  Actual usage is unknown until the response returns, so the reservation is
 *  the worst case: the full max_tokens output plus an estimate of the input.
 *  Over-reserving costs a leaf that could have squeaked through; under-
 *  reserving costs real money. Erring high is the cheaper mistake.
 *
 *  Input is estimated at 4 characters per token, the usual English
 *  approximation. It does not have to be exact -- it is settled against real
 *  usage as soon as the call returns. */
export function estimateCallTokens(promptChars: number, maxTokens: number): number {
  const estimatedInput = Math.ceil(promptChars / 4);
  return estimatedInput + maxTokens;
}
