import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { EnvironmentProfile, CloudPlatformConfig } from '../../../types/environment';
import { computeProfileCompleteness } from '../../../types/environment';

export interface WizardDraft {
  sectors: string[];
  userCountry: string | null;
  threatOriginCountries: string[];
  siemPlatforms: string[];
  logSources: string[];       // Now stores group keys (e.g., ['windows_sysmon', 'aws_cloudtrail'])
  customLogSources: string[];
  edrTools: string[];
  cloudPlatforms: CloudPlatformConfig;
  crownJewels: string[];
  // Legacy
  industry: string;
}

type Direction = 'forward' | 'backward';

const TOTAL_STEPS = 6;

function initDraft(profile: EnvironmentProfile | null): WizardDraft {
  return {
    sectors: profile?.sectors || [],
    userCountry: profile?.user_country || null,
    threatOriginCountries: profile?.threat_origin_countries || [],
    siemPlatforms: profile?.siem_platforms || [],
    logSources: profile?.log_sources || [],
    customLogSources: profile?.custom_log_sources || [],
    edrTools: profile?.edr_tools || [],
    cloudPlatforms: profile?.cloud_platforms || {},
    crownJewels: profile?.crown_jewels || [],
    industry: profile?.industry || '',
  };
}

export function useWizardState(profile: EnvironmentProfile | null) {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState<Direction>('forward');
  const [draft, setDraft] = useState<WizardDraft>(() => initDraft(profile));
  const initializedRef = useRef(false);

  // Sync draft from profile when it loads for the first time
  useEffect(() => {
    if (profile && !initializedRef.current) {
      setDraft(initDraft(profile));
      initializedRef.current = true;
    }
  }, [profile]);

  const setDraftField = useCallback(<K extends keyof WizardDraft>(key: K, value: WizardDraft[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  }, []);

  const goNext = useCallback(() => {
    setDirection('forward');
    setCurrentStep(prev => Math.min(prev + 1, TOTAL_STEPS - 1));
  }, []);

  const goBack = useCallback(() => {
    setDirection('backward');
    setCurrentStep(prev => Math.max(prev - 1, 0));
  }, []);

  const goToStep = useCallback((step: number) => {
    if (step < 0 || step >= TOTAL_STEPS) return;
    setDirection(step > currentStep ? 'forward' : 'backward');
    setCurrentStep(step);
  }, [currentStep]);

  const stepCompletion = useMemo<boolean[]>(() => [
    draft.sectors.length > 0,
    !!(draft.userCountry || draft.threatOriginCountries.length > 0),
    draft.siemPlatforms.length > 0,
    draft.logSources.length > 0,
    draft.edrTools.length > 0,
    draft.crownJewels.length > 0,
  ], [draft]);

  const completeness = useMemo(() => computeProfileCompleteness({
    sectors: draft.sectors,
    industry: draft.industry || null,
    user_country: draft.userCountry,
    threat_origin_countries: draft.threatOriginCountries,
    siem_platforms: draft.siemPlatforms,
    log_sources: draft.logSources,
    edr_tools: draft.edrTools,
    crown_jewels: draft.crownJewels,
  }), [draft.sectors, draft.industry, draft.userCountry, draft.threatOriginCountries,
       draft.siemPlatforms, draft.logSources, draft.edrTools, draft.crownJewels]);

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === TOTAL_STEPS - 1;

  return {
    currentStep,
    direction,
    draft,
    setDraftField,
    goNext,
    goBack,
    goToStep,
    stepCompletion,
    completeness,
    isFirstStep,
    isLastStep,
    totalSteps: TOTAL_STEPS,
  };
}
