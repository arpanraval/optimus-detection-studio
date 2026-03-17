
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { LinkedMitreEntity } from '../types';
import { toError } from '../lib/errors';

type EntityType = 'group' | 'software' | 'campaign' | 'technique';

interface MitreEntityOption {
  mitre_id: string;
  name: string;
  stix_id: string;
  description?: string;
  aliases?: string[];
  type?: string;  // For software: 'malware' or 'tool'
  technique_count?: number;
  tactic?: string;  // For techniques: primary tactic name
}

interface UseMitreEntityPickerResult {
  options: MitreEntityOption[];
  loading: boolean;
  error: Error | null;
  search: string;
  setSearch: (s: string) => void;
  filteredOptions: MitreEntityOption[];
}

export function useMitreEntityPicker(entityType: EntityType): UseMitreEntityPickerResult {
  const [options, setOptions] = useState<MitreEntityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadEntities();
  }, [entityType]);

  async function loadEntities() {
    setLoading(true);
    setError(null);

    try {
      let data: any[] | null = null;
      let queryError: any = null;
      
      switch (entityType) {
        case 'group': {
          const result = await supabase
            .from('mitre_objects')
            .select('mitre_id, name, stix_id, description, data')
            .eq('type', 'intrusion-set')
            .eq('deprecated', false)
            .order('name');
          
          data = result.data;
          queryError = result.error;
          
          if (data) {
            data = data.map(item => ({
              ...item,
              aliases: item.data?.aliases || [],
              technique_count: 0 // Count unavailable without view
            }));
          }
          break;
        }
          
        case 'software': {
          const result = await supabase
            .from('mitre_objects')
            .select('mitre_id, name, stix_id, description, type, data')
            .in('type', ['malware', 'tool'])
            .eq('deprecated', false)
            .order('name');
            
          data = result.data;
          queryError = result.error;

          if (data) {
            data = data.map(item => ({
              ...item,
              aliases: item.data?.aliases || [],
              technique_count: 0 // Count unavailable without view
            }));
          }
          break;
        }
          
        case 'campaign': {
          const result = await supabase
            .from('mitre_objects')
            .select('mitre_id, name, stix_id, description')
            .eq('type', 'campaign')
            .eq('deprecated', false)
            .order('name');

          data = result.data;
          queryError = result.error;
          break;
        }

        case 'technique': {
          const result = await supabase
            .from('mitre_objects')
            .select('mitre_id, name, stix_id, description, data')
            .eq('type', 'attack-pattern')
            .eq('deprecated', false)
            .order('mitre_id');

          data = result.data;
          queryError = result.error;

          if (data) {
            data = data.map(item => {
              // Extract primary tactic from kill_chain_phases
              const phases = item.data?.kill_chain_phases;
              let tactic = 'Unknown';
              if (Array.isArray(phases) && phases.length > 0) {
                tactic = phases[0].phase_name
                  ?.replace(/-/g, ' ')
                  ?.replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Unknown';
              }
              return {
                ...item,
                tactic,
                aliases: [],
              };
            });
          }
          break;
        }
      }

      if (queryError) throw queryError;
      
      setOptions(data || []);
    } catch (err) {
      setError(toError(err));
      console.error(`Failed to load ${entityType} options:`, err);
    } finally {
      setLoading(false);
    }
  }

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    
    const searchLower = search.toLowerCase();
    return options.filter(opt => 
      opt.name.toLowerCase().includes(searchLower) ||
      opt.mitre_id.toLowerCase().includes(searchLower) ||
      (opt.aliases && opt.aliases.some(a => a.toLowerCase().includes(searchLower)))
    );
  }, [options, search]);

  return {
    options,
    loading,
    error,
    search,
    setSearch,
    filteredOptions
  };
}

// Helper to convert selected options to LinkedMitreEntity
export function toLinkedEntity(option: MitreEntityOption): LinkedMitreEntity {
  return {
    mitre_id: option.mitre_id,
    name: option.name,
    stix_id: option.stix_id
  };
}
