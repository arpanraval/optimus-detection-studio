/**
 * Scoring Context
 *
 * Provides active quality scoring weights to the entire app.
 * Wraps useScoringProfile and exposes activeWeights via context
 * so any component can score detections with the current profile.
 */

import React, { createContext, useContext } from 'react';
import { useScoringProfile, ScoringProfile } from '../hooks/useScoringProfile';
import { QualityWeights, DEFAULT_WEIGHTS } from '../lib/quality';

interface ScoringContextValue {
  /** The currently active weights for scoring */
  activeWeights: QualityWeights;
  /** The currently active scoring profile (null if using defaults) */
  activeProfile: ScoringProfile | null;
  /** All available profiles */
  profiles: ScoringProfile[];
  /** Whether profiles are loading */
  isLoading: boolean;
  /** Any error from fetching profiles */
  error: string | null;
  /** CRUD operations */
  createProfile: (data: { name: string; description?: string; team_id?: string | null; is_default?: boolean; weights: QualityWeights }) => Promise<ScoringProfile | null>;
  updateProfile: (id: string, data: { name?: string; description?: string; is_default?: boolean; weights?: QualityWeights }) => Promise<boolean>;
  deleteProfile: (id: string) => Promise<boolean>;
  /** Switch active profile by ID */
  setActiveProfile: (id: string) => void;
  /** Refresh profiles from DB */
  refresh: () => Promise<void>;
}

const ScoringContext = createContext<ScoringContextValue>({
  activeWeights: DEFAULT_WEIGHTS,
  activeProfile: null,
  profiles: [],
  isLoading: false,
  error: null,
  createProfile: async () => null,
  updateProfile: async () => false,
  deleteProfile: async () => false,
  setActiveProfile: () => {},
  refresh: async () => {},
});

export const useScoring = () => useContext(ScoringContext);

interface ScoringProviderProps {
  children: React.ReactNode;
  teamId?: string | null;
}

export const ScoringProvider: React.FC<ScoringProviderProps> = ({ children, teamId }) => {
  const scoring = useScoringProfile(teamId);

  return (
    <ScoringContext.Provider value={scoring}>
      {children}
    </ScoringContext.Provider>
  );
};
