import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Playbook, PlaybookRun, PlaybookStepResult } from '../lib/playbooks/types';

/**
 * Hook to manage playbook execution state and run playbooks via the edge function.
 */
export function usePlaybookRunner() {
  const [run, setRun] = useState<PlaybookRun | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const executePlaybook = useCallback(async (
    playbook: Playbook,
    inputs: Record<string, string> = {}
  ) => {
    const runId = crypto.randomUUID();

    // Initialize run state
    const initialRun: PlaybookRun = {
      id: runId,
      playbookId: playbook.id,
      status: 'running',
      inputs,
      stepResults: {},
      context: {},
      generatedSections: {},
      startedAt: new Date().toISOString(),
    };

    // Mark all steps as pending
    for (const step of playbook.steps) {
      initialRun.stepResults[step.id] = {
        stepId: step.id,
        status: 'pending',
      };
    }

    setRun(initialRun);
    setIsRunning(true);

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      // Mark steps as running
      const runningRun = { ...initialRun };
      for (const step of playbook.steps) {
        runningRun.stepResults[step.id] = { stepId: step.id, status: 'running' };
      }
      setRun({ ...runningRun });

      // Call the run-playbook edge function
      const response = await fetch(`${supabaseUrl}/functions/v1/run-playbook`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playbookId: playbook.id,
          inputs,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Playbook execution failed: ${errorText}`);
      }

      const result = await response.json();

      // Map results back to run state
      // 'partial' means some steps succeeded - still show the report
      const runStatus = (result.status === 'completed' || result.status === 'partial') ? 'completed' : 'error';
      const completedRun: PlaybookRun = {
        ...runningRun,
        status: runStatus,
        stepResults: {},
        context: result.context || {},
        generatedSections: result.generatedSections || {},
        completedAt: result.completedAt,
        error: result.status === 'partial' ? 'Some steps failed but results are available' : undefined,
      };

      for (const stepResult of (result.stepResults || [])) {
        completedRun.stepResults[stepResult.stepId] = {
          stepId: stepResult.stepId,
          status: stepResult.status === 'completed' ? 'completed' : 'error',
          data: stepResult.data,
          error: stepResult.error,
          completedAt: new Date().toISOString(),
        };
      }

      setRun(completedRun);
      return completedRun;
    } catch (err: any) {
      const errorRun: PlaybookRun = {
        ...initialRun,
        status: 'error',
        error: err.message || 'Playbook execution failed',
        completedAt: new Date().toISOString(),
      };
      setRun(errorRun);
      return errorRun;
    } finally {
      setIsRunning(false);
    }
  }, []);

  const reset = useCallback(() => {
    setRun(null);
    setIsRunning(false);
  }, []);

  return {
    run,
    isRunning,
    executePlaybook,
    reset,
  };
}
