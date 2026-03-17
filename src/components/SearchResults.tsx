import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Icon } from './Icon';
import { Detection } from '../types';
import { MITREQueryService } from '@/lib/mitre/services';
import { supabase } from '../lib/supabaseClient';
import { useAppData } from '../router/AppDataContext';
import { routeHelpers, ROUTES } from '../router/routes';

interface SearchResultsProps {
  query: string;
}

interface Results {
  detections: Detection[];
  techniques: any[];
  groups: any[];
  software: any[];
  campaigns: any[];
}

export const SearchResults: React.FC<SearchResultsProps> = ({ query: initialQuery }) => {
  const navigate = useNavigate();
  const { detections } = useAppData();
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [results, setResults] = useState<Results>({ detections: [], techniques: [], groups: [], software: [], campaigns: [] });
  const [isLoading, setIsLoading] = useState(false);
  const mitreService = useRef(new MITREQueryService(supabase));

  useEffect(() => {
    setSearchQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const performSearch = async () => {
      if (!searchQuery.trim()) {
        setResults({ detections: [], techniques: [], groups: [], software: [], campaigns: [] });
        return;
      }

      setIsLoading(true);
      const lowerQuery = searchQuery.toLowerCase();

      const matchedDetections = detections.filter(d =>
        d.name.toLowerCase().includes(lowerQuery) ||
        d.id.toLowerCase().includes(lowerQuery) ||
        d.mitreAttackIds.some(id => id.toLowerCase().includes(lowerQuery)) ||
        d.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      ).slice(0, 50);

      try {
        const mitreResults = await mitreService.current.search(searchQuery);
        setResults({
          detections: matchedDetections,
          techniques: mitreResults.techniques,
          groups: mitreResults.groups,
          software: mitreResults.software,
          campaigns: mitreResults.campaigns
        });
      } catch (error) {
        console.error('Search failed', error);
        setResults({ detections: matchedDetections, techniques: [], groups: [], software: [], campaigns: [] });
      } finally {
        setIsLoading(false);
      }
    };

    const debounce = setTimeout(performSearch, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, detections]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`${ROUTES.SEARCH}?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const totalResults = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);

  const getLibraryInfo = (detection: Detection) => {
    const isUniversal = detection.library_type === 'universal';
    return {
      icon: isUniversal ? 'globe' : 'user',
      label: isUniversal ? 'Universal' : 'My Library',
      className: isUniversal ? 'text-blue-500 dark:text-blue-400' : 'text-tertiary'
    };
  };

  const sections: { key: keyof Results; title: string; icon: string; iconBg: string; iconColor: string; idColor: string }[] = [
    { key: 'detections', title: 'Detections', icon: 'shield-check', iconBg: 'bg-primary-container/20', iconColor: 'text-primary', idColor: 'text-primary' },
    { key: 'groups', title: 'Threat Groups', icon: 'users', iconBg: 'bg-tertiary-container/20', iconColor: 'text-tertiary', idColor: 'text-tertiary' },
    { key: 'software', title: 'Software & Tools', icon: 'package', iconBg: 'bg-secondary-container/20', iconColor: 'text-secondary', idColor: 'text-secondary' },
    { key: 'campaigns', title: 'Campaigns', icon: 'flag', iconBg: 'bg-yellow-500/20', iconColor: 'text-yellow-600 dark:text-yellow-400', idColor: 'text-yellow-600 dark:text-yellow-400' },
    { key: 'techniques', title: 'Techniques', icon: 'matrix', iconBg: 'bg-surface-container', iconColor: 'text-on-surface-variant', idColor: 'text-on-surface-variant' },
  ];

  const getResultUrl = (type: keyof Results, item: any): string => {
    switch (type) {
      case 'detections': return routeHelpers.detectionDetail(item.id);
      case 'groups': return routeHelpers.groupDetail(item.mitre_id);
      case 'software': return routeHelpers.softwareDetail(item.mitre_id);
      case 'campaigns': return routeHelpers.campaignDetail(item.mitre_id);
      case 'techniques': return routeHelpers.libraryWithFilter(item.mitre_id);
    }
  };

  // "View all" links for each category
  const getCategoryViewAllUrl = (key: keyof Results): string | null => {
    switch (key) {
      case 'detections': return `${ROUTES.LIBRARY}?search=${encodeURIComponent(searchQuery)}`;
      case 'groups': return ROUTES.GROUPS;
      case 'software': return ROUTES.SOFTWARE;
      case 'campaigns': return ROUTES.CAMPAIGNS;
      case 'techniques': return ROUTES.MITRE_MATRIX;
      default: return null;
    }
  };

  const getCategoryViewAllLabel = (key: keyof Results): string => {
    switch (key) {
      case 'detections': return 'View all detections';
      case 'groups': return 'View all groups';
      case 'software': return 'View all software';
      case 'campaigns': return 'View all campaigns';
      case 'techniques': return 'View all techniques';
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Search input */}
      <form onSubmit={handleSearchSubmit} className="mb-8">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
            <Icon name="search" className="w-5 h-5 text-on-surface-variant" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search detections, TTPs, groups, software..."
            className="w-full bg-surface-container-high border-none rounded-full pl-14 pr-6 py-3.5 text-on-surface placeholder-on-surface-variant focus:ring-2 focus:ring-primary focus:bg-surface-container-highest transition-all shadow-sm outline-none"
            autoFocus
          />
        </div>
      </form>

      {/* Results summary */}
      {searchQuery.trim() && !isLoading && (
        <p className="text-sm text-on-surface-variant mb-6">
          {totalResults} result{totalResults !== 1 ? 's' : ''} for "{searchQuery}"
        </p>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Icon name="spinner" className="w-6 h-6 text-primary animate-spin" />
          <span className="ml-3 text-on-surface-variant">Searching...</span>
        </div>
      )}

      {/* No results */}
      {!isLoading && searchQuery.trim() && totalResults === 0 && (
        <div className="text-center py-16">
          <Icon name="search" className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-4" />
          <p className="text-on-surface-variant text-lg">No results found for "{searchQuery}"</p>
          <p className="text-on-surface-variant/60 text-sm mt-2">Try different keywords or check your spelling</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !searchQuery.trim() && (
        <div className="text-center py-16">
          <Icon name="search" className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-4" />
          <p className="text-on-surface-variant text-lg">Enter a search term to get started</p>
        </div>
      )}

      {/* Categorized results */}
      {!isLoading && sections.map(section => {
        const items = results[section.key];
        if (items.length === 0) return null;

        return (
          <div key={section.key} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className={`p-1.5 rounded-lg ${section.iconBg} ${section.iconColor}`}>
                <Icon name={section.icon} className="w-4 h-4" />
              </div>
              <h2 className="text-base font-bold text-on-surface">{section.title}</h2>
              <span className="text-xs font-medium text-on-surface-variant bg-surface-container-highest rounded-full px-2 py-0.5">
                {items.length}
              </span>
            </div>

            <div className="bg-surface-container rounded-xl border border-outline-variant/20 overflow-hidden">
              {items.map((item: any, idx: number) => {
                const isDetection = section.key === 'detections';
                const libraryInfo = isDetection ? getLibraryInfo(item as Detection) : null;
                const name = item.name;
                const subId = isDetection ? `#${item.id.substring(0, 8)}` : item.mitre_id;

                return (
                  <Link
                    key={item.id}
                    to={getResultUrl(section.key, item)}
                    className={`flex items-center gap-4 px-4 py-3 hover:bg-surface-variant cursor-pointer transition-colors group no-underline text-inherit ${
                      idx > 0 ? 'border-t border-outline-variant/10' : ''
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${section.iconBg} ${section.iconColor} group-hover:opacity-90 transition-opacity`}>
                      <Icon name={section.icon} className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-on-surface truncate">{name}</h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs font-mono ${section.idColor} opacity-80`}>{subId}</span>
                        {isDetection && (
                          <span className="text-xs text-on-surface-variant truncate">{(item as Detection).severity}</span>
                        )}
                      </div>
                    </div>
                    {libraryInfo && (
                      <div className={`flex items-center gap-1.5 ${libraryInfo.className}`} title={libraryInfo.label}>
                        <Icon name={libraryInfo.icon} className="w-4 h-4" />
                      </div>
                    )}
                    <Icon name="chevron-right" className="w-4 h-4 text-on-surface-variant/40 group-hover:text-on-surface-variant transition-colors" />
                  </Link>
                );
              })}
            </div>

            {/* View all in category link */}
            {getCategoryViewAllUrl(section.key) && (
              <Link
                to={getCategoryViewAllUrl(section.key)!}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-primary font-medium hover:bg-surface-variant/50 transition-colors no-underline mt-1"
              >
                <span>{getCategoryViewAllLabel(section.key)}</span>
                <Icon name="arrowRight" className="w-4 h-4" />
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
};
