/**
 * DeployJobContext — global state for active pack deploy jobs.
 * Mounted at the app root so the progress panel persists across navigation.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { DeployJobProgressPanel } from '../components/packs/DeployJobProgressPanel';
import { getActiveJobs } from '../lib/packDeployJobService';

interface DeployJobContextValue {
  activeJobId: string | null;
  setActiveJob: (jobId: string) => void;
  clearActiveJob: () => void;
}

const DeployJobContext = createContext<DeployJobContextValue | null>(null);

export const useDeployJob = () => {
  const ctx = useContext(DeployJobContext);
  if (!ctx) throw new Error('useDeployJob must be used within DeployJobProvider');
  return ctx;
};

export const DeployJobProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeJobId, setActiveJobIdState] = useState<string | null>(null);

  const setActiveJob = useCallback((jobId: string) => {
    setActiveJobIdState(jobId);
  }, []);

  const clearActiveJob = useCallback(() => {
    setActiveJobIdState(null);
  }, []);

  // On mount, resume showing any active job from a previous session
  useEffect(() => {
    const resume = async () => {
      try {
        const jobs = await getActiveJobs();
        if (jobs.length > 0) {
          setActiveJobIdState(jobs[0].id);
        }
      } catch (err) {
        // Non-fatal — user just won't see their in-progress deploy
        console.warn('Could not resume deploy job:', err);
      }
    };
    resume();
  }, []);

  return (
    <DeployJobContext.Provider value={{ activeJobId, setActiveJob, clearActiveJob }}>
      {children}
      {activeJobId && <DeployJobProgressPanel jobId={activeJobId} onDismiss={clearActiveJob} />}
    </DeployJobContext.Provider>
  );
};
