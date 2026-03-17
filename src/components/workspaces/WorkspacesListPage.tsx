import React, { useState, useMemo } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { WorkspaceCard } from './WorkspaceCard';
import { CreateWorkspaceModal } from './CreateWorkspaceModal';
import { Icon } from '../Icon';
import { usePermissions } from '../../context/PermissionsContext';
import { WorkspaceWithRole } from '../../types';
import { routeHelpers } from '../../router/routes';

interface WorkspacesListPageProps {
  onSelectWorkspace: (workspaceId: string) => void;
}

type ViewMode = 'grid' | 'list';

export const WorkspacesListPage: React.FC<WorkspacesListPageProps> = ({ onSelectWorkspace }) => {
  const { userWorkspaces, workspacesLoading, switchWorkspace } = useWorkspace();
  const { hasRoleOrHigher } = usePermissions();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const canCreateWorkspace = hasRoleOrHigher('analyst');

  // Filter workspaces by search
  const filteredWorkspaces = useMemo(() => {
    if (!searchQuery.trim()) return userWorkspaces;
    const query = searchQuery.toLowerCase();
    return userWorkspaces.filter(ws => 
      ws.name.toLowerCase().includes(query) ||
      ws.description?.toLowerCase().includes(query) ||
      ws.slug.toLowerCase().includes(query)
    );
  }, [userWorkspaces, searchQuery]);

  // Calculate stats
  const stats = useMemo(() => ({
    totalWorkspaces: userWorkspaces.length,
    totalDetections: userWorkspaces.reduce((sum, ws) => sum + ws.detection_count, 0),
    totalMembers: userWorkspaces.reduce((sum, ws) => sum + ws.member_count, 0),
  }), [userWorkspaces]);

  const handleSelectWorkspace = async (workspace: WorkspaceWithRole) => {
    await switchWorkspace(workspace.workspace_id);
    onSelectWorkspace(workspace.workspace_id);
  };

  const handleCreateSuccess = async (workspaceId: string) => {
    setIsCreateModalOpen(false);
    await switchWorkspace(workspaceId);
    onSelectWorkspace(workspaceId);
  };

  if (workspacesLoading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full bg-background">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
          <Icon name="spinner" className="relative w-16 h-16 text-primary animate-spin" />
        </div>
        <p className="text-on-surface-variant animate-pulse font-bold font-mono text-sm mt-6 tracking-widest">
          LOADING WORKSPACES...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex-shrink-0 relative overflow-hidden bg-surface-container-low border-b border-outline-variant/30">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/10 via-transparent to-primary/10" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-secondary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        
        <div className="relative px-8 pt-8 pb-6">
          {/* Top Section */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-secondary/20 via-primary/20 to-tertiary/20 flex items-center justify-center border border-outline-variant/30">
                  <Icon name="grid" className="w-6 h-6 text-secondary" />
                </div>
                <div>
                  <h1 className="text-3xl font-brand font-bold text-on-surface tracking-tight">
                    Workspaces
                  </h1>
                  <p className="text-sm text-on-surface-variant">
                    Manage detection engineering workspaces for your teams and clients
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* View Toggle */}
              <div className="flex gap-1 bg-surface-container rounded-xl p-1 border border-outline-variant/20">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2.5 rounded-lg transition-all ${
                    viewMode === 'grid'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                  }`}
                  title="Grid View"
                >
                  <Icon name="grid" className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2.5 rounded-lg transition-all ${
                    viewMode === 'list'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                  }`}
                  title="List View"
                >
                  <Icon name="list" className="w-4 h-4" />
                </button>
              </div>

              {/* Create Workspace Button */}
              {canCreateWorkspace && (
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-secondary text-on-secondary font-bold rounded-xl hover:brightness-110 transition-all shadow-lg shadow-secondary/20"
                >
                  <Icon name="plus" className="w-5 h-5" />
                  Create Workspace
                </button>
              )}
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-surface-container/60 backdrop-blur-sm rounded-xl p-4 border border-outline-variant/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                  <Icon name="grid" className="w-5 h-5 text-secondary" />
                </div>
                <div>
                  <p className="text-2xl font-mono font-black text-on-surface">{stats.totalWorkspaces}</p>
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Workspaces</p>
                </div>
              </div>
            </div>
            <div className="bg-surface-container/60 backdrop-blur-sm rounded-xl p-4 border border-outline-variant/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon name="shield" className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-mono font-black text-on-surface">{stats.totalDetections}</p>
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Detections</p>
                </div>
              </div>
            </div>
            <div className="bg-surface-container/60 backdrop-blur-sm rounded-xl p-4 border border-outline-variant/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-tertiary/10 flex items-center justify-center">
                  <Icon name="users" className="w-5 h-5 text-tertiary" />
                </div>
                <div>
                  <p className="text-2xl font-mono font-black text-on-surface">{stats.totalMembers}</p>
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Members</p>
                </div>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative max-w-md">
            <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search workspaces..."
              className="w-full pl-12 pr-4 py-3.5 bg-surface-container border border-outline-variant/30 rounded-xl 
                       text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Workspaces Display Area */}
      <div className="flex-1 overflow-auto p-6 custom-scrollbar">
        {filteredWorkspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-secondary/10 blur-2xl rounded-full" />
              <div className="relative w-24 h-24 rounded-2xl bg-surface-container flex items-center justify-center border border-outline-variant/30">
                <Icon name="grid" className="w-12 h-12 text-on-surface-variant/40" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-on-surface mb-3">
              {searchQuery ? 'No Matching Workspaces' : 'No Workspaces Yet'}
            </h2>
            <p className="text-on-surface-variant mb-8 max-w-md">
              {searchQuery 
                ? 'No workspaces match your search. Try different keywords.'
                : 'Create your first workspace to organize detections for your team or client.'}
            </p>
            {canCreateWorkspace && !searchQuery && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 px-8 py-4 bg-secondary text-on-secondary font-bold rounded-xl hover:brightness-110 transition-all shadow-lg shadow-secondary/20"
              >
                <Icon name="plus" className="w-5 h-5" />
                Create Your First Workspace
              </button>
            )}
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-primary hover:underline font-semibold"
              >
                Clear search
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
            {filteredWorkspaces.map(workspace => (
              <WorkspaceCard
                key={workspace.workspace_id}
                workspace={workspace}
                to={routeHelpers.workspaceDetail(workspace.workspace_id)}
                onClick={() => handleSelectWorkspace(workspace)}
              />
            ))}
          </div>
        ) : (
          /* List View */
          <div className="bg-surface-container rounded-2xl border border-outline-variant/30 overflow-hidden">
            <table className="w-full">
              <thead className="bg-surface-container-high/50 border-b border-outline-variant/30">
                <tr>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Workspace
                  </th>
                  <th className="px-6 py-4 text-center text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Detections
                  </th>
                  <th className="px-6 py-4 text-center text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Members
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Your Role
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Type
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkspaces.map((workspace, idx) => (
                  <tr
                    key={workspace.workspace_id}
                    onClick={() => handleSelectWorkspace(workspace)}
                    className={`cursor-pointer transition-colors hover:bg-surface-container-high/50 group
                              ${idx !== filteredWorkspaces.length - 1 ? 'border-b border-outline-variant/10' : ''}`}
                  >
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center text-2xl border border-outline-variant/20 group-hover:scale-105 transition-transform">
                          {workspace.icon}
                        </div>
                        <div>
                          <div className="text-on-surface font-bold group-hover:text-primary transition-colors">{workspace.name}</div>
                          {workspace.description && (
                            <div className="text-xs text-on-surface-variant/60 line-clamp-1 max-w-md">
                              {workspace.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className="text-xl font-mono font-black text-primary">{workspace.detection_count}</span>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className="text-xl font-mono font-black text-tertiary">{workspace.member_count}</span>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg ${
                        workspace.user_role === 'owner' ? 'bg-tertiary/10 text-tertiary' :
                        workspace.user_role === 'admin' ? 'bg-secondary/10 text-secondary' :
                        workspace.user_role === 'lead' ? 'bg-primary/10 text-primary' :
                        'bg-surface-container-high text-on-surface-variant'
                      }`}>
                        {workspace.user_role}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-sm text-on-surface-variant capitalize">{workspace.type}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Workspace Modal */}
      <CreateWorkspaceModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
};

export default WorkspacesListPage;
