/**
 * Hook for managing scoring profiles.
 * Fetches profiles from Supabase, resolves the active profile,
 * and provides CRUD operations.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { QualityWeights, DEFAULT_WEIGHTS } from '../lib/quality';

export interface ScoringProfile {
  id: string;
  team_id: string | null;
  name: string;
  description: string | null;
  is_default: boolean;
  weights: QualityWeights;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface UseScoringProfileReturn {
  profiles: ScoringProfile[];
  activeProfile: ScoringProfile | null;
  activeWeights: QualityWeights;
  isLoading: boolean;
  error: string | null;
  createProfile: (data: CreateProfileInput) => Promise<ScoringProfile | null>;
  updateProfile: (id: string, data: UpdateProfileInput) => Promise<boolean>;
  deleteProfile: (id: string) => Promise<boolean>;
  setActiveProfile: (id: string) => void;
  refresh: () => Promise<void>;
}

interface CreateProfileInput {
  name: string;
  description?: string;
  team_id?: string | null;
  is_default?: boolean;
  weights: QualityWeights;
}

interface UpdateProfileInput {
  name?: string;
  description?: string;
  is_default?: boolean;
  weights?: QualityWeights;
}

export function useScoringProfile(teamId?: string | null): UseScoringProfileReturn {
  const [profiles, setProfiles] = useState<ScoringProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfiles = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('scoring_profiles')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setProfiles((data || []) as ScoringProfile[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch scoring profiles');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // Resolve active profile: team-specific default → global default → first profile
  const activeProfile = (() => {
    if (activeProfileId) {
      return profiles.find(p => p.id === activeProfileId) || null;
    }
    // Team-specific default
    if (teamId) {
      const teamDefault = profiles.find(p => p.team_id === teamId && p.is_default);
      if (teamDefault) return teamDefault;
    }
    // Global default
    const globalDefault = profiles.find(p => p.team_id === null && p.is_default);
    if (globalDefault) return globalDefault;
    // Fallback to first profile
    return profiles[0] || null;
  })();

  const activeWeights = activeProfile?.weights || DEFAULT_WEIGHTS;

  const createProfile = useCallback(async (data: CreateProfileInput): Promise<ScoringProfile | null> => {
    try {
      setError(null);
      const { data: result, error: createError } = await supabase
        .from('scoring_profiles')
        .insert({
          name: data.name,
          description: data.description || null,
          team_id: data.team_id || null,
          is_default: data.is_default || false,
          weights: data.weights,
        })
        .select()
        .single();

      if (createError) {
        setError(createError.message);
        return null;
      }

      await fetchProfiles();
      return result as ScoringProfile;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile');
      return null;
    }
  }, [fetchProfiles]);

  const updateProfile = useCallback(async (id: string, data: UpdateProfileInput): Promise<boolean> => {
    try {
      setError(null);
      const { error: updateError } = await supabase
        .from('scoring_profiles')
        .update(data)
        .eq('id', id);

      if (updateError) {
        setError(updateError.message);
        return false;
      }

      await fetchProfiles();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
      return false;
    }
  }, [fetchProfiles]);

  const deleteProfile = useCallback(async (id: string): Promise<boolean> => {
    try {
      setError(null);
      const { error: deleteError } = await supabase
        .from('scoring_profiles')
        .delete()
        .eq('id', id);

      if (deleteError) {
        setError(deleteError.message);
        return false;
      }

      if (activeProfileId === id) {
        setActiveProfileId(null);
      }
      await fetchProfiles();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete profile');
      return false;
    }
  }, [fetchProfiles, activeProfileId]);

  return {
    profiles,
    activeProfile,
    activeWeights,
    isLoading,
    error,
    createProfile,
    updateProfile,
    deleteProfile,
    setActiveProfile: setActiveProfileId,
    refresh: fetchProfiles,
  };
}
