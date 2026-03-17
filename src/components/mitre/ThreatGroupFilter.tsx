import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Icon } from '../Icon';
import { supabase } from '../../lib/supabaseClient';

export interface ThreatGroup {
  id: string;
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string | null;
  technique_count: number;
  data?: {
    aliases?: string[];
    targeting_intel?: {
      origin_country?: string;
    };
  };
}

interface ThreatGroupFilterProps {
  value?: ThreatGroup | null;
  onChange: (group?: ThreatGroup | null) => void;
}

export function ThreatGroupFilter({ value, onChange }: ThreatGroupFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [groups, setGroups] = useState<ThreatGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load groups on mount
  useEffect(() => {
    loadGroups();
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [open]);

  // Click outside to close
  useEffect(() => {
    const listener = (event: MouseEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, []);

  async function loadGroups() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('v_mitre_groups_with_stats')
        .select('id, stix_id, mitre_id, name, description, technique_count, data')
        .eq('deprecated', false)
        .eq('revoked', false)
        .gt('technique_count', 0)
        .order('technique_count', { ascending: false });

      if (error) throw error;
      setGroups(data || []);
    } catch (err) {
      console.error('Failed to load threat groups:', err);
    } finally {
      setLoading(false);
    }
  }

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const searchLower = search.toLowerCase();
    return groups.filter(g =>
      g.name.toLowerCase().includes(searchLower) ||
      g.mitre_id?.toLowerCase().includes(searchLower) ||
      g.data?.aliases?.some(a => a.toLowerCase().includes(searchLower))
    );
  }, [groups, search]);

  const getGroupOrigin = (group: ThreatGroup) => {
    return group.data?.targeting_intel?.origin_country;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
          open || value
            ? 'bg-tertiary-container text-on-tertiary-container'
            : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
        }`}
      >
        <Icon name="group" className="w-4 h-4" />
        <span className="hidden md:inline max-w-[140px] truncate">
          {value ? value.name : 'All Threat Actors'}
        </span>
        <Icon name="chevron-down" className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-surface-container-high border border-outline-variant rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Search Input */}
          <div className="p-3 border-b border-outline-variant/30">
            <div className="relative">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search threat actors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-surface-container text-on-surface placeholder-on-surface-variant/50 rounded-lg text-sm border border-outline-variant/30 focus:outline-none focus:ring-2 focus:ring-tertiary/30"
              />
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-80 overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-on-surface-variant">
                <Icon name="spinner" className="w-5 h-5 animate-spin" />
              </div>
            ) : (
              <div className="space-y-1">
                {/* All Groups Option */}
                <button
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                    !value ? 'bg-tertiary-container text-on-tertiary-container' : 'text-on-surface hover:bg-surface-container-highest'
                  }`}
                >
                  <span>All Threat Actors</span>
                  {!value && <Icon name="spark" className="w-3 h-3" />}
                </button>

                <div className="h-px bg-outline-variant/30 my-2"></div>

                {/* Group Options */}
                {filteredGroups.length === 0 ? (
                  <div className="text-center py-4 text-on-surface-variant text-sm">
                    No threat actors found
                  </div>
                ) : (
                  filteredGroups.map(group => {
                    const origin = getGroupOrigin(group);
                    return (
                      <button
                        key={group.stix_id}
                        onClick={() => {
                          onChange(group);
                          setOpen(false);
                          setSearch('');
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                          value?.stix_id === group.stix_id
                            ? 'bg-tertiary-container text-on-tertiary-container'
                            : 'text-on-surface hover:bg-surface-container-highest'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium truncate">{group.name}</span>
                            <span className="text-[10px] text-on-surface-variant/70 font-mono shrink-0">
                              {group.mitre_id}
                            </span>
                          </div>
                          {value?.stix_id === group.stix_id && (
                            <Icon name="spark" className="w-3 h-3 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-on-surface-variant/70">
                          <span>{group.technique_count} techniques</span>
                          {origin && (
                            <>
                              <span className="text-outline-variant">|</span>
                              <span>{origin}</span>
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-outline-variant/30 bg-surface-container-low">
            <span className="text-[10px] text-on-surface-variant">
              {groups.length} threat actors with known techniques
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
