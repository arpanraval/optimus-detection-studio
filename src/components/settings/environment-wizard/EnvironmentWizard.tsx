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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
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

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 animate-page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {onBack && (
            <button onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-surface-container transition-colors">
              <Icon name="arrow-left" className="w-5 h-5 text-on-surface-variant" />
            </button>
          )}
          <div>
            <h1 className="text-xl font-semibold text-on-surface">Environment Profile</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">
              Configure your environment for personalized detection intelligence
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Profile error banner */}
      {profileError && (
        <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
          <Icon name="alert-triangle" className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-400">
            {profileError.includes('404') || profileError.includes('does not exist')
              ? 'Environment profile table not found. Run the database migration to enable saving.'
              : profileError
            }
          </div>
        </div>
      )}

      {/* Step Indicator */}
      <WizardStepIndicator
        currentStep={currentStep}
        stepCompletion={stepCompletion}
        onStepClick={goToStep}
      />

      {/* Intelligence Panel — compact bar on mobile */}
      <IntelligencePanel variant="compact" {...intelligencePanelProps} />

      {/* Main Content — split on desktop */}
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left: Step Content */}
        <div className="flex-1 lg:w-[60%] min-w-0">
          <div key={currentStep} className="animate-page-enter">
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

        {/* Right: Intelligence Panel (desktop only) */}
        <div className="hidden lg:block lg:w-[40%]">
          <IntelligencePanel variant="full" {...intelligencePanelProps} />
        </div>
      </div>
    </div>
  );
};
