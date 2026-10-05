import { useState, useEffect } from 'react';
import { MITREQueryService } from '@/lib/mitre/services';
import { supabase } from '../lib/supabaseClient';
import { MitreObject } from '@/types/mitre-stix';
import { toError } from '../lib/errors';

// Define a type that includes platforms, as returned by the service
export type ExtendedMitreObject = MitreObject & { platforms: string[] };

interface MitreMatrixHook {
  tactics: { name: string; shortname: string }[];
  version: string | null;
  techniques: ExtendedMitreObject[];
  loading: boolean;
  error: Error | null;
}

export function useMitreMatrix(): MitreMatrixHook {
  const [techniques, setTechniques] = useState<ExtendedMitreObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [definition, setDefinition] = useState<{
    version: string | null;
    tactics: { name: string; shortname: string }[];
  }>({ version: null, tactics: [] });

  useEffect(() => {
    loadTechniques();
  }, []);

  async function loadTechniques() {
    setLoading(true);
    setError(null);

    try {
      const queryService = new MITREQueryService(supabase);
      // Fetch ALL techniques. Filtering is done in the UI component.
      const [allTechniques, matrixDefinition] = await Promise.all([
        queryService.getAllTechniques(),
        queryService.getMatrixDefinition(),
      ]);

      // Sort techniques by ID to ensure parent/sub-technique order (e.g., T1059, T1059.001)
      const sortedTechniques = allTechniques.sort((a, b) => {
        const idA = a.mitre_id || '';
        const idB = b.mitre_id || '';
        return idA.localeCompare(idB);
      });

      setTechniques(sortedTechniques);
      setDefinition(matrixDefinition);
    } catch (err) {
      setError(toError(err));
      console.error('Failed to load MITRE techniques:', err);
    } finally {
      setLoading(false);
    }
  }

  return {
    tactics: definition.tactics,
    version: definition.version,
    techniques, // Return raw list, component handles grouping
    loading,
    error,
  };
}
