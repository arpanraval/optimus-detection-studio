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
// USER INVITATION
// ============================================

/**
 * Pending user invitation. Created when an admin invites someone to the app;
 * the role here becomes the user's global role (profiles.role) on acceptance.
 */
export interface UserInvitation {
  id: string;
  email: string;
  role: Role;
  invited_by: string;
  token: string;
  expires_at: string;
  accepted_at?: string;
  created_at: string;
  // Joined fields
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
  | 'invite'
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
  action_url?: string;
  category?: string;
  source_user_id?: string;
}
