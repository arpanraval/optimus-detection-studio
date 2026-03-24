import type { Detection, ReviewRequestStatus } from './detection';
import type { Profile, Team } from './user';

// ============================================
// ASSIGNMENT TYPES
// ============================================

/** Detection assignment record */
export interface DetectionAssignment {
  id: string;
  detection_id: string;
  assigned_to: string;
  assigned_by: string;
  assigned_at: string;
  unassigned_at?: string;
  unassigned_by?: string;
  notes?: string;
  created_at: string;
  // Joined fields
  assignee?: Profile;
  assigner?: Profile;
  detection?: Detection;
}

// ============================================
// REVIEW TYPES
// ============================================

/** Detection review record */
export interface DetectionReview {
  id: string;
  detection_id: string;
  requested_by: string;
  requested_at: string;
  reviewer_id?: string;
  assigned_at?: string;
  status: ReviewRequestStatus;
  decision_at?: string;
  notes?: string;
  checklist: ReviewChecklistItem[];
  created_at: string;
  updated_at: string;
  // Joined fields
  requester?: Profile;
  reviewer?: Profile;
  detection?: Detection;
}

/** Review checklist item */
export interface ReviewChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  checkedBy?: string;
  checkedAt?: string;
}

/** Default review checklist template */
export const DEFAULT_REVIEW_CHECKLIST: Omit<ReviewChecklistItem, 'id'>[] = [
  { label: 'Detection logic is correct', checked: false },
  { label: 'Query syntax is valid', checked: false },
  { label: 'MITRE mapping is accurate', checked: false },
  { label: 'False positive guidance provided', checked: false },
  { label: 'Investigation steps are clear', checked: false },
  { label: 'Tested in lab environment', checked: false },
];

// ============================================
// COMMENT TYPES
// ============================================

/** Comment type classification */
export type CommentType = 'comment' | 'review_note' | 'status_change' | 'system';

/** Detection comment */
export interface DetectionComment {
  id: string;
  detection_id: string;
  user_id: string;
  parent_id?: string;
  content: string;
  comment_type: CommentType;
  is_resolved: boolean;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  user?: Profile;
  replies?: DetectionComment[];
}

// ============================================
// ACTIVITY LOG TYPES
// ============================================

/** Entity types that can be logged */
export type ActivityEntityType = 'detection' | 'user' | 'team' | 'pack' | 'review' | 'comment';

/** Activity action types */
export type ActivityAction =
  // Detection actions
  | 'detection_created'
  | 'detection_updated'
  | 'detection_deleted'
  | 'detection_status_changed'
  // Assignment actions
  | 'detection_assigned'
  | 'detection_unassigned'
  | 'detection_self_assigned'
  // Review actions
  | 'review_requested'
  | 'review_started'
  | 'review_approved'
  | 'review_rejected'
  | 'review_cancelled'
  // Comment actions
  | 'comment_added'
  | 'comment_resolved'
  // Publishing actions
  | 'detection_promoted'
  | 'detection_promotion_requested'
  | 'detection_copied'
  // User actions
  | 'user_invited'
  | 'user_joined'
  | 'user_registered'
  | 'user_added'
  | 'user_deactivated'
  | 'user_reactivated'
  | 'role_changed'
  // Team actions
  | 'team_created'
  | 'team_updated'
  | 'team_settings_changed';

/** Activity log entry */
export interface ActivityLogEntry {
  id: string;
  team_id?: string;
  user_id: string;
  entity_type: ActivityEntityType;
  entity_id: string;
  action: ActivityAction;
  details: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
  // Joined fields
  user?: Profile;
  team?: Team;
}

// ============================================
// AUDIT EVENT TYPES (Enterprise Audit Trail)
// ============================================

/** Dot-notation action types for the audit_events table */
export type AuditEventAction =
  // Detection lifecycle
  | 'detection.created'
  | 'detection.updated'
  | 'detection.deleted'
  | 'detection.status_changed'
  | 'detection.promoted'
  | 'detection.promotion_requested'
  | 'detection.deployed'
  | 'detection.assigned'
  | 'detection.unassigned'
  | 'detection.copied'
  | 'detection.moved'
  // Review
  | 'review.requested'
  | 'review.started'
  | 'review.approved'
  | 'review.rejected'
  | 'review.cancelled'
  // Comments
  | 'comment.created'
  | 'comment.updated'
  | 'comment.deleted'
  // User management
  | 'user.created'
  | 'user.invited'
  | 'user.login'
  | 'user.logout'
  | 'user.role_changed'
  | 'user.deactivated'
  | 'user.reactivated'
  | 'user.deleted'
  | 'user.password_set'
  // Exports
  | 'export.pdf'
  | 'export.excel'
  | 'export.json'
  | 'export.csv'
  // Bulk imports
  | 'bulk_import.started'
  | 'bulk_import.completed'
  | 'bulk_import.reverted'
  // Settings
  | 'settings.quality_weights_changed'
  | 'settings.integration_configured'
  // Generic fallback for extensibility
  | `custom.${string}`;

/** Audit event source */
export type AuditEventSource = 'client' | 'edge_function' | 'migration';

/** Immutable audit event record */
export interface AuditEvent {
  id: string;
  // WHO
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  // WHAT
  action: AuditEventAction;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  // CHANGE DETAILS
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  changed_fields: string[] | null;
  // CONTEXT
  team_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  session_id: string | null;
  source: AuditEventSource;
  // META
  details: Record<string, any> | null;
  created_at: string;
}

// ============================================
// SCORING PROFILE TYPES
// ============================================

/** Scoring profile stored in the scoring_profiles table */
export interface ScoringProfile {
  id: string;
  team_id: string | null;
  name: string;
  description: string | null;
  is_default: boolean;
  weights: {
    query_completeness: number;
    mitre_mapping: number;
    peer_review: number;
    description_quality: number;
    false_positive_guidance: number;
    data_sources: number;
    threat_intel: number;
    test_coverage: number;
    investigation_steps: number;
    references: number;
  };
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// PUBLISH REQUEST TYPES
// ============================================

/** @deprecated Use PromotionRequest instead */
export type PublishRequest = PromotionRequest;

export interface PromotionRequest {
  id: string;
  detection_id: string;
  target_rule_id: string | null;
  submitted_by: string;
  submitted_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'approved_as_new';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  result_rule_id: string | null;
  notification_sent: boolean;
  notification_sent_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  detection?: Detection;
  submitter_email?: string;
}

// ============================================
// DETECTION PACK TYPES
// ============================================

export type PackType = 'tactic' | 'technology' | 'threat_actor' | 'campaign' | 'ransomware';

export interface DetectionPack {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  tags: string[];
  mitre_technique_ids: string[];
  platforms: string[];
  rule_count: number;
  source: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Dynamic pack generation fields
  pack_type?: PackType | null;
  auto_generated?: boolean;
  generation_criteria?: Record<string, unknown> | null;
  coverage_percent?: number | null;
  // Joined fields (computed)
  detections?: Detection[];
  creator?: Profile;
}

export interface PackDetection {
  id: string;
  pack_id: string;
  detection_id: string;
  added_at: string;
  // Joined fields
  detection?: Detection;
}

export interface PublishEligibility {
  eligible: boolean;
  error?: string;
  checks: {
    quality_score: { passed: boolean; value: number; required: number };
    name: { passed: boolean; value: string | null };
    description: { passed: boolean; length: number; required: number };
    mitre_mapping: { passed: boolean; count: number };
    detection_query: { passed: boolean };
  };
  promotion_status: string;
  already_promoted: boolean;
  is_pending: boolean;
  is_promoted_unchanged: boolean;
  is_update: boolean;
}
