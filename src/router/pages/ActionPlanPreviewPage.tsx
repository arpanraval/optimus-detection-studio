import { LoadingStatus } from '@/components/ui/LoadingStatus';
import { PagePending } from '@/components/ui/PagePending';
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEnvironmentProfile } from '@/hooks/useEnvironmentProfile';
import { useProfileIntelligence, type ProfileIntelligence } from '@/hooks/useProfileIntelligence';
import { useFeasibilityLive } from '@/components/settings/environment-wizard/useFeasibilityLive';
import { ActionPlanPreview } from '@/components/action-plan/ActionPlanPreview';
import { PageErrorBoundary } from '@/components/ErrorBoundary';
import type { EnvironmentProfile } from '@/types/environment';
import { ROUTES } from '@/router/routes';
import { useAppData } from '@/router/AppDataContext';
import { computeEffectiveGroupKeys } from '@/services/directFeasibilityService';

interface Snapshot {
  intel: ProfileIntelligence;
  total: number;
  compatible: number;
  matchResult: ReturnType<typeof useFeasibilityLive>['matchResult'];
}
interface PreviewSession {
  profile: EnvironmentProfile | null;
  includeDevelopment: boolean;
  snapshots: Map<string, Snapshot>;
  actionIds: Map<string, string[] | null>;
}
// Memory only, scoped to the signed-in user. Returning to this route revalidates in the background.
let retained: { userId: string; session: PreviewSession } | null = null;
function sessionFor(userId: string): PreviewSession {
  if (retained?.userId !== userId)
    retained = {
      userId,
      session: {
        profile: null,
        includeDevelopment: true,
        snapshots: new Map(),
        actionIds: new Map(),
      },
    };
  return retained.session;
}

function ConnectedPreview({
  profile,
  session,
  scopeKey,
  includeDevelopment,
  onScopeChange,
  profileRefreshing,
  profileError,
}: {
  profile: EnvironmentProfile;
  session: PreviewSession;
  scopeKey: string;
  includeDevelopment: boolean;
  onScopeChange: (include: boolean) => void;
  profileRefreshing: boolean;
  profileError: string | null;
}) {
  const feasibility = useFeasibilityLive(
    profile.log_sources,
    profile.custom_log_sources || [],
    profile.edr_tools || [],
    profile.cloud_platforms || {},
  );
  const intel = useProfileIntelligence(
    profile.sectors || [],
    profile.siem_platforms,
    feasibility.matchResult,
    profile.user_country || null,
    profile.threat_origin_countries || [],
    profile.crown_jewels || [],
    includeDevelopment,
  );
  const hasTelemetry =
    computeEffectiveGroupKeys(profile.log_sources, profile.edr_tools || [], profile.cloud_platforms || {}).length > 0 ||
    (profile.custom_log_sources || []).length > 0;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(() => session.snapshots.get(scopeKey) ?? null);
  const fetchCycle = useRef({ match: feasibility.matchResult, started: false });
  const error = profileError || feasibility.error || intel.error;

  useEffect(() => {
    // Do not publish the hook's initial empty state or an intelligence result for the previous telemetry input.
    if (fetchCycle.current.match !== feasibility.matchResult)
      fetchCycle.current = { match: feasibility.matchResult, started: false };
    if (intel.loading) fetchCycle.current.started = true;
    if (
      error ||
      intel.loading ||
      feasibility.loading ||
      !fetchCycle.current.started ||
      (!feasibility.matchResult && hasTelemetry)
    )
      return;
    setSnapshot((previous) => {
      if (
        previous?.intel.groupTechniqueDetails === intel.groupTechniqueDetails &&
        previous.matchResult === feasibility.matchResult
      )
        return previous;
      const next = {
        intel,
        total: feasibility.totalCount,
        compatible: feasibility.matchedCount,
        matchResult: feasibility.matchResult,
      };
      session.snapshots.set(scopeKey, next);
      return next;
    });
  }, [intel, feasibility, error, hasTelemetry, scopeKey, session]);

  if (!snapshot)
    return (
      <div className="p-8" role={error ? 'alert' : 'status'}>
        {error
          ? `Unable to load your plan: ${error}`
          : 'Preparing your first plan from your library and saved SIEM observations…'}
      </div>
    );
  const refreshing =
    profileRefreshing || feasibility.loading || intel.loading || (!feasibility.matchResult && hasTelemetry);
  return (
    <div className="flex h-full flex-col">
      <div
        className="flex shrink-0 items-center justify-between gap-3 bg-background px-8 pt-2 text-xs text-on-surface-variant"
        role={error ? 'alert' : 'status'}
      >
        <span>
          {error
            ? `Refresh failed; showing your last loaded plan. ${error}`
            : refreshing
              ? 'Updating in the background. Your last loaded plan stays visible.'
              : 'Based on saved SIEM observations. Fetch your SIEM inventory after deployment to update coverage.'}
        </span>
        <button className="shrink-0 text-primary underline" onClick={intel.refetch}>
          Refresh coverage
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <ActionPlanPreview
          intel={{ ...snapshot.intel, refetch: intel.refetch }}
          profile={profile}
          totalLibrary={snapshot.total}
          compatibleLibrary={snapshot.compatible}
          matchResult={snapshot.matchResult}
          includeDevelopment={includeDevelopment}
          onScopeChange={onScopeChange}
          initialActionIds={session.actionIds.get(scopeKey) ?? null}
          onActionIdsChange={(ids) => session.actionIds.set(scopeKey, ids)}
        />
      </div>
    </div>
  );
}

export function ActionPlanPreviewPage() {
  const { user } = useAppData();
  const session = sessionFor(user?.id ?? 'unauthenticated');
  const { profile, isLoading, error } = useEnvironmentProfile();
  const [includeDevelopment, setIncludeDevelopment] = useState(session.includeDevelopment);
  useEffect(() => {
    if (!isLoading && !error) session.profile = profile;
  }, [profile, isLoading, error, session]);
  const displayedProfile = profile ?? (isLoading || error ? session.profile : null);
  if (!displayedProfile) {
    if (isLoading)
      return <PagePending layout="dashboard" label="Loading environment profile…" />;
    if (error)
      return (
        <div role="alert" className="p-8 text-error">
          Unable to load environment profile: {error}
        </div>
      );
    return <> {isLoading && <div className="px-6 py-2"><LoadingStatus /></div>} {(
      <div className="p-8">
        Set up an environment profile to create your action plan.{' '}
        <Link className="text-primary underline" to={ROUTES.ENVIRONMENT_PROFILE}>
          Set up profile
        </Link>
      </div>
    )} </>;
  }
  const scopeKey = JSON.stringify([displayedProfile, includeDevelopment]);
  return (
    <PageErrorBoundary pageName="Action Plan Preview">
      <ConnectedPreview
        key={scopeKey}
        profile={displayedProfile}
        session={session}
        scopeKey={scopeKey}
        includeDevelopment={includeDevelopment}
        profileRefreshing={isLoading}
        profileError={error}
        onScopeChange={(include) => {
          session.includeDevelopment = include;
          setIncludeDevelopment(include);
        }}
      />
    </PageErrorBoundary>
  );
}

/** Isolate session memory in regression tests. */
export function resetActionPlanPreviewSession() {
  retained = null;
}
