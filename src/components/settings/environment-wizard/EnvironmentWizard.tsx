import { LoadingStatus } from '@/components/ui/LoadingStatus';
import { useInitialLoading } from '@/hooks/useInitialLoading';
import { PagePending } from '@/components/ui/PagePending';
import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../router/routes';
import { useEnvironmentProfile } from '../../../hooks/useEnvironmentProfile';
import { useWizardState } from './useWizardState';
import { useFeasibilityLive } from './useFeasibilityLive';
import { WizardStepIndicator } from './WizardStepIndicator';
import { WizardNavigation } from './WizardNavigation';
import { IntelligencePanel } from './IntelligencePanel';
import { SectorStep } from './steps/SectorStep';
import { CountryStep } from './steps/CountryStep';
import { SiemPlatformsStep } from './steps/SiemPlatformsStep';
import { LogSourcesStep } from './steps/LogSourcesStep';
import { SecurityToolsStep } from './steps/SecurityToolsStep';
import { CrownJewelsStep } from './steps/CrownJewelsStep';
import { Icon } from '../../Icon';
import { getImpliedGroupKeys } from '../../../services/directFeasibilityService';

interface EnvironmentWizardProps {
  onBack?: () => void;
}

export const EnvironmentWizard: React.FC<EnvironmentWizardProps> = ({ onBack }) => {
  const navigate = useNavigate();
  const { profile, isLoading, isSaving, error: profileError, saveProfile } = useEnvironmentProfile();

  const {
    currentStep,
    draft,
    setDraftField,
    goNext,
    goBack,
    goToStep,
    stepCompletion,
    isFirstStep,
    isLastStep,
  } = useWizardState(profile);

  const feasibility = useFeasibilityLive(
    draft.logSources,
    draft.customLogSources,
    draft.edrTools,
    draft.cloudPlatforms
  );

  // Implied group keys for the LogSourcesStep auto-detection indicator
  const impliedGroupKeys = useMemo(
    () => getImpliedGroupKeys(draft.edrTools, draft.cloudPlatforms),
    [draft.edrTools, draft.cloudPlatforms]
  );

  const handleSave = useCallback(async () => {
    const success = await saveProfile({
      industry: draft.industry || null,
      sectors: draft.sectors,
      user_country: draft.userCountry,
      threat_origin_countries: draft.threatOriginCountries,
      siem_platforms: draft.siemPlatforms,
      log_sources: draft.logSources,
      custom_log_sources: draft.customLogSources,
      edr_tools: draft.edrTools,
      cloud_platforms: draft.cloudPlatforms,
      crown_jewels: draft.crownJewels,
    });
    if (success) {
      navigate(ROUTES.ACTION_PLAN);
    }
  }, [saveProfile, draft, navigate]);

  const initialLoading = useInitialLoading(isLoading);
  if (initialLoading) {
    return <PagePending layout="form" />;
  }

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <SectorStep
            selected={draft.sectors}
            onSelect={(v) => setDraftField('sectors', v)}
          />
        );
      case 1:
        return (
          <CountryStep
            userCountry={draft.userCountry}
            threatOriginCountries={draft.threatOriginCountries}
            onSelectCountry={(v) => setDraftField('userCountry', v)}
            onSelectOrigins={(v) => setDraftField('threatOriginCountries', v)}
          />
        );
      case 2:
        return (
          <SiemPlatformsStep
            selected={draft.siemPlatforms}
            onSelect={(v) => setDraftField('siemPlatforms', v)}
          />
        );
      case 3:
        return (
          <LogSourcesStep
            selected={draft.logSources}
            customSources={draft.customLogSources}
            impliedGroupKeys={impliedGroupKeys}
            onSelectSources={(v) => setDraftField('logSources', v)}
            onSelectCustom={(v) => setDraftField('customLogSources', v)}
          />
        );
      case 4:
        return (
          <SecurityToolsStep
            selected={draft.edrTools}
            onSelect={(v) => setDraftField('edrTools', v)}
          />
        );
      case 5:
        return (
          <CrownJewelsStep
            selected={draft.crownJewels}
            onSelect={(v) => setDraftField('crownJewels', v)}
          />
        );
      default:
        return null;
    }
  };

  const intelligencePanelProps = {
    matchedCount: feasibility.matchedCount,
    totalCount: feasibility.totalCount,
    tacticBreakdown: feasibility.tacticBreakdown,
    loading: feasibility.loading,
    error: feasibility.error,
    sectors: draft.sectors,
    userCountry: draft.userCountry,
    siemCount: draft.siemPlatforms.length,
    logSourceCount: draft.logSources.length,
    toolCount: draft.edrTools.length,
    crownJewelCount: draft.crownJewels.length,
    onJumpToStep: goToStep,
  };

  const completedCount = stepCompletion.filter(Boolean).length;

  return <> {isLoading && <div className="px-6 py-2"><LoadingStatus /></div>} {(
    <div className="max-w-7xl mx-auto px-6 py-6 ">
      {/* Compact action bar — no duplicate page title (AppLayout already renders it) */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 -ml-2.5 rounded-lg text-xs font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              <Icon name="arrow-left" className="w-3.5 h-3.5" />
              Back
            </button>
          )}
          <span className="text-xs text-on-surface-variant/70">
            {completedCount} of 6 steps complete
          </span>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : 'Save Profile'}
        </button>
      </div>

      {/* Profile error banner */}
      {profileError && (
        <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 flex items-start gap-2">
          <Icon name="alert-triangle" className="w-4 h-4 text-amber-700 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-700 dark:text-amber-400">
            {profileError.includes('404') || profileError.includes('does not exist')
              ? 'Environment profile table not found. Run the database migration to enable saving.'
              : profileError
            }
          </div>
        </div>
      )}

      {/* Mobile-only compact intelligence summary */}
      <IntelligencePanel variant="compact" {...intelligencePanelProps} />

      {/* Two-panel layout: clear visual asymmetry between INPUT (left) and OUTPUT (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        {/* LEFT — Configure panel (where you fill information) */}
        <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-low overflow-hidden">
          <header className="px-5 py-3 border-b border-outline-variant/30 bg-surface-container flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-block w-1 h-3.5 rounded-sm bg-primary" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface">
                Configure
              </span>
            </div>
            <span className="text-[11px] text-on-surface-variant tabular-nums">
              Step {currentStep + 1} / 6
            </span>
          </header>

          <div className="px-5 pt-5">
            <WizardStepIndicator
              currentStep={currentStep}
              stepCompletion={stepCompletion}
              onStepClick={goToStep}
            />
          </div>

          <div className="px-5 pb-5">
            <div key={currentStep} className="">
              {renderStep()}
            </div>

            <WizardNavigation
              currentStep={currentStep}
              isFirstStep={isFirstStep}
              isLastStep={isLastStep}
              isSaving={isSaving}
              onNext={goNext}
              onBack={goBack}
              onSkip={goNext}
              onSave={handleSave}
            />
          </div>
        </section>

        {/* RIGHT — Live Insights panel (where information reflects as you fill) */}
        <aside className="hidden lg:block lg:sticky lg:top-6 lg:self-start">
          <IntelligencePanel variant="full" {...intelligencePanelProps} />
        </aside>
      </div>
    </div>
  )} </>;
};
