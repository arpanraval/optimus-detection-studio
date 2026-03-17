
import { useState, useEffect } from 'react';
import { MITREQueryService } from '@/lib/mitre/services';
import { supabase } from '../lib/supabaseClient';
import { MitreObject, MITRE_TACTICS } from '@/types/mitre-stix';
import { toError } from '../lib/errors';

// Define a type that includes platforms, as returned by the service
export type ExtendedMitreObject = MitreObject & { platforms: string[] };

interface MitreMatrixHook {
  tactics: typeof MITRE_TACTICS;
  techniques: ExtendedMitreObject[];
  loading: boolean;
  error: Error | null;
}

export function useMitreMatrix(): MitreMatrixHook {
  const [techniques, setTechniques] = useState<ExtendedMitreObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    loadTechniques();
  }, []);

  async function loadTechniques() {
    setLoading(true);
    setError(null);

    try {
      const queryService = new MITREQueryService(supabase);
      // Fetch ALL techniques. Filtering is done in the UI component.
      const allTechniques = await queryService.getAllTechniques();
      
      // Sort techniques by ID to ensure parent/sub-technique order (e.g., T1059, T1059.001)
      const sortedTechniques = allTechniques.sort((a, b) => {
        const idA = a.mitre_id || '';
        const idB = b.mitre_id || '';
        return idA.localeCompare(idB);
      });

      setTechniques(sortedTechniques);
    } catch (err) {
      setError(toError(err));
      console.error('Failed to load MITRE techniques:', err);
    } finally {
      setLoading(false);
    }
  }

  return {
    tactics: MITRE_TACTICS,
    techniques, // Return raw list, component handles grouping
    loading,
    error
  };
}
