import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from './Icon';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../hooks/useToast';
import { PublishRequest, Detection, LIBRARY_LABELS } from '../types';
import { LIBRARY_PRODUCTION } from '../constants/library';

interface MySubmissionsProps {
  userId: string;
  onNavigateToDetection?: (detectionId: string) => void;
  onBack?: () => void;
}

interface SubmissionWithDetection extends Omit<PublishRequest, 'detection'> {
  detection?: {
    id: string;
    name: string;
    description: string;
    severity: string;
    qualityScore: number;
  };
}

type SubmissionStatus = 'all' | 'pending' | 'approved' | 'rejected';

export const MySubmissions: React.FC<MySubmissionsProps> = ({
  userId,
  onNavigateToDetection,
  onBack
}) => {
  const { showToast } = useToast();
  const [submissions, setSubmissions] = useState<SubmissionWithDetection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<SubmissionStatus>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch user's submissions
  const fetchSubmissions = useCallback(async () => {
    // Guard against undefined userId
    if (!userId) {
      console.warn('fetchSubmissions: userId is undefined, skipping');
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    try {
      let query = supabase
        .from('promotion_requests')
        .select(`
          *,
          detection:detections!promotion_requests_detection_id_fkey(
            id, name, description, severity, "qualityScore"
          )
        `)
        .eq('submitted_by', userId)
        .order('submitted_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setSubmissions(data || []);
    } catch (err) {
      console.error('Error fetching submissions:', err);
      showToast('error', 'Error', 'Failed to load submissions');
    } finally {
      setIsLoading(false);
    }
  }, [userId, statusFilter, showToast]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  // Cancel a pending submission
  const handleCancelSubmission = async (requestId: string) => {
    try {
      const { error } = await supabase
        .from('promotion_requests')
        .update({ 
          status: 'cancelled',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', requestId)
        .eq('submitted_by', userId)
        .eq('status', 'pending');

      if (error) throw error;
      
      showToast('success', 'Cancelled', 'Submission has been cancelled');
      fetchSubmissions();
    } catch (err) {
      console.error('Error cancelling submission:', err);
      showToast('error', 'Error', 'Failed to cancel submission');
    }
  };

  // Re-submit a rejected detection
  const handleResubmit = async (detectionId: string) => {
    try {
      const { data, error } = await supabase.rpc('submit_for_publish', {
        p_detection_id: detectionId,
        p_user_id: userId
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (result.success) {
        showToast('success', 'Resubmitted', 'Detection has been resubmitted for review');
        fetchSubmissions();
      } else {
        showToast('error', 'Failed', result.error || 'Could not resubmit');
      }
    } catch (err: any) {
      console.error('Error resubmitting:', err);
      showToast('error', 'Error', err.message || 'Failed to resubmit');
    }
  };

  // Stats
  const stats = {
    total: submissions.length,
    pending: submissions.filter(s => s.status === 'pending').length,
    approved: submissions.filter(s => s.status === 'approved').length,
    rejected: submissions.filter(s => s.status === 'rejected').length,
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'pending':
        return { label: 'Pending Review', icon: 'clock', color: 'text-warning bg-warning/10' };
      case 'approved':
        return { label: 'Approved', icon: 'check-circle', color: 'text-tertiary bg-tertiary/10' };
      case 'rejected':
        return { label: 'Rejected', icon: 'x-circle', color: 'text-error bg-error/10' };
      case 'cancelled':
        return { label: 'Cancelled', icon: 'x', color: 'text-on-surface-variant bg-surface-container' };
      default:
        return { label: status, icon: 'circle', color: 'text-on-surface-variant bg-surface-container' };
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-outline-variant/30 bg-surface-container-low">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {onBack && (
              <button onClick={onBack} className="p-2 hover:bg-surface-container rounded-lg transition-colors text-on-surface-variant hover:text-on-surface">
                <Icon name="arrowLeft" className="w-5 h-5" />
              </button>
            )}
            <div>
              <h1 className="text-xl font-semibold text-on-surface">My Submissions</h1>
              <p className="text-xs text-on-surface-variant mt-0.5">Track your promotion submissions</p>
            </div>
          </div>
          
          <button onClick={fetchSubmissions} className="p-2 hover:bg-surface-container rounded-lg transition-colors text-on-surface-variant hover:text-on-surface">
            <Icon name="refresh" className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-outline-variant/20">
        <div className="grid grid-cols-4 gap-4">
          <button
            onClick={() => setStatusFilter('all')}
            className={`p-4 rounded-xl border transition-all text-left ${
              statusFilter === 'all' 
                ? 'border-primary bg-primary/5' 
                : 'border-outline-variant/30 bg-surface-container-low hover:bg-surface-container'
            }`}
          >
            <div className="text-2xl font-bold text-on-surface">{stats.total}</div>
            <div className="text-xs text-on-surface-variant mt-1">Total Submissions</div>
          </button>
          
          <button
            onClick={() => setStatusFilter('pending')}
            className={`p-4 rounded-xl border transition-all text-left ${
              statusFilter === 'pending' 
                ? 'border-warning bg-warning/5' 
                : 'border-outline-variant/30 bg-surface-container-low hover:bg-surface-container'
            }`}
          >
            <div className="text-2xl font-bold text-warning">{stats.pending}</div>
            <div className="text-xs text-on-surface-variant mt-1">Pending Review</div>
          </button>
          
          <button
            onClick={() => setStatusFilter('approved')}
            className={`p-4 rounded-xl border transition-all text-left ${
              statusFilter === 'approved' 
                ? 'border-tertiary bg-tertiary/5' 
                : 'border-outline-variant/30 bg-surface-container-low hover:bg-surface-container'
            }`}
          >
            <div className="text-2xl font-bold text-tertiary">{stats.approved}</div>
            <div className="text-xs text-on-surface-variant mt-1">Approved</div>
          </button>
          
          <button
            onClick={() => setStatusFilter('rejected')}
            className={`p-4 rounded-xl border transition-all text-left ${
              statusFilter === 'rejected' 
                ? 'border-error bg-error/5' 
                : 'border-outline-variant/30 bg-surface-container-low hover:bg-surface-container'
            }`}
          >
            <div className="text-2xl font-bold text-error">{stats.rejected}</div>
            <div className="text-xs text-on-surface-variant mt-1">Rejected</div>
          </button>
        </div>
      </div>

      {/* Submissions List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Icon name="spinner" className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : submissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-4 bg-surface-container rounded-full mb-4">
              <Icon name="inbox" className="w-8 h-8 text-on-surface-variant/50" />
            </div>
            <h3 className="text-lg font-medium text-on-surface mb-1">No Submissions</h3>
            <p className="text-sm text-on-surface-variant max-w-sm">
              {statusFilter === 'all' 
                ? `You haven't submitted any detections for promotion yet.`
                : `No ${statusFilter} submissions found.`
              }
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map(submission => {
              const statusConfig = getStatusConfig(submission.status);
              const isExpanded = expandedId === submission.id;
              
              return (
                <div
                  key={submission.id}
                  className="bg-surface-container-low rounded-xl border border-outline-variant/30 overflow-hidden"
                >
                  {/* Main Row */}
                  <div 
                    className="p-4 flex items-center gap-4 cursor-pointer hover:bg-surface-container/50 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : submission.id)}
                  >
                    {/* Status Badge */}
                    <div className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${statusConfig.color}`}>
                      <Icon name={statusConfig.icon} className="w-3 h-3" />
                      {statusConfig.label}
                    </div>
                    
                    {/* Detection Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-on-surface truncate">
                        {submission.detection?.name || 'Unknown Detection'}
                      </div>
                      <div className="text-xs text-on-surface-variant mt-0.5">
                        Submitted {formatDate(submission.submitted_at)}
                      </div>
                    </div>
                    
                    {/* Quality Score */}
                    {submission.detection?.qualityScore !== undefined && (
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-surface-container rounded-lg">
                        <span className="text-xs font-mono font-bold text-on-surface">{submission.detection.qualityScore}</span>
                        <span className="text-[10px] text-on-surface-variant">Quality</span>
                      </div>
                    )}
                    
                    {/* Expand Icon */}
                    <Icon 
                      name={isExpanded ? 'chevron-up' : 'chevron-down'} 
                      className="w-4 h-4 text-on-surface-variant/50" 
                    />
                  </div>
                  
                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-outline-variant/20 bg-surface-container/30">
                      {/* Description */}
                      {submission.detection?.description && (
                        <p className="text-sm text-on-surface-variant mb-4 line-clamp-2">
                          {submission.detection.description}
                        </p>
                      )}
                      
                      {/* Rejection Reason */}
                      {submission.status === 'rejected' && submission.review_notes && (
                        <div className="mb-4 p-3 bg-error/5 border border-error/20 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <Icon name="alert-circle" className="w-4 h-4 text-error" />
                            <span className="text-xs font-bold text-error uppercase tracking-wider">Rejection Reason</span>
                          </div>
                          <p className="text-sm text-on-surface">{submission.review_notes}</p>
                        </div>
                      )}
                      
                      {/* Approval Notes */}
                      {submission.status === 'approved' && submission.review_notes && (
                        <div className="mb-4 p-3 bg-tertiary/5 border border-tertiary/20 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <Icon name="info" className="w-4 h-4 text-tertiary" />
                            <span className="text-xs font-bold text-tertiary uppercase tracking-wider">Admin Notes</span>
                          </div>
                          <p className="text-sm text-on-surface">{submission.review_notes}</p>
                        </div>
                      )}
                      
                      {/* Timeline */}
                      <div className="flex items-center gap-4 text-xs text-on-surface-variant mb-4">
                        <span>Submitted: {formatDate(submission.submitted_at)}</span>
                        {submission.reviewed_at && (
                          <>
                            <span className="text-on-surface-variant/30">•</span>
                            <span>Resolved: {formatDate(submission.reviewed_at)}</span>
                          </>
                        )}
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {onNavigateToDetection && submission.detection_id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateToDetection(submission.detection_id);
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <Icon name="eye" className="w-3.5 h-3.5" />
                            View Detection
                          </button>
                        )}

                        {submission.status === 'pending' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelSubmission(submission.id);
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-error hover:bg-error/10 rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <Icon name="x" className="w-3.5 h-3.5" />
                            Cancel Submission
                          </button>
                        )}

                        {submission.status === 'rejected' && submission.detection_id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResubmit(submission.detection_id);
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <Icon name="refresh" className="w-3.5 h-3.5" />
                            Resubmit for Review
                          </button>
                        )}

                        {submission.status === 'approved' && submission.result_rule_id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onNavigateToDetection) {
                                onNavigateToDetection(submission.result_rule_id!);
                              }
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-tertiary bg-tertiary/10 hover:bg-tertiary/20 rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <Icon name="external-link" className="w-3.5 h-3.5" />
                            View in {LIBRARY_LABELS[LIBRARY_PRODUCTION]}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MySubmissions;