import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Icon } from './Icon';
import { Detection } from '../types';
import { LIBRARY_LABELS_SHORT } from '../types/detection';
import { MITREQueryService } from '@/lib/mitre/services';
import { supabase } from '../lib/supabaseClient';
import { ROUTES, routeHelpers } from '../router/routes';

interface GlobalSearchProps {
  detections: Detection[];
  onNavigate: (type: 'detection' | 'group' | 'software' | 'campaign' | 'technique', id: string) => void;
}

interface SearchResults {
  detections: Detection[];
  techniques: any[];
  groups: any[];
  software: any[];
  campaigns: any[];
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ detections, onNavigate }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>({ detections: [], techniques: [], groups: [], software: [], campaigns: [] });
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const mitreService = useRef(new MITREQueryService(supabase));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const performSearch = async () => {
      if (!query.trim()) {
        setResults({ detections: [], techniques: [], groups: [], software: [], campaigns: [] });
        return;
      }

      setIsLoading(true);
      const lowerQuery = query.toLowerCase();

      // Local Detection Search
      const matchedDetections = detections.filter(d => 
        d.name.toLowerCase().includes(lowerQuery) ||
        d.id.toLowerCase().includes(lowerQuery) ||
        d.mitreAttackIds.some(id => id.toLowerCase().includes(lowerQuery)) ||
        d.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      ).slice(0, 5);

      // Remote MITRE Search
      try {
        const mitreResults = await mitreService.current.search(query);
        setResults({
          detections: matchedDetections,
          techniques: mitreResults.techniques,
          groups: mitreResults.groups,
          software: mitreResults.software,
          campaigns: mitreResults.campaigns
        });
      } catch (error) {
        console.error("Search failed", error);
        // Fallback to just detections if MITRE search fails
        setResults({ detections: matchedDetections, techniques: [], groups: [], software: [], campaigns: [] });
      } finally {
        setIsLoading(false);
      }
    };

    const debounce = setTimeout(performSearch, 300);
    return () => clearTimeout(debounce);
  }, [query, detections]);

  const getResultUrl = (type: 'detection' | 'group' | 'software' | 'campaign' | 'technique', id: string): string => {
    switch (type) {
      case 'detection': return routeHelpers.detectionDetail(id);
      case 'group': return routeHelpers.groupDetail(id);
      case 'software': return routeHelpers.softwareDetail(id);
      case 'campaign': return routeHelpers.campaignDetail(id);
      case 'technique': return routeHelpers.libraryWithFilter(id);
    }
  };

  const handleSelect = (type: 'detection' | 'group' | 'software' | 'campaign' | 'technique', id: string) => {
    setIsOpen(false);
    setQuery('');
    onNavigate(type, id);
  };

  const handleGoToSearchPage = () => {
    if (query.trim()) {
      navigate(`${ROUTES.SEARCH}?q=${encodeURIComponent(query.trim())}`);
      setIsOpen(false);
      setQuery('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleGoToSearchPage();
    }
  };

  const hasResults = Object.values(results).some((arr: any) => arr.length > 0);

  // Helper to determine library type
  const getLibraryInfo = (detection: Detection) => {
    const isUniversal = detection.library_type === 'universal';
    return {
      icon: isUniversal ? 'globe' : 'user',
      label: LIBRARY_LABELS_SHORT[detection.library_type as 'universal' | 'user'] ?? (isUniversal ? 'Production' : 'Detection Lab'),
      className: isUniversal 
        ? 'text-blue-500 dark:text-blue-400' 
        : 'text-tertiary'
    };
  };

  return (
    <div className="relative w-full max-w-2xl group z-50" ref={searchRef}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
          <Icon name="search" className={`w-5 h-5 transition-colors ${isOpen ? 'text-primary' : 'text-on-surface-variant'}`} />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search detections, TTPs, groups, software..."
          className="w-full bg-surface-container-high border-none rounded-full pl-14 pr-12 py-3.5 text-on-surface placeholder-on-surface-variant focus:ring-2 focus:ring-primary focus:bg-surface-container-highest transition-all shadow-sm hover:shadow-md focus:shadow-none outline-none"
        />
        {isLoading && (
          <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
            <Icon name="spinner" className="w-5 h-5 text-primary animate-spin" />
          </div>
        )}
      </div>

      {isOpen && query.trim() && (
        <div className="absolute top-full left-0 w-full mt-2 bg-surface-container-high rounded-2xl shadow-2xl border border-outline-variant/20 overflow-hidden max-h-[80vh] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
          {!hasResults && !isLoading ? (
            <div className="p-8 text-center text-on-surface-variant">
              <p>No results found for "{query}"</p>
            </div>
          ) : (
            <div className="py-2">
              {/* Detections Section */}
              {results.detections.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-xs font-bold text-on-surface-variant uppercase tracking-wider bg-surface-container/50">
                    Local Detections
                  </div>
                  {results.detections.map(d => {
                    const libraryInfo = getLibraryInfo(d);
                    return (
                      <Link
                        key={d.id}
                        to={getResultUrl('detection', d.id)}
                        onClick={(e) => { if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) handleSelect('detection', d.id); }}
                        className="flex items-center gap-4 px-4 py-3 hover:bg-surface-variant cursor-pointer transition-colors group no-underline text-inherit"
                      >
                        <div className="p-2 rounded-lg bg-primary-container/20 text-primary group-hover:bg-primary-container group-hover:text-on-primary-container transition-colors">
                          <Icon name="shield-check" className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-on-surface truncate">{d.name}</h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs font-mono text-primary opacity-80">#{d.id.substring(0,8)}</span>
                            <span className="text-xs text-on-surface-variant truncate">{d.severity}</span>
                          </div>
                        </div>
                        {/* Library Type Icon - Right Aligned */}
                        <div className={`flex items-center gap-1.5 ${libraryInfo.className}`} title={libraryInfo.label}>
                          <Icon name={libraryInfo.icon} className="w-4 h-4" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* Groups Section */}
              {results.groups.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-xs font-bold text-on-surface-variant uppercase tracking-wider bg-surface-container/50 border-t border-outline-variant/10">
                    Threat Groups
                  </div>
                  {results.groups.map(g => (
                    <Link
                      key={g.id}
                      to={getResultUrl('group', g.mitre_id)}
                      onClick={(e) => { if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) handleSelect('group', g.mitre_id); }}
                      className="flex items-center gap-4 px-4 py-3 hover:bg-surface-variant cursor-pointer transition-colors group no-underline text-inherit"
                    >
                      <div className="p-2 rounded-lg bg-tertiary-container/20 text-tertiary group-hover:bg-tertiary-container group-hover:text-on-tertiary-container transition-colors">
                        <Icon name="users" className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-on-surface">{g.name}</h4>
                        <span className="text-xs font-mono text-tertiary">{g.mitre_id}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* Software Section */}
              {results.software.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-xs font-bold text-on-surface-variant uppercase tracking-wider bg-surface-container/50 border-t border-outline-variant/10">
                    Software & Tools
                  </div>
                  {results.software.map(s => (
                    <Link
                      key={s.id}
                      to={getResultUrl('software', s.mitre_id)}
                      onClick={(e) => { if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) handleSelect('software', s.mitre_id); }}
                      className="flex items-center gap-4 px-4 py-3 hover:bg-surface-variant cursor-pointer transition-colors group no-underline text-inherit"
                    >
                      <div className="p-2 rounded-lg bg-secondary-container/20 text-secondary group-hover:bg-secondary-container group-hover:text-on-secondary-container transition-colors">
                        <Icon name="package" className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-on-surface">{s.name}</h4>
                        <span className="text-xs font-mono text-secondary">{s.mitre_id}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* Campaigns Section */}
              {results.campaigns.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-xs font-bold text-on-surface-variant uppercase tracking-wider bg-surface-container/50 border-t border-outline-variant/10">
                    Campaigns
                  </div>
                  {results.campaigns.map(c => (
                    <Link
                      key={c.id}
                      to={getResultUrl('campaign', c.mitre_id)}
                      onClick={(e) => { if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) handleSelect('campaign', c.mitre_id); }}
                      className="flex items-center gap-4 px-4 py-3 hover:bg-surface-variant cursor-pointer transition-colors group no-underline text-inherit"
                    >
                      <div className="p-2 rounded-lg bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 group-hover:bg-yellow-500/30 transition-colors">
                        <Icon name="flag" className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-on-surface">{c.name}</h4>
                        <span className="text-xs font-mono text-yellow-600 dark:text-yellow-400">{c.mitre_id}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* Techniques Section */}
              {results.techniques.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-xs font-bold text-on-surface-variant uppercase tracking-wider bg-surface-container/50 border-t border-outline-variant/10">
                    Techniques
                  </div>
                  {results.techniques.map(t => (
                    <Link
                      key={t.id}
                      to={getResultUrl('technique', t.mitre_id)}
                      onClick={(e) => { if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) handleSelect('technique', t.mitre_id); }}
                      className="flex items-center gap-4 px-4 py-3 hover:bg-surface-variant cursor-pointer transition-colors group no-underline text-inherit"
                    >
                      <div className="p-2 rounded-lg bg-surface-container text-on-surface-variant group-hover:bg-surface-container-highest group-hover:text-on-surface transition-colors">
                        <Icon name="matrix" className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-on-surface">{t.name}</h4>
                        <span className="text-xs font-mono text-on-surface-variant">{t.mitre_id}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* See all results footer */}
          {query.trim() && (
            <Link
              to={`${ROUTES.SEARCH}?q=${encodeURIComponent(query.trim())}`}
              onClick={(e) => { if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) handleGoToSearchPage(); }}
              className="block no-underline px-4 py-3 text-sm text-primary font-medium hover:bg-surface-variant cursor-pointer transition-colors border-t border-outline-variant/10 flex items-center gap-2"
            >
              <Icon name="search" className="w-4 h-4" />
              <span>See all results for "{query}"</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
};
