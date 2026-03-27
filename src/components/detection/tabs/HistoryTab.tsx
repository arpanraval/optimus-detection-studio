import React, { useState, useEffect } from 'react';
import { Detection, AuditEvent } from '../../../types';
import { LIBRARY_LABELS } from '../../../types/detection';
import { LIBRARY_DEVELOPMENT, LIBRARY_PRODUCTION, PROMOTION_NONE, PROMOTION_PENDING, PROMOTION_PROMOTED, PROMOTION_REJECTED } from '../../../constants/library';
import { Icon } from '../../Icon';
import { useDetectionAudit } from '../../../hooks/useDetectionAudit';
import { supabase } from '../../../lib/supabaseClient';
import { DetailCard } from '../DetailCard';

interface HistoryTabProps {
  detection: Detection;
}

interface UserInfo {
  email: string;
  role?: string;
}

// M1: User display component with avatar
const UserDisplay: React.FC<{ 
  userId?: string; 
  userInfo?: UserInfo | null;
  fallback?: string;
  label: string;
  timestamp?: string;
}> = ({ userId, userInfo, fallback = 'Unknown', label, timestamp }) => {
  // Get initials from email
  const getInitials = (email?: string): string => {
    if (!email) return '?';
    const parts = email.split('@')[0].split(/[._-]/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return email.slice(0, 2).toUpperCase();
  };

  const displayName = userInfo?.email || fallback;
  const initials = getInitials(userInfo?.email);
  const isAdmin = userInfo?.role === 'admin';

  return (
    <div>
      <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-2">{label}</span>
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
          isAdmin 
            ? 'bg-tertiary/20 text-tertiary border-2 border-tertiary/30' 
            : 'bg-primary/20 text-primary border-2 border-primary/30'
        }`}>
          {initials}
        </div>
        
        {/* Info */}
        <div className="min-w-0">
          <p className="text-sm text-on-surface font-medium truncate flex items-center gap-2">
            {displayName}
            {isAdmin && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-tertiary/10 text-tertiary rounded border border-tertiary/20">
                Admin
              </span>
            )}
          </p>
          {timestamp && (
            <p className="text-xs text-on-surface-variant mt-0.5">
              {new Date(timestamp).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper functions for new audit_events dot-notation actions
function formatAuditEventAction(action: string): string {
  const labels: Record<string, string> = {
    'detection.created': 'Created detection',
    'detection.updated': 'Updated detection',
    'detection.deleted': 'Deleted detection',
    'detection.status_changed': 'Changed status',
    'detection.promoted': `Promoted to ${LIBRARY_LABELS[LIBRARY_DEVELOPMENT]}`,
    'detection.publish_requested': 'Publish requested',
    'detection.deployed': 'Deployed to SIEM',
    'review.requested': 'Review requested',
    'review.started': 'Review started',
    'review.approved': 'Review approved',
    'review.rejected': 'Review rejected',
    'review.cancelled': 'Review cancelled',
    'comment.created': 'Comment added',
    'comment.updated': 'Comment updated',
    'comment.deleted': 'Comment deleted',
    'export.pdf': 'Exported as PDF',
    'export.excel': 'Exported as Excel',
  };
  return labels[action] || action.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getAuditEventIcon(action: string): string {
  const prefix = action.split('.')[0];
  const icons: Record<string, string> = {
    'detection.created': 'plus-circle',
    'detection.updated': 'edit',
    'detection.deleted': 'trash',
    'detection.status_changed': 'refresh-cw',
    'detection.promoted': 'globe',
    'detection.publish_requested': 'send',
    'detection.deployed': 'cloud-upload',
    'review.requested': 'eye',
    'review.approved': 'check-circle',
    'review.rejected': 'x-circle',
    'comment.created': 'message-square',
    'comment.updated': 'edit',
    'comment.deleted': 'trash',
    'export.pdf': 'file-text',
    'export.excel': 'file-text',
  };
  return icons[action] || (prefix === 'detection' ? 'code' : 'activity');
}

function getAuditEventColor(action: string): string {
  const colors: Record<string, string> = {
    'detection.created': 'text-emerald-400',
    'detection.updated': 'text-blue-400',
    'detection.deleted': 'text-red-400',
    'detection.status_changed': 'text-purple-400',
    'detection.promoted': 'text-green-500',
    'detection.publish_requested': 'text-amber-400',
    'detection.deployed': 'text-emerald-400',
    'review.requested': 'text-amber-400',
    'review.approved': 'text-emerald-400',
    'review.rejected': 'text-red-400',
    'comment.created': 'text-violet-400',
    'comment.updated': 'text-blue-400',
    'comment.deleted': 'text-red-400',
    'export.pdf': 'text-cyan-400',
    'export.excel': 'text-cyan-400',
  };
  return colors[action] || 'text-gray-400';
}

export const HistoryTab: React.FC<HistoryTabProps> = ({ detection }) => {
  const { formatAuditAction, getActionIcon, getActionColor } = useDetectionAudit();
  const legacyAuditLog = detection.auditLog || [];

  // Audit events from the new audit_events table
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);

  // M1: State for user info
  const [createdByInfo, setCreatedByInfo] = useState<UserInfo | null>(null);
  const [updatedByInfo, setUpdatedByInfo] = useState<UserInfo | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // Fetch audit events from audit_events table
  useEffect(() => {
    const fetchAuditEvents = async () => {
      if (!detection.id) return;
      setIsLoadingEvents(true);
      try {
        const { data, error } = await supabase
          .from('audit_events')
          .select('*')
          .eq('entity_type', 'detection')
          .eq('entity_id', detection.id)
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) {
          console.error('Error fetching audit events:', error);
        } else if (data) {
          setAuditEvents(data as AuditEvent[]);
        }
      } catch (err) {
        console.error('Error fetching audit events:', err);
      } finally {
        setIsLoadingEvents(false);
      }
    };

    fetchAuditEvents();
  }, [detection.id]);

  // M1: Fetch user info for created_by and updated_by
  useEffect(() => {
    const fetchUserInfo = async () => {
      const userIds = new Set<string>();
      if (detection.created_by) userIds.add(detection.created_by);
      if (detection.updated_by) userIds.add(detection.updated_by);

      if (userIds.size === 0) return;

      setIsLoadingUsers(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, email, role')
          .in('id', Array.from(userIds));

        if (error) throw error;

        if (data) {
          const userMap = new Map<string, UserInfo>(
            data.map(u => [u.id, { email: u.email, role: u.role }])
          );

          if (detection.created_by && userMap.has(detection.created_by)) {
            setCreatedByInfo(userMap.get(detection.created_by) || null);
          }
          if (detection.updated_by && userMap.has(detection.updated_by)) {
            setUpdatedByInfo(userMap.get(detection.updated_by) || null);
          }
        }
      } catch (err) {
        console.error('Error fetching user info:', err);
      } finally {
        setIsLoadingUsers(false);
      }
    };

    fetchUserInfo();
  }, [detection.created_by, detection.updated_by]);

  return (
    <div className="animate-fade-in space-y-6">
      
      {/* Version Information - M1: Enhanced with created_by/updated_by */}
      <DetailCard title="Version Information" description="Current version details and contributors">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Version */}
          <div>
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Current Version</span>
            <p className="text-3xl font-mono font-bold text-on-surface">v{detection.version}</p>
          </div>
          
          {/* Author */}
          <div>
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Author</span>
            <p className="text-sm text-on-surface font-medium">{detection.author || 'Unknown'}</p>
          </div>
          
          {/* Created Date */}
          <div>
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Created</span>
            <p className="text-sm text-on-surface font-medium">
              {new Date(detection.createdDate).toLocaleDateString('en-US', { 
                month: 'short', day: 'numeric', year: 'numeric' 
              })}
            </p>
            <p className="text-xs text-on-surface-variant">
              {new Date(detection.createdDate).toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit'
              })}
            </p>
          </div>
          
          {/* Last Updated */}
          <div>
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Last Updated</span>
            <p className="text-sm text-on-surface font-medium">
              {new Date(detection.updatedDate).toLocaleDateString('en-US', { 
                month: 'short', day: 'numeric', year: 'numeric' 
              })}
            </p>
            <p className="text-xs text-on-surface-variant">
              {new Date(detection.updatedDate).toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit'
              })}
            </p>
          </div>
        </div>

        {/* M1: Created By / Updated By Section */}
        {(detection.created_by || detection.updated_by) && (
          <div className="pt-6 mt-6 border-t border-outline-variant/20">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Created By */}
              {detection.created_by && (
                <UserDisplay 
                  userId={detection.created_by}
                  userInfo={createdByInfo}
                  fallback={detection.author || 'Unknown'}
                  label="Created By"
                  timestamp={detection.createdDate}
                />
              )}
              
              {/* Updated By */}
              {detection.updated_by && (
                <UserDisplay 
                  userId={detection.updated_by}
                  userInfo={updatedByInfo}
                  fallback="Unknown"
                  label="Last Updated By"
                  timestamp={detection.updatedDate}
                />
              )}
            </div>
          </div>
        )}

        {/* Library Info */}
        {detection.library_type && (
          <div className="pt-6 mt-6 border-t border-outline-variant/20">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Library</span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
                  detection.library_type === LIBRARY_DEVELOPMENT 
                    ? 'bg-secondary/10 text-secondary border border-secondary/20'
                    : 'bg-primary/10 text-primary border border-primary/20'
                }`}>
                  <Icon name={detection.library_type === LIBRARY_DEVELOPMENT ? 'flask' : 'shield'} className="w-3.5 h-3.5" />
                  {detection.library_type === LIBRARY_DEVELOPMENT ? LIBRARY_LABELS[LIBRARY_DEVELOPMENT] : LIBRARY_LABELS[LIBRARY_PRODUCTION]}
                </span>
              </div>
              
              {detection.source && detection.source !== 'custom' && (
                <div>
                  <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Source</span>
                  <span className="text-sm text-on-surface font-medium capitalize">{detection.source.replace('_', ' ')}</span>
                </div>
              )}
              
              {detection.promotion_status && detection.promotion_status !== PROMOTION_NONE && (
                <div>
                  <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Promotion Status</span>
                  <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold ${
                    detection.promotion_status === PROMOTION_PROMOTED ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20' :
                    detection.promotion_status === PROMOTION_PENDING ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' :
                    detection.promotion_status === PROMOTION_REJECTED ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20' :
                    'bg-surface-container text-on-surface-variant border border-outline-variant/20'
                  }`}>
                    {detection.promotion_status.charAt(0).toUpperCase() + detection.promotion_status.slice(1)}
                  </span>
                </div>
              )}

              {detection.promoted_at && (
                <div>
                  <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Promoted At</span>
                  <p className="text-sm text-on-surface font-medium">
                    {new Date(detection.promoted_at).toLocaleDateString('en-US', { 
                      month: 'short', day: 'numeric', year: 'numeric' 
                    })}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </DetailCard>

      {/* Audit Log — reads from audit_events table, falls back to legacy JSONB */}
      <DetailCard title="Change History" description="Audit log of all modifications">
        {isLoadingEvents ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : auditEvents.length > 0 ? (
          <div className="relative pl-4">
            <div className="absolute left-[27px] top-4 bottom-4 w-px bg-outline-variant/30" />
            <div className="space-y-6">
              {auditEvents.map((event) => {
                const actionLabel = formatAuditEventAction(event.action);
                const actionIcon = getAuditEventIcon(event.action);
                const actionColor = getAuditEventColor(event.action);
                const hasChanges = event.old_values && event.new_values && event.changed_fields && event.changed_fields.length > 0;

                return (
                  <div key={event.id} className="relative flex gap-4 group">
                    <div className="relative z-10 w-8 h-8 rounded-full bg-surface-container border border-outline-variant/30 flex items-center justify-center flex-shrink-0 group-hover:border-primary/50 transition-colors">
                      <Icon name={actionIcon} className={`w-4 h-4 ${actionColor}`} />
                    </div>
                    <div className="flex-1 bg-surface-container rounded-xl border border-outline-variant/20 p-4 hover:border-primary/20 hover:bg-surface-container-high transition-all">
                      <div className="flex items-center justify-between gap-4 mb-1">
                        <p className="font-bold text-sm text-on-surface">{actionLabel}</p>
                        <span className="text-xs text-on-surface-variant whitespace-nowrap font-mono">
                          {new Date(event.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant mb-2">
                        by {event.user_email || 'System'}
                        {event.user_role && <span className="ml-1 opacity-60">({event.user_role})</span>}
                      </p>
                      {event.details && typeof event.details === 'object' && (event.details as any).message && (
                        <p className="text-sm text-on-surface leading-relaxed">{(event.details as any).message}</p>
                      )}
                      {hasChanges && (
                        <div className="mt-3 pt-3 border-t border-outline-variant/20">
                          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Field Changes</p>
                          <div className="space-y-1.5 bg-surface-container-low p-2 rounded-lg border border-outline-variant/10">
                            {event.changed_fields!.map((field) => {
                              const oldVal = (event.old_values as any)?.[field];
                              const newVal = (event.new_values as any)?.[field];
                              return (
                                <div key={field} className="text-xs grid grid-cols-[100px_1fr] gap-2 items-center">
                                  <span className="font-mono text-on-surface-variant truncate" title={field}>{field}</span>
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="text-error/80 line-through truncate max-w-[45%]">{String(oldVal ?? 'empty')}</span>
                                    <Icon name="arrow-right" className="w-3 h-3 text-on-surface-variant/50 flex-shrink-0" />
                                    <span className="text-green-500 truncate max-w-[45%]">{String(newVal ?? 'empty')}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : legacyAuditLog.length > 0 ? (
          /* Fallback to legacy JSONB auditLog */
          <div className="relative pl-4">
            <div className="absolute left-[27px] top-4 bottom-4 w-px bg-outline-variant/30" />
            <div className="space-y-6">
              {legacyAuditLog
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .map((entry) => (
                  <div key={entry.id} className="relative flex gap-4 group">
                    <div className="relative z-10 w-8 h-8 rounded-full bg-surface-container border border-outline-variant/30 flex items-center justify-center flex-shrink-0 group-hover:border-primary/50 transition-colors">
                      <Icon name={getActionIcon(entry.action)} className={`w-4 h-4 ${getActionColor(entry.action)}`} />
                    </div>
                    <div className="flex-1 bg-surface-container rounded-xl border border-outline-variant/20 p-4 hover:border-primary/20 hover:bg-surface-container-high transition-all">
                      <div className="flex items-center justify-between gap-4 mb-1">
                        <p className="font-bold text-sm text-on-surface">{formatAuditAction(entry.action)}</p>
                        <span className="text-xs text-on-surface-variant whitespace-nowrap font-mono">
                          {new Date(entry.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant mb-2">by {entry.userName}</p>
                      {entry.details && <p className="text-sm text-on-surface leading-relaxed">{entry.details}</p>}
                      {entry.changes && Object.keys(entry.changes).length > 0 && (
                        <div className="mt-3 pt-3 border-t border-outline-variant/20">
                          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Field Changes</p>
                          <div className="space-y-1.5 bg-surface-container-low p-2 rounded-lg border border-outline-variant/10">
                            {Object.entries(entry.changes).map(([field, change]) => {
                              const typedChange = change as { old: any; new: any };
                              return (
                                <div key={field} className="text-xs grid grid-cols-[100px_1fr] gap-2 items-center">
                                  <span className="font-mono text-on-surface-variant truncate" title={field}>{field}</span>
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="text-error/80 line-through truncate max-w-[45%]">{String(typedChange.old || 'empty')}</span>
                                    <Icon name="arrow-right" className="w-3 h-3 text-on-surface-variant/50 flex-shrink-0" />
                                    <span className="text-green-500 truncate max-w-[45%]">{String(typedChange.new || 'empty')}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-container-high flex items-center justify-center">
              <Icon name="clock" className="w-8 h-8 text-on-surface-variant/50" />
            </div>
            <p className="text-sm text-on-surface-variant">No history available yet.</p>
            <p className="text-xs text-on-surface-variant/70 mt-1">Changes will be tracked here as you edit this detection.</p>
          </div>
        )}
      </DetailCard>
    </div>
  );
};