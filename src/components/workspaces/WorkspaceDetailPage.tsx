import React, { useState, useMemo } from 'react';
import { Icon } from '../Icon';
import { useWorkspace } from '../../context/WorkspaceContext';
import { AddDetectionsToWorkspaceModal } from './AddDetectionsToWorkspaceModal';
import { WorkspaceDetectionWithDetails, SyncStatus } from '../../types';

interface WorkspaceDetailPageProps {
  onBack: () => void;
  onSelectDetection: (detectionId: string) => void;
}

const getSyncStatusConfig = (status: SyncStatus) => {
  const config: Record<SyncStatus, { label: string; color: string; bgColor: string }> = {
    synced: { label: 'Synced', color: 'text-tertiary', bgColor: 'bg-tertiary/10' },
    outdated: { label: 'Update Available', color: 'text-amber-400', bgColor: 'bg-amber-400/10' },
    modified: { label: 'Modified', color: 'text-primary', bgColor: 'bg-primary/10' },
    diverged: { label: 'Conflict', color: 'text-error', bgColor: 'bg-error/10' },
  };
  return config[status] || config.synced;
};

export const WorkspaceDetailPage: React.FC<WorkspaceDetailPageProps> = ({ onBack, onSelectDetection }) => {
  const { 
    currentWorkspace, 
    currentWorkspaceRole,
    workspaceDetections, 
    detectionsLoading,
    stats,
    updatesAvailable,
    removeDetection,
    pullUpdate,
    pullAllUpdates,
    hasPermission
  } = useWorkspace();
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [pullingAll, setPullingAll] = useState(false);
  const [pullingId, setPullingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<SyncStatus | 'all'>('all');

  const canEdit = hasPermission(['owner', 'admin', 'lead', 'analyst']);
  const canManage = hasPermission(['owner', 'admin', 'lead']);
  const canBulkUpdate = hasPermission(['owner', 'admin']);

  // Filter detections
  const filteredDetections = useMemo(() => {
    let result = workspaceDetections;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(wd => 
        wd.detection?.name?.toLowerCase().includes(query) ||
        wd.detection?.description?.toLowerCase().includes(query)
      );
    }
    
    if (filterStatus !== 'all') {
      result = result.filter(wd => wd.sync_status === filterStatus);
    }
    
    return result;
  }, [workspaceDetections, searchQuery, filterStatus]);

  const handlePullAllUpdates = async () => {
    setPullingAll(true);
    await pullAllUpdates(false);
    setPullingAll(false);
  };

  const handlePullUpdate = async (detectionId: string) => {
    setPullingId(detectionId);
    await pullUpdate(detectionId);
    setPullingId(null);
  };

  const handleRemoveDetection = async (detectionId: string) => {
    setRemovingId(detectionId);
    await removeDetection(detectionId);
    setRemovingId(null);
  };

  if (!currentWorkspace) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center">
          <Icon name="alert-circle" className="w-16 h-16 text-on-surface-variant/30 mx-auto mb-4" />
          <p className="text-on-surface-variant">No workspace selected</p>
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 bg-primary text-on-primary rounded-lg hover:brightness-110 transition-all"
          >
            Back to Workspaces
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex-shrink-0 relative overflow-hidden bg-surface-container-low border-b border-outline-variant/30">
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/10 via-transparent to-primary/10" />
        
        <div className="relative px-8 py-6">
          {/* Back Button and Title */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={onBack}
              className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
            >
              <Icon name="arrow-left" className="w-5 h-5" />
            </button>
            
            <div className="w-14 h-14 rounded-xl bg-surface-container flex items-center justify-center text-3xl border border-outline-variant/20">
              {currentWorkspace.icon}
            </div>
            
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-brand font-bold text-on-surface">
                  {currentWorkspace.name}
                </h1>
                <span className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-full border ${
                  currentWorkspaceRole === 'owner' ? 'bg-tertiary/20 text-tertiary border-tertiary/30' :
                  currentWorkspaceRole === 'admin' ? 'bg-secondary/20 text-secondary border-secondary/30' :
                  'bg-primary/20 text-primary border-primary/30'
                }`}>
                  {currentWorkspaceRole}
                </span>
              </div>
              <p className="text-sm text-on-surface-variant">{currentWorkspace.description || currentWorkspace.slug}</p>
            </div>

            <div className="flex items-center gap-3">
              {/* Pull All Updates Button */}
              {updatesAvailable > 0 && canBulkUpdate && (
                <button
                  onClick={handlePullAllUpdates}
                  disabled={pullingAll}
                  className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl font-semibold hover:bg-amber-500/30 disabled:opacity-50 transition-all"
                >
                  {pullingAll ? (
                    <Icon name="spinner" className="w-4 h-4 animate-spin" />
                  ) : (
                    <Icon name="refresh-cw" className="w-4 h-4" />
                  )}
                  Pull {updatesAvailable} Update{updatesAvailable !== 1 ? 's' : ''}
                </button>
              )}
              
              {/* Add Detections Button */}
              {canEdit && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 px-6 py-2.5 bg-secondary text-on-secondary font-bold rounded-xl hover:brightness-110 transition-all shadow-lg shadow-secondary/20"
                >
                  <Icon name="plus" className="w-5 h-5" />
                  Add Detections
                </button>
              )}
            </div>
          </div>

          {/* Stats Row */}
          {stats && (
            <div className="grid grid-cols-5 gap-3">
              <div className="bg-surface-container/60 backdrop-blur-sm rounded-xl p-3 border border-outline-variant/20">
                <div className="flex items-center gap-2">
                  <Icon name="shield" className="w-4 h-4 text-primary" />
                  <span className="text-lg font-mono font-black text-on-surface">{stats.total_detections}</span>
                  <span className="text-[9px] text-on-surface-variant uppercase tracking-widest font-bold">Total</span>
                </div>
              </div>
              <div className="bg-surface-container/60 backdrop-blur-sm rounded-xl p-3 border border-outline-variant/20">
                <div className="flex items-center gap-2">
                  <Icon name="check-circle" className="w-4 h-4 text-tertiary" />
                  <span className="text-lg font-mono font-black text-tertiary">{stats.synced}</span>
                  <span className="text-[9px] text-on-surface-variant uppercase tracking-widest font-bold">Synced</span>
                </div>
              </div>
              <div className="bg-surface-container/60 backdrop-blur-sm rounded-xl p-3 border border-outline-variant/20">
                <div className="flex items-center gap-2">
                  <Icon name="alert-circle" className="w-4 h-4 text-amber-400" />
                  <span className="text-lg font-mono font-black text-amber-400">{stats.outdated}</span>
                  <span className="text-[9px] text-on-surface-variant uppercase tracking-widest font-bold">Outdated</span>
                </div>
              </div>
              <div className="bg-surface-container/60 backdrop-blur-sm rounded-xl p-3 border border-outline-variant/20">
                <div className="flex items-center gap-2">
                  <Icon name="edit" className="w-4 h-4 text-primary" />
                  <span className="text-lg font-mono font-black text-primary">{stats.modified}</span>
                  <span className="text-[9px] text-on-surface-variant uppercase tracking-widest font-bold">Modified</span>
                </div>
              </div>
              <div className="bg-surface-container/60 backdrop-blur-sm rounded-xl p-3 border border-outline-variant/20">
                <div className="flex items-center gap-2">
                  <Icon name="users" className="w-4 h-4 text-secondary" />
                  <span className="text-lg font-mono font-black text-secondary">{stats.member_count}</span>
                  <span className="text-[9px] text-on-surface-variant uppercase tracking-widest font-bold">Members</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex-shrink-0 px-8 py-4 bg-surface-container border-b border-outline-variant/20">
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search detections..."
              className="w-full pl-10 pr-4 py-2.5 bg-surface-container-high border border-outline-variant/30 rounded-xl text-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant font-medium">Status:</span>
            <div className="flex gap-1 bg-surface-container-high rounded-lg p-1 border border-outline-variant/20">
              {(['all', 'synced', 'outdated', 'modified', 'diverged'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    filterStatus === status
                      ? 'bg-primary text-on-primary'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
                  }`}
                >
                  {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Detections List */}
      <div className="flex-1 overflow-auto p-6 custom-scrollbar">
        {detectionsLoading ? (
          <div className="flex items-center justify-center h-64">
            <Icon name="spinner" className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredDetections.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-full" />
              <div className="relative w-20 h-20 rounded-2xl bg-surface-container flex items-center justify-center border border-outline-variant/30">
                <Icon name="shield" className="w-10 h-10 text-on-surface-variant/40" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-on-surface mb-2">
              {searchQuery || filterStatus !== 'all' ? 'No Matching Detections' : 'No Detections Yet'}
            </h2>
            <p className="text-sm text-on-surface-variant mb-6 max-w-md">
              {searchQuery || filterStatus !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'Add detections from the Development Library to get started.'}
            </p>
            {canEdit && !searchQuery && filterStatus === 'all' && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-6 py-3 bg-secondary text-on-secondary font-bold rounded-xl hover:brightness-110 transition-all"
              >
                <Icon name="plus" className="w-5 h-5" />
                Add Detections
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDetections.map((wd) => {
              const statusConfig = getSyncStatusConfig(wd.sync_status);
              const isPulling = pullingId === wd.detection_id;
              const isRemoving = removingId === wd.detection_id;
              
              return (
                <div
                  key={wd.id}
                  className="group bg-surface-container rounded-xl border border-outline-variant/20 hover:border-primary/30 transition-all"
                >
                  <div className="p-5">
                    <div className="flex items-start gap-4">
                      {/* Detection Info */}
                      <div 
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => onSelectDetection(wd.detection_id)}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-on-surface group-hover:text-primary transition-colors truncate">
                            {wd.detection?.name || wd.detection_id}
                          </h3>
                          
                          {/* Sync Status Badge */}
                          <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg ${statusConfig.bgColor} ${statusConfig.color}`}>
                            {statusConfig.label}
                          </span>
                          
                          {/* Override Badge */}
                          {wd.overrides && Object.keys(wd.overrides).length > 0 && (
                            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-primary/10 text-primary">
                              Customized
                            </span>
                          )}
                        </div>
                        
                        <p className="text-sm text-on-surface-variant/70 line-clamp-1 mb-3">
                          {wd.detection?.description || 'No description'}
                        </p>
                        
                        {/* Meta Row */}
                        <div className="flex items-center gap-4 text-xs text-on-surface-variant/60">
                          <span className="font-mono">v{wd.universal_version}</span>
                          {wd.detection?.severity && (
                            <span className={`capitalize ${
                              wd.detection.severity === 'Critical' ? 'text-error' :
                              wd.detection.severity === 'High' ? 'text-amber-400' :
                              wd.detection.severity === 'Medium' ? 'text-secondary' :
                              'text-on-surface-variant'
                            }`}>
                              {wd.detection.severity}
                            </span>
                          )}
                          {wd.detection?.queryLanguage && (
                            <span>{wd.detection.queryLanguage}</span>
                          )}
                          {wd.detection?.technology && (
                            <span>{wd.detection.technology}</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Pull Update */}
                        {(wd.sync_status === 'outdated' || wd.sync_status === 'diverged') && canManage && (
                          <button
                            onClick={() => handlePullUpdate(wd.detection_id)}
                            disabled={isPulling}
                            className="p-2 rounded-lg text-amber-400 hover:bg-amber-400/10 transition-colors disabled:opacity-50"
                            title="Pull Update"
                          >
                            {isPulling ? (
                              <Icon name="spinner" className="w-4 h-4 animate-spin" />
                            ) : (
                              <Icon name="refresh-cw" className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        
                        {/* View */}
                        <button
                          onClick={() => onSelectDetection(wd.detection_id)}
                          className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
                          title="View Detection"
                        >
                          <Icon name="eye" className="w-4 h-4" />
                        </button>
                        
                        {/* Remove */}
                        {canManage && (
                          <button
                            onClick={() => handleRemoveDetection(wd.detection_id)}
                            disabled={isRemoving}
                            className="p-2 rounded-lg text-error/70 hover:bg-error/10 hover:text-error transition-colors disabled:opacity-50"
                            title="Remove from Workspace"
                          >
                            {isRemoving ? (
                              <Icon name="spinner" className="w-4 h-4 animate-spin" />
                            ) : (
                              <Icon name="trash" className="w-4 h-4" />
                            )}
                          </button>
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

      {/* Add Detections Modal */}
      <AddDetectionsToWorkspaceModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
      />
    </div>
  );
};

export default WorkspaceDetailPage;
