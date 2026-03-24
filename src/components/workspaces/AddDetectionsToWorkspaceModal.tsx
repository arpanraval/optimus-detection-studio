import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../Icon';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabaseClient';
import { Detection } from '../../types';
import { LIBRARY_DEVELOPMENT } from '../../constants/library';

interface AddDetectionsToWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddDetectionsToWorkspaceModal: React.FC<AddDetectionsToWorkspaceModalProps> = ({ isOpen, onClose }) => {
  const { addDetections, workspaceDetections, currentWorkspace } = useWorkspace();
  const [detections, setDetections] = useState<Detection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // IDs already in workspace
  const existingIds = useMemo(() => 
    new Set(workspaceDetections.map(wd => wd.detection_id)), 
    [workspaceDetections]
  );

  // Fetch Universal Library detections
  useEffect(() => {
    if (!isOpen) return;
    
    const fetchDetections = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('detections')
          .select('*')
          .eq('library_type', LIBRARY_DEVELOPMENT)
          .order('name');
        
        if (!error && data) {
          setDetections(data);
        }
      } catch (err) {
        console.error('Error fetching detections:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDetections();
  }, [isOpen]);

  // Reset selection when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelected(new Set());
      setSearchQuery('');
    }
  }, [isOpen]);

  // Filter detections
  const filteredDetections = useMemo(() => {
    return detections.filter(d => {
      // Exclude already added
      if (existingIds.has(d.id)) return false;
      
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          d.name?.toLowerCase().includes(query) ||
          d.description?.toLowerCase().includes(query) ||
          d.queryLanguage?.toLowerCase().includes(query) ||
          d.technology?.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [detections, existingIds, searchQuery]);

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const selectAll = () => {
    const newSelected = new Set(filteredDetections.map(d => d.id));
    setSelected(newSelected);
  };

  const clearSelection = () => {
    setSelected(new Set());
  };

  const handleAdd = async () => {
    if (selected.size === 0) return;
    
    setSubmitting(true);
    await addDetections(Array.from(selected));
    setSubmitting(false);
    onClose();
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
      <div className="relative w-full max-w-3xl bg-surface-container rounded-2xl shadow-2xl border border-outline-variant/20 overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-outline-variant/20">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-on-surface">Add Detections</h2>
              <p className="text-sm text-on-surface-variant mt-0.5">
                Add detections from Universal Library to {currentWorkspace?.name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              <Icon name="x" className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search and Actions */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-outline-variant/20 bg-surface-container-low">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, description, language, technology..."
                className="w-full pl-10 pr-4 py-2.5 bg-surface-container border border-outline-variant/30 rounded-xl text-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={selectAll}
                disabled={filteredDetections.length === 0}
                className="px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50"
              >
                Select All
              </button>
              <button
                onClick={clearSelection}
                disabled={selected.size === 0}
                className="px-3 py-2 text-xs font-medium text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Detections List */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Icon name="spinner" className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : filteredDetections.length === 0 ? (
            <div className="text-center py-12">
              <Icon name="shield" className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-4" />
              <p className="text-on-surface-variant">
                {searchQuery 
                  ? 'No matching detections found' 
                  : detections.length === existingIds.size
                    ? 'All Universal Library detections are already in this workspace'
                    : 'No detections available'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredDetections.map((detection) => {
                const isSelected = selected.has(detection.id);
                
                return (
                  <div
                    key={detection.id}
                    onClick={() => toggleSelection(detection.id)}
                    className={`p-4 rounded-xl cursor-pointer border transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-outline-variant/20 hover:border-outline-variant/40 hover:bg-surface-container-high/50'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Checkbox */}
                      <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors mt-0.5 ${
                        isSelected
                          ? 'border-primary bg-primary'
                          : 'border-outline-variant'
                      }`}>
                        {isSelected && (
                          <Icon name="check" className="w-3 h-3 text-on-primary" />
                        )}
                      </div>

                      {/* Detection Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-on-surface truncate">{detection.name}</h4>
                          <span className="text-[10px] font-mono text-on-surface-variant/60 px-1.5 py-0.5 bg-surface-container-high rounded">
                            v{detection.version}
                          </span>
                        </div>
                        <p className="text-sm text-on-surface-variant/70 line-clamp-1 mb-2">
                          {detection.description || 'No description'}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-on-surface-variant/60">
                          {detection.severity && (
                            <span className={`capitalize ${
                              detection.severity === 'Critical' ? 'text-error' :
                              detection.severity === 'High' ? 'text-amber-400' :
                              detection.severity === 'Medium' ? 'text-secondary' :
                              'text-on-surface-variant'
                            }`}>
                              {detection.severity}
                            </span>
                          )}
                          {detection.queryLanguage && (
                            <span className="px-2 py-0.5 bg-surface-container-high rounded">
                              {detection.queryLanguage}
                            </span>
                          )}
                          {detection.technology && (
                            <span>{detection.technology}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-outline-variant/20 bg-surface-container-low">
          <div className="flex items-center justify-between">
            <span className="text-sm text-on-surface-variant">
              {selected.size} detection{selected.size !== 1 ? 's' : ''} selected
              {filteredDetections.length !== detections.length - existingIds.size && (
                <span className="text-on-surface-variant/50 ml-2">
                  ({filteredDetections.length} shown)
                </span>
              )}
            </span>
            
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2.5 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={selected.size === 0 || submitting}
                className="px-6 py-2.5 bg-secondary text-on-secondary text-sm font-semibold rounded-xl hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-secondary/20"
              >
                {submitting ? (
                  <Icon name="spinner" className="w-4 h-4 animate-spin" />
                ) : (
                  `Add ${selected.size} Detection${selected.size !== 1 ? 's' : ''}`
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddDetectionsToWorkspaceModal;
