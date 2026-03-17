import type { Detection } from './detection';
import type { Profile } from './user';

// ============================================
// WORKSPACE TYPES
// ============================================

/** Workspace type */
export type WorkspaceType = 'personal' | 'team';

/** User's role within a specific workspace */
export type WorkspaceRole = 'owner' | 'admin' | 'lead' | 'analyst' | 'viewer';

/** Workspace member status */
export type WorkspaceMemberStatus = 'pending' | 'active' | 'deactivated';

/** Sync status for workspace detections */
export type SyncStatus = 'synced' | 'outdated' | 'modified' | 'diverged';

/** Deployment status */
export type DeploymentStatus = 'pending' | 'queued' | 'deployed' | 'disabled' | 'failed';

/** Review status within workspace */
export type WorkspaceReviewStatus = 'none' | 'requested' | 'in_review' | 'approved' | 'rejected' | 'changes_requested';

/** Workspace settings */
export interface WorkspaceSettings {
  allowDirectCreate: boolean;
  requireReviewBeforeAdd: boolean;
  autoSyncUpdates: boolean;
  defaultDeploymentTarget: string | null;
}

/** Main workspace entity */
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  type: WorkspaceType;
  settings: WorkspaceSettings;
  git_repo_url: string | null;
  git_branch: string;
  git_sync_enabled: boolean;
  git_last_synced_at: string | null;
  deployment_targets: unknown[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Workspace with user context */
export interface WorkspaceWithRole {
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  type: WorkspaceType;
  user_role: WorkspaceRole;
  member_count: number;
  detection_count: number;
}

/** Workspace member */
export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  invited_by: string | null;
  invited_at: string;
  accepted_at: string | null;
  status: WorkspaceMemberStatus;
  created_at: string;
  updated_at: string;
  user?: Profile;
}

/** Workspace detection junction */
export interface WorkspaceDetection {
  id: string;
  workspace_id: string;
  detection_id: string;
  universal_version: number;
  local_version: number;
  sync_status: SyncStatus;
  last_synced_at: string;
  overrides: Record<string, unknown> | null;
  deployment_status: DeploymentStatus;
  deployed_at: string | null;
  deployed_to: string[];
  deployment_error: string | null;
  deployment_config: Record<string, unknown> | null;
  assigned_to: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  review_status: WorkspaceReviewStatus;
  reviewer_id: string | null;
  review_requested_at: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  added_by: string | null;
  added_at: string;
  updated_at: string;
}

/** Workspace detection with full detection data */
export interface WorkspaceDetectionWithDetails extends WorkspaceDetection {
  detection?: Detection;
}

/** Workspace statistics */
export interface WorkspaceStats {
  total_detections: number;
  synced: number;
  outdated: number;
  modified: number;
  diverged: number;
  pending_deployment: number;
  deployed: number;
  pending_review: number;
  unassigned: number;
  member_count: number;
  updates_available: number;
}

/** Workspace role hierarchy */
export const WORKSPACE_ROLE_HIERARCHY: Record<WorkspaceRole, number> = {
  owner: 5,
  admin: 4,
  lead: 3,
  analyst: 2,
  viewer: 1,
};

/** Check if user has required workspace role */
export const hasWorkspaceRoleLevel = (userRole: WorkspaceRole | null, requiredRole: WorkspaceRole): boolean => {
  if (!userRole) return false;
  return WORKSPACE_ROLE_HIERARCHY[userRole] >= WORKSPACE_ROLE_HIERARCHY[requiredRole];
};

/** Generate URL-safe slug from name */
export const generateWorkspaceSlug = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
};
