/**
 * OnboardingPage
 *
 * Full-screen canvas experience for the detection onboarding pipeline.
 * Everything lives on ONE continuous SVG canvas using M3 theme tokens:
 *   - Floating semi-transparent header (HTML overlay, z-20)
 *   - Full-screen pipeline SVG visualization with integrated panels
 *     (source + destination panels live INSIDE the SVG via foreignObject)
 *   - Floating glass activity console (HTML overlay, bottom center)
 *   - Floating initialize CTA button (HTML overlay)
 *   - Modals/dialogs (HTML overlays: ImportPreCheck, loading, errors, completion)
 *
 * Uses M3 CSS custom properties for full light/dark theme support.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { OnboardingProvider, useOnboarding } from './OnboardingContext';
import PipelineVisualization from './pipeline/PipelineVisualization';
import { ActivityConsole } from './console/ActivityConsole';
import { CompletionOverlay } from './completion/CompletionOverlay';
import type { CompletionPhase } from './completion/CompletionOverlay';
import { SourceSummaryList } from './completion/SourceSummaryList';
import { CompletionCTAs } from './completion/CompletionCTAs';
import { useGlobalImport } from '../../context/GlobalImportContext';
import { ImportPreCheck } from './ImportPreCheck';
import { ImportReport } from './ImportReport';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabaseClient';
import type { PreCheckSummary } from '../../services/bulk-import/types';

// ---------------------------------------------------------------------------
// Initialize Button - Floating CTA
// ---------------------------------------------------------------------------

interface InitializeButtonProps {
  onInitialize: () => void;
}

function InitializeButton({ onInitialize }: InitializeButtonProps) {
  const { phase, sources, abort } = useOnboarding();

  const selectedWithFolders = useMemo(() => {
    return sources.filter(
      (s) => s.selected && s.folders.some((f) => f.selected)
    );
  }, [sources]);

  const totalRules = useMemo(() => {
    return selectedWithFolders.reduce((sum, s) => sum + s.source.estimatedRules, 0);
  }, [selectedWithFolders]);

  const isReady = selectedWithFolders.length > 0 && phase === 'selection';
  const isProcessing = phase === 'processing';

  if (phase === 'complete' || phase === 'confirming') return null;

  return (
    <div className="absolute z-20 bottom-14 left-1/2 -translate-x-1/2">
      {isProcessing ? (
        <button
          onClick={abort}
          className="px-6 py-2.5 rounded-xl text-[13px] font-medium cursor-pointer transition-all duration-200 bg-error/15 border border-error/30 text-error backdrop-blur-sm"
        >
          Abort Import
        </button>
      ) : (
        <button
          onClick={isReady ? onInitialize : undefined}
          disabled={!isReady}
          className={[
            'px-8 py-3 rounded-xl text-[13px] font-medium cursor-pointer transition-all duration-300 backdrop-blur-sm',
            isReady
              ? 'bg-primary/10 border border-primary/40 text-on-primary-container hover:scale-[1.02] shadow-[0_0_30px_rgb(var(--md-sys-color-primary)/0.15)]'
              : 'bg-surface-container border border-outline-variant/20 text-on-surface-variant opacity-40 cursor-not-allowed',
          ].join(' ')}
        >
          {isReady ? (
            <>
              Initialize {selectedWithFolders.length} Source{selectedWithFolders.length !== 1 ? 's' : ''}
              <span className="ml-2 text-[11px] opacity-60">
                ~{totalRules.toLocaleString()} rules
              </span>
            </>
          ) : (
            'Select sources to begin'
          )}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OnboardingContent - Inner component that consumes OnboardingContext
// ---------------------------------------------------------------------------

function OnboardingContent() {
  const navigate = useNavigate();
  const { phase, sources, retrySource, initializeOnboarding, getParsedRulesForImport, getValidatedRulesForImport, resetPhase, syncImportProgress } = useOnboarding();
  const globalImport = useGlobalImport();
  const [completionPhase, setCompletionPhase] = useState<CompletionPhase | null>(null);
  const [showCTAs, setShowCTAs] = useState(false);
  const [showPreCheck, setShowPreCheck] = useState(false);
  const [preCheckLoading, setPreCheckLoading] = useState(false);
  const [preCheckError, setPreCheckError] = useState<string | null>(null);

  // FIX: Store pre-check results locally so we don't depend on context state
  // for the render condition. This ensures showPreCheck and localPreCheckResults
  // are always set in the same React batch.
  const [localPreCheckResults, setLocalPreCheckResults] = useState<PreCheckSummary | null>(null);

  // FIX: Use refs for values accessed inside long-running async callbacks
  // to avoid stale closure captures.
  const globalImportRef = useRef(globalImport);
  globalImportRef.current = globalImport;

  const getValidatedRulesRef = useRef(getValidatedRulesForImport);
  getValidatedRulesRef.current = getValidatedRulesForImport;

  const isFirstTime = !localStorage.getItem('optimus:onboarding:completed');

  // Sync global import progress to the visual pipeline
  useEffect(() => {
    if (globalImport.status === 'importing' && globalImport.progress) {
      syncImportProgress(
        globalImport.progress.insertedRules,
        globalImport.progress.totalRules
      );
    }
  }, [globalImport.status, globalImport.progress, syncImportProgress]);

  // FIX: Safety net — if the async callback's setShowPreCheck(true) didn't trigger
  // the modal for any reason (React batching timing, stale closure), this effect
  // catches it by watching for pre-check results in context.
  useEffect(() => {
    if (
      phase === 'confirming' &&
      globalImport.preCheckResults &&
      !showPreCheck &&
      !preCheckLoading &&
      !preCheckError
    ) {
      console.log('[Onboarding] Safety net: showing pre-check modal from context state');
      setLocalPreCheckResults(globalImport.preCheckResults);
      setShowPreCheck(true);
    }
  }, [phase, globalImport.preCheckResults, showPreCheck, preCheckLoading, preCheckError]);

  const handleSkip = () => {
    localStorage.setItem('optimus:onboarding:skipped', 'true');
    navigate('/');
  };

  const handleCompletionPhase = useCallback((p: CompletionPhase) => {
    setCompletionPhase(p);
    if (p === 'done') {
      setShowCTAs(true);
      localStorage.setItem('optimus:onboarding:completed', 'true');
    }
  }, []);

  const handleAddMoreSources = useCallback(() => {
    navigate('/onboarding');
    window.location.reload();
  }, [navigate]);

  // Direct call chain: initialize → pre-check → show modal
  // Uses refs for globalImport to avoid stale closure issues during
  // the long-running fetch/parse/validate phase.
  const handleInitialize = useCallback(async () => {
    // Phase 1: Run fetch/parse/validate via OnboardingContext
    await initializeOnboarding();

    // Phase 2: Collect parsed rules and run duplicate pre-check
    const parsedRules = getParsedRulesForImport();
    console.log('[Onboarding] Processing complete, parsed rules for pre-check:', parsedRules.length);

    if (parsedRules.length === 0) {
      console.warn('[Onboarding] No parsed rules available after processing — skipping pre-check');
      return;
    }

    setPreCheckLoading(true);
    setPreCheckError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      console.log('[Onboarding] Starting pre-check for', parsedRules.length, 'rules, user:', user.id);
      // FIX: Use ref to access latest globalImport (avoids stale closure)
      const summary = await globalImportRef.current.startPreCheck(parsedRules, user.id);
      console.log('[Onboarding] Pre-check complete:', {
        netNew: summary.netNew.length,
        updated: summary.updatedUpstream.length,
        unchanged: summary.unchanged.length,
        rejected: summary.hardRejects.length,
      });

      // FIX: Set both states in the same synchronous block so React batches
      // them into a single render — the modal WILL appear.
      setLocalPreCheckResults(summary);
      setShowPreCheck(true);
    } catch (err) {
      console.error('[Onboarding] Pre-check failed:', err);
      setPreCheckError(err instanceof Error ? err.message : 'Pre-check failed');
      setLocalPreCheckResults(null);
    } finally {
      setPreCheckLoading(false);
    }
  }, [initializeOnboarding, getParsedRulesForImport]);
  // FIX: Removed globalImport from deps — now uses ref instead

  const handlePreCheckConfirm = useCallback(
    async (config: { importNetNew: boolean; updateExisting: boolean; forceUnchanged: boolean }) => {
      setShowPreCheck(false);
      // FIX: Use ref for getValidatedRulesForImport to get latest version
      const { rules, jobConfig } = getValidatedRulesRef.current();

      // FIX: Use local pre-check results (guaranteed to be available)
      const preCheckResults = localPreCheckResults;
      let finalRulesToImport = rules;

      if (preCheckResults) {
        // Build sets of external IDs to include
        const idsToInclude = new Set<string>();

        if (config.importNetNew) {
          preCheckResults.netNew.forEach(r => idsToInclude.add(r.externalId));
        }
        if (config.updateExisting) {
          preCheckResults.updatedUpstream.forEach(r => idsToInclude.add(r.externalId));
        }
        if (config.forceUnchanged) {
          preCheckResults.unchanged.forEach(r => idsToInclude.add(r.externalId));
        }

        finalRulesToImport = rules.filter(r => idsToInclude.has(r.parsed.sourceId));
      }

      // FIX: Use ref to access latest globalImport
      await globalImportRef.current.confirmAndImport(finalRulesToImport, jobConfig);
      setLocalPreCheckResults(null);
    },
    [localPreCheckResults]
  );

  const handlePreCheckCancel = useCallback(() => {
    setShowPreCheck(false);
    setLocalPreCheckResults(null);
    resetPhase('selection');
  }, [resetPhase]);

  // FIX: Manual trigger for stuck state — if phase is confirming and
  // pre-check completed but modal isn't showing, provide a recovery button.
  const handleManualShowPreCheck = useCallback(() => {
    const results = globalImportRef.current.preCheckResults;
    if (results) {
      setLocalPreCheckResults(results);
      setShowPreCheck(true);
    }
  }, []);

  // Determine if we're in a stuck state (confirming phase, no modal, no loading, no error)
  // FIX: Delay stuck-state detection by 1.5s to avoid flashing during normal flow
  const isStuckCondition = phase === 'confirming' && !showPreCheck && !preCheckLoading && !preCheckError && globalImport.status !== 'importing' && globalImport.status !== 'complete';
  const [isStuckState, setIsStuckState] = useState(false);
  useEffect(() => {
    if (isStuckCondition) {
      const timer = setTimeout(() => setIsStuckState(true), 1500);
      return () => clearTimeout(timer);
    }
    setIsStuckState(false);
  }, [isStuckCondition]);

  return (
    <div className="h-full relative overflow-hidden bg-surface-container-lowest">
      {/* Floating header overlay (transparent gradient, floats above everything) */}
      <header className="absolute top-0 left-0 right-0 z-20 px-8 py-4 flex justify-between items-center bg-gradient-to-b from-surface-container-lowest to-transparent">
        <div>
          <h1 className="font-brand text-xl tracking-wider text-on-surface">
            {isFirstTime ? 'Welcome to Optimus' : 'Detection Onboarding'}
          </h1>
          <p className="text-[12px] mt-1 text-on-surface-variant">
            Import detection rules from official vendor sources
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isFirstTime && phase === 'selection' && (
            <button
              onClick={handleSkip}
              className="text-[12px] px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-on-surface-variant hover:text-on-surface"
            >
              Skip for now
            </button>
          )}
        </div>
      </header>

      {/* Pipeline visualization — full-screen canvas (panels live inside via foreignObject) */}
      <div className="absolute inset-0 z-[1]">
        <PipelineVisualization />
      </div>

      {/* HTML overlays on top of the canvas */}
      <div className="absolute inset-0 z-[2] pointer-events-none">
        {/* Floating initialize button */}
        <div className="pointer-events-auto">
          <InitializeButton onInitialize={handleInitialize} />
        </div>

        {/* Floating activity console */}
        <div className="pointer-events-auto">
          <ActivityConsole />
        </div>

        {/* Pre-check loading indicator */}
        {preCheckLoading && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-scrim/50 backdrop-blur-sm pointer-events-auto">
            <div className="p-6 rounded-2xl bg-surface-container border border-outline-variant/20 shadow-2xl text-center">
              <div className="animate-spin w-6 h-6 mx-auto mb-3 border-2 border-primary border-t-transparent rounded-full" />
              <p className="text-[13px] text-on-surface font-medium">Running duplicate pre-check...</p>
              <p className="text-[11px] text-on-surface-variant mt-1">Analyzing rules against existing library...</p>
            </div>
          </div>
        )}

        {/* Pre-check error */}
        {preCheckError && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-scrim/50 backdrop-blur-sm pointer-events-auto">
            <div className="max-w-sm p-6 rounded-2xl bg-surface-container border border-error/30 shadow-2xl">
              <p className="text-[13px] text-error font-medium mb-2">Pre-check failed</p>
              <p className="text-[12px] text-on-surface-variant mb-4">{preCheckError}</p>
              <div className="flex gap-2">
                <Button
                  color="surface"
                  variant="text"
                  size="sm"
                  onClick={() => { setPreCheckError(null); resetPhase('selection'); }}
                >
                  Back to selection
                </Button>
                <Button
                  color="primary"
                  variant="filled"
                  size="sm"
                  onClick={async () => {
                    setPreCheckError(null);
                    try {
                      const { rules, jobConfig } = getValidatedRulesRef.current();
                      await globalImportRef.current.confirmAndImport(rules, jobConfig);
                    } catch (err) {
                      console.error('[Onboarding] Import-anyway failed:', err);
                      setPreCheckError(err instanceof Error ? err.message : 'Import failed');
                    }
                  }}
                >
                  Import anyway
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* FIX: Stuck state recovery */}
        {isStuckState && (
          <div className="absolute z-20 bottom-14 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-auto">
            <p className="text-[11px] text-on-surface-variant/70">
              Processing complete — ready to review
            </p>
            <button
              onClick={handleManualShowPreCheck}
              className="px-6 py-2.5 rounded-xl text-[13px] font-medium cursor-pointer transition-all duration-200 bg-primary/10 border border-primary/40 text-on-primary-container hover:bg-primary/20 backdrop-blur-sm shadow-[0_0_20px_rgb(var(--md-sys-color-primary)/0.1)]"
            >
              Continue to Import Review
            </button>
            <button
              onClick={() => resetPhase('selection')}
              className="text-[11px] cursor-pointer text-on-surface-variant/50 hover:text-on-surface-variant transition-colors"
            >
              Cancel and go back
            </button>
          </div>
        )}

        {/* ImportPreCheck modal */}
        {showPreCheck && localPreCheckResults && (
          <div className="pointer-events-auto">
            <ImportPreCheck
              summary={localPreCheckResults}
              sourceName="Detection Sources"
              onConfirm={handlePreCheckConfirm}
              onCancel={handlePreCheckCancel}
            />
          </div>
        )}

        {/* ImportReport — shown when global import completes */}
        {globalImport.status === 'complete' && globalImport.importResult && (
          <div className="absolute z-[100] inset-0 flex items-center justify-center bg-surface-container-lowest/85 pointer-events-auto">
            <div className="rounded-2xl bg-surface-container border border-outline-variant/20 backdrop-blur-xl">
              <ImportReport
                result={globalImport.importResult}
                preCheckSummary={localPreCheckResults ?? globalImport.preCheckResults}
                jobId={globalImport.activeJob?.id ?? ''}
                onRollback={async () => {
                  if (globalImport.activeJob?.id) {
                    await globalImport.rollbackImport(globalImport.activeJob.id);
                  }
                }}
                onDone={() => {
                  localStorage.setItem('optimus:onboarding:completed', 'true');
                  setLocalPreCheckResults(null);
                  navigate('/');
                }}
              />
            </div>
          </div>
        )}

        {/* Completion phase controller + CTAs */}
        {phase === 'complete' && globalImport.status === 'idle' && (
          <div className="pointer-events-auto">
            <CompletionOverlay onPhaseChange={handleCompletionPhase} />

            {completionPhase === 'done' && (
              <div className="absolute z-30 inset-0 flex items-center justify-center bg-surface-container-lowest/85">
                <div className="max-w-md w-full mx-4 p-6 rounded-2xl bg-surface-container border border-outline-variant/20 backdrop-blur-xl">
                  <SourceSummaryList
                    sources={sources.filter(s => s.selected)}
                    onRetrySource={(id) => retrySource(id)}
                    onAddMoreSources={handleAddMoreSources}
                  />
                </div>
              </div>
            )}

            <CompletionCTAs
              visible={showCTAs}
              onGoToCommandCenter={() => navigate('/')}
              onViewLibrary={() => navigate('/library')}
              onAddMoreSources={handleAddMoreSources}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OnboardingPage - Wraps content in provider
// ---------------------------------------------------------------------------

export function OnboardingPage() {
  return (
    <OnboardingProvider>
      <OnboardingContent />
    </OnboardingProvider>
  );
}

export default OnboardingPage;
