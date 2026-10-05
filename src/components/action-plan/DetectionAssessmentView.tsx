import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProfileIntelligence } from '@/hooks/useProfileIntelligence';
import { useTechniqueBuckets } from '@/hooks/useTechniqueBuckets';
import type { EnvironmentProfile } from '@/types/environment';
import type { MatchResult } from '@/services/logSourceDiscovery';
import {
  buildDetectionAssessment,
  summarizeAssessmentActions,
  type AssessmentAction,
  type AssessmentActionKind,
} from '@/lib/actionPlan/assessment';
import { BUCKET_LABELS, BUCKET_ORDER, type TechBucket } from '@/lib/actionPlan/technologyBuckets';
import { Icon, type IconName } from '@/components/Icon';
import { ScopeToggle } from '@/components/common/ScopeToggle';
import { MiniMitreMatrix } from '@/components/settings/environment-wizard/MiniMitreMatrix';
import { ROUTES, routeHelpers } from '@/router/routes';

interface Props {
  intel: ProfileIntelligence;
  profile: EnvironmentProfile;
  totalLibrary: number;
  compatibleLibrary: number;
  matchResult: MatchResult | null;
  includeDevelopment: boolean;
  onScopeChange: (include: boolean) => void;
  initialActionIds?: string[] | null;
  onActionIdsChange?: (ids: string[] | null) => void;
}
const surface = { backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' };
const heading = 'text-[10px] font-brand font-bold text-on-surface tracking-[0.2em] uppercase';
const kinds: Record<AssessmentActionKind, { label: string; color: string; badge: string; icon: IconName }> = {
  prerequisite: {
    label: 'Confirm first',
    color: 'text-ext-rose',
    badge: 'bg-ext-rose/10 text-ext-rose',
    icon: 'search',
  },
  validate: {
    label: 'Improve existing',
    color: 'text-ext-amber',
    badge: 'bg-ext-amber/10 text-ext-amber',
    icon: 'shield',
  },
  reuse: { label: 'Reuse content', color: 'text-ext-teal', badge: 'bg-ext-teal/10 text-ext-teal', icon: 'copy' },
  research: {
    label: 'Investigate',
    color: 'text-on-surface-variant',
    badge: 'bg-surface-container text-on-surface-variant',
    icon: 'search',
  },
};
const techIcons: Record<TechBucket, IconName> = {
  endpoint: 'monitor',
  cloud: 'cloud',
  identity: 'user',
  saas: 'grid',
  network: 'globe',
};
const plural = (n: number, singular: string) => `${n} ${singular}${n === 1 ? '' : 's'}`;
function destination(action: AssessmentAction) {
  if (action.ruleId) return routeHelpers.detectionDetail(action.ruleId);
  return action.destination === 'environment'
    ? ROUTES.ENVIRONMENT_PROFILE
    : action.destination === 'sources'
      ? ROUTES.ONBOARDING
      : ROUTES.SIEM_HEALTH;
}
const nextStepLabel = (action: AssessmentAction) =>
  action.kind === 'reuse'
    ? 'Review candidate'
    : action.ruleId
      ? 'Review existing rule'
      : action.destination === 'environment'
        ? 'Check profile'
        : action.destination === 'siem'
          ? 'Inspect inventory'
          : 'Explore sources';

export function DetectionAssessmentView({
  intel,
  profile,
  totalLibrary,
  compatibleLibrary,
  matchResult,
  includeDevelopment,
  onScopeChange,
  initialActionIds = null,
  onActionIdsChange,
}: Props) {
  const assessment = useMemo(
    () => buildDetectionAssessment(intel, profile, matchResult),
    [intel, profile, matchResult],
  );
  const { buckets, loading: bucketsLoading, error: bucketsError } = useTechniqueBuckets();
  const [actionIds, setActionIds] = useState<string[] | null>(initialActionIds);
  const selectedIds = new Set(actionIds ?? assessment.nextActionIds);
  const planned = assessment.actions.filter((a) => selectedIds.has(a.id));
  const outcome = summarizeAssessmentActions(planned);
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<{ type: 'technology' | 'group'; id: string; label: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(10);
  const workRef = useRef<HTMLElement>(null);
  const choose = (ids: string[] | null) => {
    setActionIds(ids);
    onActionIdsChange?.(ids);
  };
  const actionInScope = (action: AssessmentAction) =>
    !filter ||
    (filter.type === 'group'
      ? action.groups.includes(filter.id)
      : action.techniques.some((t) => buckets.get(t.id)?.has(filter.id as TechBucket)));
  const visible = (showAll ? assessment.actions : planned)
    .filter(actionInScope)
    .filter((a) =>
      `${a.title} ${a.ruleName ?? ''} ${a.groups.join(' ')} ${a.techniques.map((t) => t.id).join(' ')}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  const goToWork = () => workRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const openScope = (type: 'technology' | 'group', id: string, label: string) => {
    setFilter({ type, id, label });
    setShowAll(false);
    setSearch('');
    goToWork();
  };
  const tags = [
    profile.sectors?.slice(0, 2).join(', '),
    profile.user_country,
    profile.siem_platforms.join(', '),
    `${profile.log_sources.length} log sources`,
  ].filter(Boolean);
  const groups = intel.threatGroups
    .map((group) => ({ group, actions: planned.filter((a) => a.groups.includes(group.name)) }))
    .sort((a, b) => b.actions.length - a.actions.length || a.group.name.localeCompare(b.group.name));

  function breakdownRow(id: string, label: string, actions: AssessmentAction[], icon: IconName, onClick: () => void) {
    const summary = summarizeAssessmentActions(actions);
    return (
      <button
        key={id}
        aria-label={`${label}: ${plural(actions.length, 'action')} in this batch`}
        onClick={onClick}
        disabled={!actions.length}
        className="group w-full rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface-container-highest/30 disabled:opacity-50"
      >
        <div className="flex items-center gap-2">
          <Icon name={icon} className="h-3.5 w-3.5 shrink-0 text-on-surface-variant" />
          <span className="flex-1 text-[12px] font-medium text-on-surface">{label}</span>
          <span className="text-[10px] font-mono font-bold text-ext-teal">
            {actions.length ? plural(actions.length, 'action') : 'No action in this batch'}
          </span>
          <Icon name="arrow-right" className="h-3 w-3 text-outline opacity-0 group-hover:opacity-100" />
        </div>
        {actions.length > 0 && (
          <>
            <div className="ml-5 mt-1.5 flex flex-wrap gap-2">
              {summary.reuse > 0 && (
                <span className="rounded-full bg-ext-teal/10 px-2 py-0.5 text-[9px] text-ext-teal">
                  Reuse {summary.reuse}
                </span>
              )}
              {summary.validate > 0 && (
                <span className="rounded-full bg-ext-amber/10 px-2 py-0.5 text-[9px] text-ext-amber">
                  Validate {summary.validate}
                </span>
              )}
              {summary.prerequisites + summary.research > 0 && (
                <span className="rounded-full bg-ext-rose/10 px-2 py-0.5 text-[9px] text-ext-rose">
                  Investigate {summary.prerequisites + summary.research}
                </span>
              )}
            </div>
            <p className="ml-5 mt-2 truncate text-[10px] text-on-surface-variant">{actions[0].title}</p>
          </>
        )}
      </button>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background scrollbar-page animate-page-enter">
      <div className="mx-auto max-w-[1400px] space-y-6 px-6 py-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-xs font-brand font-bold uppercase tracking-[0.2em] text-on-surface">
            Detection Action Plan
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <ScopeToggle
              includeMyLab={includeDevelopment}
              onChange={(include) => {
                choose(null);
                setFilter(null);
                onScopeChange(include);
              }}
            />
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag, i) => (
                <span key={i} className="rounded bg-surface-container px-2 py-0.5 text-[10px] text-on-surface-variant">
                  {tag}
                </span>
              ))}
            </div>
            <Link
              to={ROUTES.ENVIRONMENT_PROFILE}
              className="text-[10px] font-bold uppercase text-on-surface-variant hover:text-primary"
            >
              Edit
            </Link>
          </div>
        </header>

        <div className="rounded-xl bg-surface-container p-4 text-sm text-on-surface-variant">
          <p className="font-medium text-on-surface">
            {assessment.blocked
              ? 'Confirm the assessment baseline before adding detections.'
              : planned.length
                ? 'Start with a focused review: strengthen existing detections, then reuse suitable content.'
                : 'No immediate rule additions are proposed from the available evidence.'}
          </p>
          <p className="mt-1 text-xs">
            {assessment.blocked
              ? 'Missing production evidence or environment information could make an apparent gap misleading.'
              : assessment.unmapped.length
                ? `${assessment.unmapped.length} of ${assessment.observed.length} enabled rules have no ATT&CK mappings. Review those rules alongside the candidates below; check for overlap before adding a detection.`
                : 'Each action below states what to check, why it matters here, and what evidence is needed to finish.'}
          </p>
          <details className="mt-2 text-[11px]">
            <summary className="cursor-pointer text-primary">Assessment scope and limitations</summary>
            <p className="mt-2">
              This assessment uses {assessment.observed.length} linked production rules observed enabled,
              profile-matched threat techniques, and available library metadata. Fetch completeness, live event
              availability and successful behavior tests are not established here. Disabled or unlinked rules are not
              part of this baseline. An absent ATT&CK mapping is not proof that a behavior is undetected.
            </p>
            <Link to={ROUTES.SIEM_HEALTH} className="mt-2 inline-block font-semibold text-primary">
              Check the production inventory →
            </Link>
          </details>
        </div>

        <section
          className="relative overflow-hidden rounded-2xl p-6 lg:p-8"
          aria-label="Assessment summary"
          style={{
            ...surface,
            backgroundImage:
              'radial-gradient(ellipse at 0% 50%, rgb(var(--md-ext-color-teal) / 0.06), transparent 60%)',
          }}
        >
          <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-4">
            <div
              className="flex min-h-[148px] flex-col justify-between rounded-xl p-4"
              style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container) / 0.5)' }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-outline">Production baseline</p>
              <p className="mt-2 font-brand text-3xl font-bold tabular-nums text-on-surface-variant">
                {assessment.observed.length}
              </p>
              <p className="mt-1 text-[10px] text-outline">
                Linked rules observed enabled
                <br />
                Starting evidence, not a protection score
              </p>
            </div>
            <div
              className="flex min-h-[148px] flex-col justify-between rounded-xl p-4"
              style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container) / 0.5)' }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-ext-teal">Reuse existing content</p>
              <div className="mt-2 flex items-center gap-3">
                <div className="relative h-14 w-14 shrink-0">
                  <svg viewBox="0 0 120 120" aria-hidden="true">
                    <circle
                      cx="60"
                      cy="60"
                      r="52"
                      fill="none"
                      stroke="rgb(var(--md-sys-color-surface-container))"
                      strokeWidth="9"
                    />
                    <circle
                      cx="60"
                      cy="60"
                      r="52"
                      fill="none"
                      stroke="rgb(var(--md-ext-color-teal))"
                      strokeWidth="9"
                      strokeDasharray="326.7"
                      strokeDashoffset={326.7 * (1 - (planned.length ? outcome.reuse / planned.length : 0))}
                      strokeLinecap="round"
                      transform="rotate(-90 60 60)"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Icon name="copy" className="h-5 w-5 text-ext-teal" />
                  </div>
                </div>
                <p className="font-brand text-3xl font-bold text-ext-teal">{outcome.reuse}</p>
              </div>
              <p className="mt-1 text-[10px] text-outline">
                Existing rules to evaluate in this batch
                <br />
                Adapt suitable content before authoring
              </p>
            </div>
            <div
              className="flex min-h-[148px] flex-col justify-between rounded-xl p-4"
              style={{ backgroundColor: 'rgb(var(--md-ext-color-teal) / 0.08)' }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-ext-teal">Your next steps</p>
              <p className="mt-2 font-brand text-3xl font-bold text-ext-teal">{plural(planned.length, 'action')}</p>
              <button
                onClick={() => {
                  setShowAll(false);
                  setFilter(null);
                  setSearch('');
                  goToWork();
                }}
                className="mt-2 w-full rounded-lg py-1.5 text-[10px] font-bold uppercase tracking-wide transition-opacity hover:opacity-90"
                style={{
                  background: 'linear-gradient(135deg, rgb(var(--md-ext-color-teal)), rgb(var(--md-ext-color-cyan)))',
                  color: 'rgb(var(--md-ext-color-on-teal))',
                }}
              >
                Review next actions ↓
              </button>
              <p className="mt-1 text-[9px] text-outline">A review batch, not a required rule count</p>
            </div>
            <div
              className="flex min-h-[148px] flex-col justify-between rounded-xl p-4"
              style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container) / 0.5)' }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-ext-green">
                What this batch should resolve
              </p>
              <dl className="mt-3 space-y-2 text-[10px] text-on-surface-variant">
                <div className="flex justify-between gap-2">
                  <dt>Existing detections to validate</dt>
                  <dd className="font-mono font-bold">{outcome.validate}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Behaviors to evaluate with reused rules</dt>
                  <dd className="font-mono font-bold text-ext-teal">{outcome.behaviors.length}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Evidence / research tasks</dt>
                  <dd className="font-mono font-bold text-ext-rose">{outcome.prerequisites + outcome.research}</dd>
                </div>
              </dl>
              <p className="mt-3 text-[9px] text-outline">
                Deployments depend on the review and tests. No coverage gain is assumed.
              </p>
            </div>
          </div>
          <details className="mt-4 text-[10px] text-on-surface-variant">
            <summary className="cursor-pointer text-primary">Where does the library fit?</summary>
            <p className="mt-2">
              {totalLibrary.toLocaleString()} catalog rules are available; {compatibleLibrary.toLocaleString()} match
              configured telemetry metadata. Those are options, not tasks. The plan prioritizes relevant behaviors,
              checks existing production mappings, then prefers native-language, recorded-validation and higher-quality
              candidates. Extra ATT&CK tags do not improve a candidate's rank. Alternatives stay under their action.
            </p>
          </details>
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section className="h-full rounded-2xl p-5" style={surface}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className={heading}>By Technology</h2>
              <span className="text-[10px] text-ext-teal">Actions in this batch</span>
            </div>
            {bucketsError ? (
              <p role="alert" className="text-xs text-error">
                Technology mapping unavailable. The action list remains available.
              </p>
            ) : bucketsLoading && !buckets.size ? (
              <p className="text-xs text-outline">Loading technology context…</p>
            ) : (
              BUCKET_ORDER.map((id) =>
                breakdownRow(
                  id,
                  BUCKET_LABELS[id],
                  planned.filter((a) => a.techniques.some((t) => buckets.get(t.id)?.has(id))),
                  techIcons[id],
                  () => openScope('technology', id, BUCKET_LABELS[id]),
                ),
              )
            )}
            <p className="mt-3 text-[10px] text-outline">
              Click an area to focus the action list. An action may apply to multiple technologies.
            </p>
            {outcome.prerequisites > 0 && (
              <p className="mt-2 text-[10px] text-ext-rose">Baseline prerequisites apply across technologies.</p>
            )}
          </section>
          <section className="h-full rounded-2xl p-5" style={surface}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className={heading}>Relevant Threat Groups</h2>
              <span className="text-[10px] text-ext-rose">Why these actions matter</span>
            </div>
            {groups
              .slice(0, 5)
              .map(({ group, actions }) =>
                breakdownRow(group.stixId, group.name, actions, 'shield', () =>
                  openScope('group', group.name, group.name),
                ),
              )}
            {groups.length > 5 && (
              <details className="mt-2 text-[10px]">
                <summary className="cursor-pointer text-primary">Other matched groups</summary>
                {groups
                  .slice(5)
                  .map(({ group, actions }) =>
                    breakdownRow(group.stixId, group.name, actions, 'shield', () =>
                      openScope('group', group.name, group.name),
                    ),
                  )}
              </details>
            )}
            {!groups.length && (
              <p className="py-4 text-xs text-outline">
                Confirm your environment profile and threat intelligence to establish relevance.
              </p>
            )}
            <p className="mt-3 text-[10px] text-outline">
              Profile-based relevance, not a probability of attack. Counts refer to the same batch of actions.
            </p>
          </section>
        </div>

        <section
          ref={workRef}
          className="scroll-mt-4 overflow-hidden rounded-2xl"
          style={surface}
          aria-labelledby="assessment-actions"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <h2 id="assessment-actions" className={heading}>
                {filter ? `${filter.label} / Actions` : 'Prioritized Actions'}
              </h2>
              <p className="mt-1 text-[10px] text-on-surface-variant">
                Selection sets the review batch. Completion requires the evidence described in each action.
              </p>
            </div>
            <button
              className="text-[10px] font-bold uppercase text-ext-teal"
              onClick={() => {
                choose(null);
                setShowAll(false);
                setFilter(null);
                setSearch('');
              }}
            >
              Reset suggested batch
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-outline-variant/20 px-5 py-3">
            <button
              aria-pressed={!showAll}
              onClick={() => {
                setShowAll(false);
                setLimit(10);
              }}
              className={`rounded-lg px-3 py-1.5 text-[11px] ${!showAll ? 'bg-primary/10 font-semibold text-primary' : 'text-on-surface-variant'}`}
            >
              Next {plural(planned.length, 'action')}
            </button>
            <button
              aria-pressed={showAll}
              onClick={() => {
                setShowAll(true);
                setLimit(10);
              }}
              className={`rounded-lg px-3 py-1.5 text-[11px] ${showAll ? 'bg-primary/10 font-semibold text-primary' : 'text-on-surface-variant'}`}
            >
              All {assessment.actions.length} findings
            </button>
            {filter && (
              <button className="text-xs text-primary" onClick={() => setFilter(null)}>
                Clear {filter.label} ×
              </button>
            )}
            <input
              aria-label="Search assessment actions"
              type="search"
              placeholder="Find an action, behavior or rule…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setLimit(10);
              }}
              className="min-w-0 flex-1 rounded-lg border border-outline-variant/40 bg-transparent px-3 py-2 text-xs text-on-surface"
            />
          </div>
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_150px] gap-5 bg-surface-container/40 px-5 py-2 text-[9px] font-bold uppercase tracking-wider text-outline lg:grid">
            <span>Action / Why it matters</span>
            <span>Expected result</span>
            <span>Next step</span>
          </div>
          <div className="divide-y divide-outline-variant/30">
            {visible.slice(0, limit).map((action) => {
              const style = kinds[action.kind];
              return (
                <article key={action.id} className="px-5 py-4">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_150px]">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 accent-primary"
                        checked={selectedIds.has(action.id)}
                        aria-label={`Plan: ${action.title}`}
                        onChange={() =>
                          choose(
                            selectedIds.has(action.id)
                              ? [...selectedIds].filter((id) => id !== action.id)
                              : [...selectedIds, action.id],
                          )
                        }
                      />
                      <div>
                        <div className="mb-2 flex items-center gap-2">
                          <Icon name={style.icon} className={`h-3.5 w-3.5 ${style.color}`} />
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${style.badge}`}
                          >
                            {style.label}
                          </span>
                        </div>
                        <h3 className="text-[12px] font-semibold text-on-surface">{action.title}</h3>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-on-surface-variant">{action.reason}</p>
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-[9px] font-bold uppercase text-outline lg:hidden">Expected result</p>
                      <p className="text-[11px] leading-relaxed text-on-surface-variant">{action.result}</p>
                    </div>
                    <div>
                      <Link
                        to={destination(action)}
                        className="inline-flex items-center gap-1 rounded-lg bg-ext-teal/10 px-3 py-2 text-[10px] font-bold text-ext-teal hover:bg-ext-teal/20"
                      >
                        {nextStepLabel(action)} <Icon name="arrow-right" className="h-3 w-3" />
                      </Link>
                      <button
                        onClick={() => setExpanded(expanded === action.id ? null : action.id)}
                        aria-expanded={expanded === action.id}
                        className="mt-2 block text-[10px] font-semibold text-primary"
                      >
                        {expanded === action.id ? 'Hide details ↑' : 'Evidence & completion ↓'}
                      </button>
                    </div>
                  </div>
                  {expanded === action.id && (
                    <div className="mt-4 rounded-xl bg-surface-container/60 p-4">
                      <div className="grid gap-5 md:grid-cols-2">
                        <div>
                          <h4 className="text-[10px] font-bold uppercase tracking-wide text-outline">What we know</h4>
                          <p className="mt-2 text-xs text-on-surface-variant">{action.evidence}</p>
                          {action.ruleId && (
                            <Link
                              className="mt-2 block text-xs font-semibold text-ext-teal"
                              to={routeHelpers.detectionDetail(action.ruleId)}
                            >
                              {action.ruleName || 'Open linked rule'} ↗
                            </Link>
                          )}
                          <h4 className="mt-4 text-[10px] font-bold uppercase tracking-wide text-outline">Done when</h4>
                          <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">{action.doneWhen}</p>
                        </div>
                        <div>
                          <h4 className="text-[10px] font-bold uppercase tracking-wide text-outline">Work to do</h4>
                          <ol className="mt-2 list-decimal space-y-2 pl-4 text-xs leading-relaxed text-on-surface-variant">
                            {action.steps.map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                        </div>
                      </div>
                      {action.techniques.length > 0 && (
                        <details className="mt-4 text-xs">
                          <summary className="cursor-pointer text-primary">
                            {action.kind === 'research'
                              ? 'Unresolved mappings to investigate—not a required rule count'
                              : 'Behaviors referenced by this action'}
                          </summary>
                          <ul className="mt-2 grid gap-1 text-on-surface-variant sm:grid-cols-2">
                            {action.techniques.map((t) => (
                              <li key={t.id}>
                                {t.name} ({t.id})
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      {action.alternatives.length > 0 && (
                        <details className="mt-4 text-xs">
                          <summary className="cursor-pointer text-primary">
                            {plural(action.alternatives.length, 'alternative')} · choose suitable content, not every
                            rule
                          </summary>
                          <p className="mt-2 text-on-surface-variant">
                            These match at least one behavior in this action; they are not necessarily interchangeable.
                            Check scope and query logic.
                          </p>
                          <ul className="mt-2 space-y-2">
                            {action.alternatives.map((d) => (
                              <li key={d.id}>
                                <Link to={routeHelpers.detectionDetail(d.id)} className="text-ext-teal hover:underline">
                                  {d.name} ↗
                                </Link>
                                <span className="ml-2 text-on-surface-variant">
                                  {d.queryLanguage}
                                  {d.siemReady ? '' : ' · conversion needed'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {!visible.length && (
            <p className="p-6 text-sm text-on-surface-variant">
              {search || filter
                ? 'No actions match this filter. Clear it to return to the plan.'
                : planned.length
                  ? 'No findings in this view.'
                  : 'No actions selected. Open all findings or reset the suggested batch.'}
            </p>
          )}
          {visible.length > limit && (
            <button className="w-full p-4 text-xs font-semibold text-ext-teal" onClick={() => setLimit((n) => n + 10)}>
              Show more findings
            </button>
          )}
        </section>

        <details className="rounded-2xl p-5" style={surface}>
          <summary className="cursor-pointer text-[11px] font-semibold text-primary">
            Technical evidence · ATT&CK mappings and remaining questions
          </summary>
          <p className="my-3 text-xs leading-relaxed text-on-surface-variant">
            Enabled rules map to {assessment.mapping.covered.length} of {assessment.mapping.total} profile-relevant
            techniques. This is a mapping inventory, not a security score or a deployment target. Unmapped, unlinked or
            partially effective detections can change the interpretation. Parent and sub-technique IDs are counted
            separately.
          </p>
          <MiniMitreMatrix tacticCoverage={intel.tacticThreatCoverage} loading={false} />
          <p className="mt-4 text-xs text-on-surface-variant">
            The research finding groups unresolved questions. It does not prescribe one custom rule per technique.
            Validate applicability, telemetry and existing detections before deciding to author.
          </p>
        </details>
      </div>
    </div>
  );
}
