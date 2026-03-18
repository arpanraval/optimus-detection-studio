import { useCallback } from 'react';
import { AuditLogEntry, AuditAction } from '../types';

interface UseDetectionAuditResult {
  addAuditEntry: (
    auditLog: AuditLogEntry[],
    action: AuditAction,
    userId: string,
    userName: string,
    details?: string,
    changes?: Record<string, { old: any; new: any }>
  ) => AuditLogEntry[];
  formatAuditAction: (action: AuditAction) => string;
  getActionIcon: (action: AuditAction) => string;
  getActionColor: (action: AuditAction) => string;
}

export function useDetectionAudit(): UseDetectionAuditResult {
  
  const addAuditEntry = useCallback((
    auditLog: AuditLogEntry[],
    action: AuditAction,
    userId: string,
    userName: string,
    details?: string,
    changes?: Record<string, { old: any; new: any }>
  ): AuditLogEntry[] => {
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      userId,
      userName,
      action,
      details,
      changes
    };
    
    return [...auditLog, entry];
  }, []);

  const formatAuditAction = useCallback((action: AuditAction): string => {
    const labels: Record<AuditAction, string> = {
      'created': 'Created detection',
      'updated': 'Updated detection',
      'status_changed': 'Changed status',
      'query_added': 'Added query',
      'query_updated': 'Updated query',
      'query_deleted': 'Deleted query',
      'validated': 'Marked as validated',
      'deployed': 'Deployed to production',
      'linked_entity_added': 'Linked entity',
      'linked_entity_removed': 'Unlinked entity',
      'published': 'Promoted to Production Library',
      'copied_from_universal': 'Forked from Production Library',
      // RBAC audit actions
      'assigned': 'Assigned to user',
      'unassigned': 'Unassigned from user',
      'review_requested': 'Review requested',
      'review_approved': 'Review approved',
      'review_rejected': 'Review rejected',
      'comment_added': 'Comment added',
      'moved_to_team': 'Moved to team'
    };
    return labels[action] || action;
  }, []);

  const getActionIcon = useCallback((action: AuditAction): string => {
    const icons: Record<AuditAction, string> = {
      'created': 'plus-circle',
      'updated': 'edit',
      'status_changed': 'refresh-cw',
      'query_added': 'code',
      'query_updated': 'code',
      'query_deleted': 'trash',
      'validated': 'check-circle',
      'deployed': 'cloud-upload',
      'linked_entity_added': 'link',
      'linked_entity_removed': 'unlink',
      'published': 'globe',
      'copied_from_universal': 'copy',
      // RBAC audit actions
      'assigned': 'user-plus',
      'unassigned': 'user-minus',
      'review_requested': 'eye',
      'review_approved': 'check-circle',
      'review_rejected': 'x-circle',
      'comment_added': 'message-square',
      'moved_to_team': 'users'
    };
    return icons[action] || 'activity';
  }, []);

  const getActionColor = useCallback((action: AuditAction): string => {
    const colors: Record<AuditAction, string> = {
      'created': 'text-emerald-400',
      'updated': 'text-blue-400',
      'status_changed': 'text-purple-400',
      'query_added': 'text-cyan-400',
      'query_updated': 'text-cyan-400',
      'query_deleted': 'text-red-400',
      'validated': 'text-emerald-400',
      'deployed': 'text-emerald-400',
      'linked_entity_added': 'text-primary',
      'linked_entity_removed': 'text-orange-400',
      'published': 'text-green-500',
      'copied_from_universal': 'text-blue-500',
      // RBAC audit actions
      'assigned': 'text-blue-400',
      'unassigned': 'text-orange-400',
      'review_requested': 'text-amber-400',
      'review_approved': 'text-emerald-400',
      'review_rejected': 'text-red-400',
      'comment_added': 'text-violet-400',
      'moved_to_team': 'text-indigo-400'
    };
    return colors[action] || 'text-gray-400';
  }, []);

  return {
    addAuditEntry,
    formatAuditAction,
    getActionIcon,
    getActionColor
  };
}