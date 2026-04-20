import React, { useState, useMemo, useEffect } from 'react';
import { Icon } from '../Icon';
import { Detection, LibraryType } from '../../types';
import { supabase } from '../../lib/supabaseClient';

interface AddDetectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (detectionIds: string[]) => Promise<void>;
  existingDetectionIds: string[];
  packName: string;
}

type SortField = 'name' | 'severity' | 'status' | 'updatedDate';
type SortDirection = 'asc' | 'desc';

const SEVERITY_ORDER: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1, Informational: 0 };
const STATUS_ORDER: Record<string, number> = { Production: 6, Testing: 5, Review: 4, Development: 3, Draft: 2, Backlog: 1, Deprecated: 0 };

const LibraryBadge: React.FC<{ libraryType: LibraryType }> = ({ libraryType }) => {
  if (libraryType === 'production') return null;
  return (
    <span
      role="img"
      aria-label="Development library detection — will not deploy to SIEM until promoted to Production"
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wide"
      title="Development library — won't deploy to SIEM until promoted to Production"
    >
      Lab
    </span>
  );
};

export const AddDetectionsModal: React.FC<AddDetectionsModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  existingDetectionIds,
  packName,
}) => {
  const [allDetections, setAllDetections] = useState<Detection[]>([]);
  const [isLoadingDetections, setIsLoadingDetections] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [technologyFilter, setTechnologyFilter] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch all detections when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds(new Set());
    setSearch('');
    const fetchAll = async () => {
      setIsLoadingDetections(true);
      try {
        const { data, error } = await supabase
          .from('detections')
          .select('id, name, status, severity, technology, queryLanguage, mitreAttackIds, platforms, library_type')
          .order('name');
        if (!error && data) {
          setAllDetections(data as Detection[]);
        }
      } catch (err) {
        console.error('Failed to fetch detections for pack:', err);
      } finally {
        setIsLoadingDetections(false);
      }
    };
    fetchAll();
  }, [isOpen]);

  // Filter out already-added detections and apply filters
  const availableDetections = useMemo(() => {
    const existingSet = new Set(existingDetectionIds || []);
    
    return allDetections
      .filter(d => !existingSet.has(d.id))
      .filter(d => {
        if (search) {
          const searchLower = search.toLowerCase();
          const matchesName = d.name.toLowerCase().includes(searchLower);
          const matchesId = d.id.toLowerCase().includes(searchLower);
          const matchesMitre = (d.mitreAttackIds || []).some(id => id.toLowerCase().includes(searchLower));
          if (!matchesName && !matchesId && !matchesMitre) return false;
        }
        if (severityFilter && d.severity !== severityFilter) return false;
        if (statusFilter && d.status !== statusFilter) return false;
        if (technologyFilter && d.technology !== technologyFilter) return false;
        return true;
      })
      .sort((a, b) => {
        let comparison = 0;
        switch (sortField) {
          case 'name':
            comparison = a.name.localeCompare(b.name);
            break;
          case 'severity':
            comparison = (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0);
            break;
          case 'status':
            comparison = (STATUS_ORDER[b.status] || 0) - (STATUS_ORDER[a.status] || 0);
            break;
          case 'updatedDate':
            comparison = new Date(b.updatedDate).getTime() - new Date(a.updatedDate).getTime();
            break;
        }
        return sortDirection === 'asc' ? comparison : -comparison;
      });
  }, [allDetections, existingDetectionIds, search, severityFilter, statusFilter, technologyFilter, sortField, sortDirection]);

  const selectedLabCount = useMemo(() => {
    return allDetections.filter(d => selectedIds.has(d.id) && d.library_type !== 'production').length;
  }, [allDetections, selectedIds]);

  // Extract unique values for filters
  const filterOptions = useMemo(() => {
    const severities = new Set<string>();
    const statuses = new Set<string>();
    const technologies = new Set<string>();
    
    allDetections.forEach(d => {
      if (d?.severity) severities.add(d.severity);
      if (d?.status) statuses.add(d.status);
      if (d?.technology) technologies.add(d.technology);
    });

    return {
      severities: Array.from(severities).sort((a, b) => (SEVERITY_ORDER[b] || 0) - (SEVERITY_ORDER[a] || 0)),
      statuses: Array.from(statuses).sort((a, b) => (STATUS_ORDER[b] || 0) - (STATUS_ORDER[a] || 0)),
      technologies: Array.from(technologies).sort(),
    };
  }, [allDetections]);

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === availableDetections.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(availableDetections.map(d => d.id)));
    }
  };

  const handleSubmit = async () => {
    if (selectedIds.size === 0) return;
    
    setIsSubmitting(true);
    try {
      await onSubmit(Array.from(selectedIds));
      onClose();
    } catch (error) {
      console.error('Failed to add detections:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSeverityColor = (severity: string): string => {
    const colors: Record<string, string> = {
      Critical: 'bg-error/10 text-error border-error/20',
      High: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      Medium: 'bg-warning/10 text-warning border-warning/20',
      Low: 'bg-primary/10 text-primary border-primary/20',
      Informational: 'bg-on-surface-variant/10 text-on-surface-variant border-on-surface-variant/20',
    };
    return colors[severity] || colors.Informational;
  };

  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      Production: 'bg-tertiary/10 text-tertiary',
      Testing: 'bg-secondary/10 text-secondary',
      Review: 'bg-primary/10 text-primary',
      Development: 'bg-warning/10 text-warning',
      Draft: 'bg-on-surface-variant/10 text-on-surface-variant',
      Backlog: 'bg-on-surface-variant/5 text-on-surface-variant/60',
      Deprecated: 'bg-error/10 text-error',
    };
    return colors[status] || colors.Draft;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-4xl max-h-[85vh] bg-surface-container rounded-2xl shadow-2xl border border-outline-variant/20 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-outline-variant/20">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-on-surface">Add Detections</h2>
              <p className="text-sm text-on-surface-variant">Adding to <span className="font-medium text-tertiary">{packName}</span></p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              <Icon name="x" className="w-5 h-5" />
            </button>
          </div>

          {/* Filters */}
          <div className="mt-4 flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search detections..."
                className="w-full pl-10 pr-4 py-2.5 bg-surface-container-high border border-outline-variant/30 rounded-lg text-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary"
              />
            </div>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-3 py-2.5 bg-surface-container-high border border-outline-variant/30 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary"
            >
              <option value="">All Severities</option>
              {filterOptions.severities.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 bg-surface-container-high border border-outline-variant/30 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary"
            >
              <option value="">All Statuses</option>
              {filterOptions.statuses.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={technologyFilter}
              onChange={(e) => setTechnologyFilter(e.target.value)}
              className="px-3 py-2.5 bg-surface-container-high border border-outline-variant/30 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary"
            >
              <option value="">All Technologies</option>
              {filterOptions.technologies.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Select All Bar */}
        <div className="flex-shrink-0 px-6 py-2.5 bg-surface-container-high/50 border-b border-outline-variant/10 flex items-center justify-between">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.size > 0 && selectedIds.size === availableDetections.length}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary/20"
            />
            <span className="text-sm text-on-surface-variant">
              {selectedIds.size > 0 ? (
                <span className="text-on-surface font-medium">{selectedIds.size} selected</span>
              ) : (
                `Select all (${availableDetections.length})`
              )}
            </span>
          </label>
          {selectedIds.size > 0 && (
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-primary hover:text-primary/80"
            >
              Clear selection
            </button>
          )}
        </div>

        {/* Detection List */}
        <div className="flex-1 overflow-y-auto">
          {isLoadingDetections ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Icon name="spinner" className="w-8 h-8 text-primary animate-spin mb-3" />
              <p className="text-on-surface-variant font-medium">Loading detections...</p>
            </div>
          ) : availableDetections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Icon name="inbox" className="w-12 h-12 text-on-surface-variant/30 mb-3" />
              <p className="text-on-surface-variant font-medium">No detections available</p>
              <p className="text-sm text-on-surface-variant/60 mt-1">
                {search || severityFilter || statusFilter || technologyFilter 
                  ? 'Try adjusting your filters'
                  : 'All detections are already in this pack'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-outline-variant/10">
              {availableDetections.map(detection => (
                <div
                  key={detection.id}
                  onClick={() => toggleSelection(detection.id)}
                  className={`px-6 py-3 flex items-center gap-4 cursor-pointer transition-colors ${
                    selectedIds.has(detection.id) 
                      ? 'bg-primary/5' 
                      : 'hover:bg-surface-container-high/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(detection.id)}
                    onChange={() => toggleSelection(detection.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary/20"
                  />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-on-surface truncate">{detection.name}</span>
                      <LibraryBadge libraryType={detection.library_type} />
                      {(detection.mitreAttackIds || []).slice(0, 2).map(id => (
                        <span key={id} className="px-1.5 py-0.5 text-[10px] font-mono bg-primary/10 text-primary rounded">
                          {id}
                        </span>
                      ))}
                      {(detection.mitreAttackIds || []).length > 2 && (
                        <span className="text-[10px] text-on-surface-variant/50">
                          +{(detection.mitreAttackIds || []).length - 2}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-on-surface-variant/60 mt-0.5">
                      {detection.technology} • {detection.queryLanguage}
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded border ${getSeverityColor(detection.severity)}`}>
                    {detection.severity}
                  </span>

                  <span className={`px-2 py-0.5 text-[10px] font-medium rounded ${getStatusColor(detection.status)}`}>
                    {detection.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedLabCount > 0 && (
          <div className="mx-6 mb-3 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
            <Icon name="alert-triangle" className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200">
              <span className="font-semibold">{selectedLabCount}</span> selected detection{selectedLabCount !== 1 ? 's are' : ' is'} in the Development library
              and won't deploy to SIEM until promoted to Production.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-outline-variant/20 flex items-center justify-between bg-surface-container">
          <span className="text-sm text-on-surface-variant">
            {availableDetections.length} detection{availableDetections.length !== 1 ? 's' : ''} available
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={selectedIds.size === 0 || isSubmitting}
              className="px-6 py-2.5 bg-tertiary text-on-tertiary text-sm font-semibold rounded-xl hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-tertiary/20 flex items-center gap-2"
            >
              {isSubmitting ? (
                <Icon name="spinner" className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Icon name="plus" className="w-4 h-4" />
                  Add {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddDetectionsModal;