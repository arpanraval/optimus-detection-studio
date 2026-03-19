import type { Role } from './rbac';
import type { LibraryType } from './detection';

// ============================================
// USER & PROFILE TYPES
// ============================================

/** User presence status */
export type UserStatus = 'active' | 'away' | 'offline' | 'deactivated';

/** Extended profile with new fields */
export interface Profile {
  id: string;
  email: string;
  role: Role;
  // New RBAC fields
  full_name?: string;
  avatar_url?: string;
  phone?: string;
  timezone?: string;
  preferences?: UserPreferences;
  last_active_at?: string;
  status?: UserStatus;
  onboarding_completed?: boolean;
  onboarding_step?: number;
  password_set?: boolean;
  created_at?: string;
  updated_at?: string;
}

/** User preferences stored in profile */
export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  notifications?: {
    email?: boolean;
    inApp?: boolean;
    assignment?: boolean;
    review?: boolean;
    comment?: boolean;
  };
  defaultLibrary?: LibraryType;
  compactView?: boolean;
}

// ============================================
// TEAM TYPES
// ============================================

/** Team/Organization entity */
export interface Team {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logo_url?: string;
  settings: TeamSettings;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

/** Team configuration settings */
export interface TeamSettings {
  require_review?: boolean;
  default_assignee?: string;
  allowed_domains?: string[];
  notification_preferences?: {
    assignment?: boolean;
    review?: boolean;
    comment?: boolean;
  };
}

/** Team membership status */
export type TeamMemberStatus = 'pending' | 'active' | 'deactivated';

/**
 * User's membership in a team
 * Note: Role is now stored globally in profiles.role, not per-team.
 * The role field here is deprecated and kept for backward compatibility only.
 */
export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  /** @deprecated Role is now global in profiles.role. This field may be removed. */
  role?: Role;
  /** @deprecated Status is tracked in profiles.status. This field may be removed. */
  status?: TeamMemberStatus;
  invited_by?: string;
  invited_at?: string;
  joined_at?: string;
  created_at: string;
  updated_at?: string;
  // Joined fields
  user?: Profile;
  team?: Team;
}

/**
 * Pending user invitation
 * Note: This is for inviting NEW users to the application.
 * The role field specifies the global role the user will receive in profiles.role.
 */
export interface TeamInvitation {
  id: string;
  team_id?: string;  // Optional - user may be invited without a team
  email: string;
  role: Role;  // Global role to assign when invitation is accepted
  invited_by: string;
  token: string;
  expires_at: string;
  accepted_at?: string;
  status?: 'pending' | 'accepted' | 'expired' | 'cancelled';
  created_at: string;
  // Joined fields
  team?: Team;
  inviter?: Profile;
}

// ============================================
// NOTIFICATION TYPES (Extended)
// ============================================

export type NotificationType =
  | 'publish_approved'
  | 'publish_rejected'
  | 'publish_approved_as_new'
  | 'rule_updated'
  // New RBAC notification types
  | 'welcome'
  | 'team_invite'
  | 'role_change'
  | 'assignment'
  | 'review_request'
  | 'review_complete'
  | 'comment_mention'
  | 'comment_reply'
  | 'status_change'
  | 'deploy'
  | 'feed'
  | 'system';

export interface UserNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  detection_id: string | null;
  publish_request_id: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  // New fields
  team_id?: string;
  action_url?: string;
  category?: string;
  source_user_id?: string;
}
