import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { LibraryType } from '../constants/library';

export interface FilterOptions {
  technologies: string[];
  log_sources: string[];
  authors: string[];
  platforms: string[];
  tags: string[];
  mitre_tactics: string[];
  mitre_techniques: string[];
  threat_actors: string[];
  campaigns: string[];
  software: string[];
  cves: string[];
  /** Query languages present in the data. Empty until the RPC ships the key; the filter
   *  panel falls back to the curated list alone, so an older RPC degrades rather than breaks. */
  query_languages: string[];
}

const EMPTY_OPTIONS: FilterOptions = {
  technologies: [],
  log_sources: [],
  authors: [],
  platforms: [],
  tags: [],
  mitre_tactics: [],
  mitre_techniques: [],
  threat_actors: [],
  campaigns: [],
  software: [],
  cves: [],
  query_languages: [],
};

const optionsCache: Record<string, FilterOptions> = {};

export function useFilterOptions(libraryType: LibraryType) {
  const [options, setOptions] = useState<FilterOptions>(
    optionsCache[libraryType] || EMPTY_OPTIONS
  );
  const [loading, setLoading] = useState(!optionsCache[libraryType]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const fetchOptions = useCallback(async () => {
    if (optionsCache[libraryType]) {
      setOptions(optionsCache[libraryType]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    abortRef.current = false;

    try {
      const { data, error: rpcError } = await supabase.rpc('get_filter_options', {
        p_library_type: libraryType,
      });

      if (abortRef.current) return;

      if (rpcError) {
        setError(rpcError.message);
        setLoading(false);
        return;
      }

      const parsed: FilterOptions = {
        technologies: data?.technologies || [],
        log_sources: data?.log_sources || [],
        authors: data?.authors || [],
        platforms: data?.platforms || [],
        tags: data?.tags || [],
        mitre_tactics: data?.mitre_tactics || [],
        mitre_techniques: data?.mitre_techniques || [],
        threat_actors: data?.threat_actors || [],
        campaigns: data?.campaigns || [],
        software: data?.software || [],
        cves: data?.cves || [],
        query_languages: data?.query_languages || [],
      };

      optionsCache[libraryType] = parsed;
      setOptions(parsed);
    } catch (err) {
      if (!abortRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load filter options');
      }
    } finally {
      if (!abortRef.current) {
        setLoading(false);
      }
    }
  }, [libraryType]);

  useEffect(() => {
    fetchOptions();
    return () => {
      abortRef.current = true;
    };
  }, [fetchOptions]);

  const refresh = useCallback(() => {
    delete optionsCache[libraryType];
    fetchOptions();
  }, [libraryType, fetchOptions]);

  return { options, loading, error, refresh };
}
