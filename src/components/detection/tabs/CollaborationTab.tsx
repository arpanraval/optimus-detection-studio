import React, { useState, useEffect, useMemo } from 'react';
import { Detection, DetectionComment, DetectionReview, TeamMember, Profile, ReviewStatus, CommentType } from '../../../types';
import { Icon } from '../../Icon';
import { useAssignment } from '../../../hooks/useAssignment';
import { useReview } from '../../../hooks/useReview';
import { useDetectionComments } from '../../../hooks/useDetectionComments';
import { useTeam } from '../../../context/TeamContext';
import { supabase } from '../../../lib/supabaseClient';
import { ReviewStatusBadge } from '../../rbac/ReviewStatusBadge';

// =============================================================================
// TYPES
// =============================================================================

interface CollaborationTabProps {
    detection: Detection;
    onDetectionUpdate?: (detection: Detection) => void;
}

// =============================================================================
// SHARED COMPONENTS
// =============================================================================

const DetailCard: React.FC<{ title: string; description?: string; headerRight?: React.ReactNode; children: React.ReactNode }> = ({ title, description, headerRight, children }) => (
  <section className="rounded-2xl overflow-hidden mb-6 border border-outline-variant/30 bg-surface-container-low">
    <div className="px-6 py-5 border-b border-outline-variant/30 bg-surface-container-low flex items-center justify-between">
      <div>
        <h3 className="text-base font-medium text-on-surface">{title}</h3>
        {description && (
          <p className="text-sm mt-0.5 text-on-surface-variant">{description}</p>
        )}
      </div>
      {headerRight}
    </div>
    <div className="p-6 space-y-5">
      {children}
    </div>
  </section>
);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const formatRelativeTime = (date: string): string => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return then.toLocaleDateString();
};

const getInitials = (name?: string, email?: string): string => {
    if (name) {
        const parts = name.split(' ');
        return parts.length > 1
            ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
            : name.slice(0, 2).toUpperCase();
    }
    return email ? email.slice(0, 2).toUpperCase() : '??';
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const CollaborationTab: React.FC<CollaborationTabProps> = ({
    detection,
    onDetectionUpdate,
}) => {
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [assigneeProfile, setAssigneeProfile] = useState<Profile | null>(null);

    // Get current user
    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) setCurrentUserId(user.id);
        };
        getUser();
    }, []);

    // Fetch assignee profile if assigned
    useEffect(() => {
        const fetchAssignee = async () => {
            if (detection.assigned_to) {
                const { data } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', detection.assigned_to)
                    .single();
                if (data) setAssigneeProfile(data);
            } else {
                setAssigneeProfile(null);
            }
        };
        fetchAssignee();
    }, [detection.assigned_to]);

    return (
        <div className="animate-fade-in space-y-6">
            {/* Assignment & Review Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <AssignmentPanel
                    detection={detection}
                    currentUserId={currentUserId}
                    assigneeProfile={assigneeProfile}
                    onDetectionUpdate={onDetectionUpdate}
                />
                <ReviewPanel
                    detection={detection}
                    currentUserId={currentUserId}
                    onDetectionUpdate={onDetectionUpdate}
                />
            </div>

            {/* Comments Section */}
            <CommentsPanel
                detection={detection}
                currentUserId={currentUserId}
            />
        </div>
    );
};

// =============================================================================
// ASSIGNMENT PANEL
// =============================================================================

interface AssignmentPanelProps {
    detection: Detection;
    currentUserId: string | null;
    assigneeProfile: Profile | null;
    onDetectionUpdate?: (detection: Detection) => void;
}

const AssignmentPanel: React.FC<AssignmentPanelProps> = ({
    detection,
    currentUserId,
    assigneeProfile,
    onDetectionUpdate,
}) => {
    const { members } = useTeam();
    const { assignDetection, selfAssign, unassignDetection, isAssigning } = useAssignment({
        onAssignmentChange: onDetectionUpdate,
    });

    const [showAssignDropdown, setShowAssignDropdown] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const isAssignedToMe = detection.assigned_to === currentUserId;
    const hasAssignee = !!detection.assigned_to;

    // Filter members for dropdown
    const filteredMembers = useMemo(() => {
        if (!searchQuery.trim()) return members.filter(m => m.status === 'active');
        const q = searchQuery.toLowerCase();
        return members.filter(m =>
            m.status === 'active' &&
            (m.user?.full_name?.toLowerCase().includes(q) ||
             m.user?.email?.toLowerCase().includes(q))
        );
    }, [members, searchQuery]);

    const handleAssign = async (userId: string) => {
        await assignDetection(detection, userId);
        setShowAssignDropdown(false);
        setSearchQuery('');
    };

    const handleSelfAssign = async () => {
        await selfAssign(detection);
    };

    const handleUnassign = async () => {
        await unassignDetection(detection);
    };

    return (
        <DetailCard
            title="Assignment"
            description="Who is responsible for this detection"
            headerRight={hasAssignee && !isAssigning ? (
                <button
                    onClick={handleUnassign}
                    className="text-xs text-on-surface-variant hover:text-error transition-colors"
                >
                    Unassign
                </button>
            ) : undefined}
        >
            {hasAssignee && assigneeProfile ? (
                <div className="flex items-center gap-4 p-4 rounded-xl bg-surface-container border border-outline-variant/20">
                    <div className="w-10 h-10 rounded-full bg-tertiary/10 text-tertiary flex items-center justify-center font-medium text-sm">
                        {getInitials(assigneeProfile.full_name, assigneeProfile.email)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">
                            {assigneeProfile.full_name || assigneeProfile.email?.split('@')[0]}
                            {isAssignedToMe && (
                                <span className="ml-2 text-xs text-tertiary">(You)</span>
                            )}
                        </p>
                        <p className="text-xs text-on-surface-variant truncate">
                            {assigneeProfile.email}
                        </p>
                    </div>
                    {detection.assigned_at && (
                        <span className="text-xs text-on-surface-variant/60">
                            {formatRelativeTime(detection.assigned_at)}
                        </span>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="text-center py-4 bg-surface-container rounded-xl border border-dashed border-outline-variant/30">
                        <p className="text-sm text-on-surface-variant italic">No one assigned</p>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handleSelfAssign}
                            disabled={isAssigning}
                            className="flex-1 px-3 py-2.5 text-sm font-medium bg-tertiary/10 text-tertiary rounded-lg hover:bg-tertiary/20 transition-colors disabled:opacity-50"
                        >
                            {isAssigning ? 'Assigning...' : 'Assign to me'}
                        </button>

                        <div className="relative">
                            <button
                                onClick={() => setShowAssignDropdown(!showAssignDropdown)}
                                disabled={isAssigning}
                                className="px-3 py-2.5 text-sm font-medium bg-surface-container text-on-surface rounded-lg hover:bg-surface-container-high transition-colors disabled:opacity-50 border border-outline-variant/20"
                            >
                                <Icon name="users" className="w-4 h-4" />
                            </button>

                            {showAssignDropdown && (
                                <div className="absolute right-0 top-full mt-1 w-64 bg-surface-container-high border border-outline-variant/20 rounded-xl shadow-xl z-50 overflow-hidden">
                                    <div className="p-2 border-b border-outline-variant/10">
                                        <input
                                            type="text"
                                            placeholder="Search team members..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full px-3 py-2 text-sm bg-surface-container border border-outline-variant/10 rounded-lg text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-tertiary/30"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="max-h-48 overflow-y-auto">
                                        {filteredMembers.length === 0 ? (
                                            <p className="px-3 py-4 text-sm text-on-surface-variant text-center">
                                                No members found
                                            </p>
                                        ) : (
                                            filteredMembers.map((member) => (
                                                <button
                                                    key={member.user_id}
                                                    onClick={() => handleAssign(member.user_id)}
                                                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-container-highest transition-colors text-left"
                                                >
                                                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                                                        {getInitials(member.user?.full_name, member.user?.email)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-on-surface truncate">
                                                            {member.user?.full_name || member.user?.email?.split('@')[0]}
                                                        </p>
                                                        <p className="text-xs text-on-surface-variant truncate">
                                                            {member.role}
                                                        </p>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </DetailCard>
    );
};

// =============================================================================
// REVIEW PANEL
// =============================================================================

interface ReviewPanelProps {
    detection: Detection;
    currentUserId: string | null;
    onDetectionUpdate?: (detection: Detection) => void;
}

const ReviewPanel: React.FC<ReviewPanelProps> = ({
    detection,
    currentUserId,
    onDetectionUpdate,
}) => {
    const {
        requestReview,
        startReview,
        completeReview,
        cancelReview,
        getCurrentReview,
        isSubmitting
    } = useReview({ onReviewChange: onDetectionUpdate });

    const [currentReview, setCurrentReview] = useState<DetectionReview | null>(null);
    const [reviewNotes, setReviewNotes] = useState('');
    const [showReviewForm, setShowReviewForm] = useState(false);
    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

    // Get current user role
    useEffect(() => {
        const fetchUserRole = async () => {
            if (!currentUserId) return;
            const { data } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', currentUserId)
                .single();
            if (data) setCurrentUserRole(data.role);
        };
        fetchUserRole();
    }, [currentUserId]);

    // Fetch current review and sync detection status if stale
    useEffect(() => {
        const fetchReview = async () => {
            const review = await getCurrentReview(detection.id);
            setCurrentReview(review);

            // Sync detection review_status if it's out of date
            // (e.g. review was started from Approval Queue)
            if (review && onDetectionUpdate) {
                const expectedStatus = review.status === 'in_progress' ? 'in_review' : review.status === 'pending' ? 'requested' : detection.review_status;
                if (expectedStatus && expectedStatus !== detection.review_status) {
                    onDetectionUpdate({
                        ...detection,
                        review_status: expectedStatus as ReviewStatus,
                        reviewer_id: review.reviewer_id || detection.reviewer_id,
                    });
                }
            }
        };
        fetchReview();
    }, [detection.id, detection.review_status, getCurrentReview]);

    const reviewStatus = detection.review_status || 'none';
    const isReviewer = currentReview?.reviewer_id === currentUserId;
    const isRequester = currentReview?.requested_by === currentUserId;
    const isDetectionOwner = detection.user_id === currentUserId;
    const isPersonalDetection = !detection.team_id;

    const canRequestReview = isDetectionOwner && (reviewStatus === 'none' || reviewStatus === 'rejected');
    // Personal detections: owner can self-review; Team detections: lead+ and not requester
    const canStartReview = reviewStatus === 'requested' && (
        isPersonalDetection
            ? isDetectionOwner
            : (!isRequester && (currentUserRole === 'lead' || currentUserRole === 'admin' || currentUserRole === 'owner'))
    );
    const canCompleteReview = reviewStatus === 'in_review' && isReviewer;

    const handleRequestReview = async () => {
        await requestReview(detection, reviewNotes);
        setReviewNotes('');
        setShowReviewForm(false);
    };

    const handleStartReview = async () => {
        await startReview(detection);
    };

    const handleApprove = async () => {
        await completeReview(detection, true, reviewNotes);
        setReviewNotes('');
        setShowReviewForm(false);
    };

    const handleReject = async () => {
        if (!reviewNotes.trim()) return;
        await completeReview(detection, false, reviewNotes);
        setReviewNotes('');
        setShowReviewForm(false);
    };

    const handleCancelReview = async () => {
        await cancelReview(detection);
    };

    return (
        <DetailCard
            title="Review"
            description="Peer review workflow"
            headerRight={<ReviewStatusBadge status={reviewStatus} size="sm" />}
        >
            {/* No review */}
            {reviewStatus === 'none' && (
                <div className="space-y-4">
                    <div className="text-center py-4 bg-surface-container rounded-xl border border-dashed border-outline-variant/30">
                        <p className="text-sm text-on-surface-variant italic">No review requested</p>
                    </div>
                    {canRequestReview ? (
                        showReviewForm ? (
                            <div className="space-y-3">
                                <textarea
                                    placeholder="Add notes for the reviewer (optional)..."
                                    value={reviewNotes}
                                    onChange={(e) => setReviewNotes(e.target.value)}
                                    rows={2}
                                    className="w-full px-3 py-2 text-sm bg-surface-container border border-outline-variant/20 rounded-lg text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-tertiary/30 resize-none"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleRequestReview}
                                        disabled={isSubmitting}
                                        className="flex-1 px-3 py-2.5 text-sm font-medium bg-tertiary text-on-tertiary rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                                    >
                                        {isSubmitting ? 'Requesting...' : 'Request Review'}
                                    </button>
                                    <button
                                        onClick={() => setShowReviewForm(false)}
                                        className="px-3 py-2.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowReviewForm(true)}
                                className="w-full px-3 py-2.5 text-sm font-medium bg-tertiary/10 text-tertiary rounded-lg hover:bg-tertiary/20 transition-colors"
                            >
                                Request Review
                            </button>
                        )
                    ) : (
                        <p className="text-xs text-on-surface-variant/60 text-center">
                            Only the detection owner can request a review
                        </p>
                    )}
                </div>
            )}

            {/* Review requested */}
            {reviewStatus === 'requested' && (
                <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                        <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center flex-shrink-0">
                            <Icon name="clock" className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-on-surface">Awaiting reviewer</p>
                            {currentReview?.requester && (
                                <p className="text-xs text-on-surface-variant">
                                    Requested by {currentReview.requester.full_name || currentReview.requester.email}
                                    {currentReview.requested_at && ` · ${formatRelativeTime(currentReview.requested_at)}`}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {canStartReview && (
                            <button
                                onClick={handleStartReview}
                                disabled={isSubmitting}
                                className="flex-1 px-3 py-2.5 text-sm font-medium bg-tertiary text-on-tertiary rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                            >
                                {isSubmitting ? 'Starting...' : 'Start Review'}
                            </button>
                        )}
                        {isRequester && (
                            <button
                                onClick={handleCancelReview}
                                disabled={isSubmitting}
                                className="px-3 py-2.5 text-sm text-on-surface-variant hover:text-error transition-colors"
                            >
                                Cancel Request
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Review in progress */}
            {reviewStatus === 'in_review' && (
                <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center flex-shrink-0">
                            <Icon name="eye" className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-on-surface">Review in progress</p>
                            {currentReview?.reviewer && (
                                <p className="text-xs text-on-surface-variant">
                                    Being reviewed by {currentReview.reviewer.full_name || currentReview.reviewer.email}
                                </p>
                            )}
                        </div>
                    </div>
                    {canCompleteReview && (
                        showReviewForm ? (
                            <div className="space-y-3">
                                <textarea
                                    placeholder="Review feedback..."
                                    value={reviewNotes}
                                    onChange={(e) => setReviewNotes(e.target.value)}
                                    rows={3}
                                    className="w-full px-3 py-2 text-sm bg-surface-container border border-outline-variant/20 rounded-lg text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-tertiary/30 resize-none"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleApprove}
                                        disabled={isSubmitting}
                                        className="flex-1 px-3 py-2.5 text-sm font-medium bg-emerald-500 text-white rounded-lg hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                                    >
                                        Approve
                                    </button>
                                    <button
                                        onClick={handleReject}
                                        disabled={isSubmitting || !reviewNotes.trim()}
                                        className="flex-1 px-3 py-2.5 text-sm font-medium bg-error text-on-error rounded-lg hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                                        title={!reviewNotes.trim() ? 'Add feedback before rejecting' : ''}
                                    >
                                        Request Changes
                                    </button>
                                </div>
                                <button
                                    onClick={() => setShowReviewForm(false)}
                                    className="w-full text-xs text-on-surface-variant hover:text-on-surface transition-colors py-1"
                                >
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowReviewForm(true)}
                                className="w-full px-3 py-2.5 text-sm font-medium bg-tertiary/10 text-tertiary rounded-lg hover:bg-tertiary/20 transition-colors"
                            >
                                Complete Review
                            </button>
                        )
                    )}
                </div>
            )}

            {/* Approved */}
            {reviewStatus === 'approved' && (
                <div className="space-y-3">
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center flex-shrink-0">
                            <Icon name="check-circle" className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-on-surface">Approved</p>
                            {detection.reviewed_at && (
                                <p className="text-xs text-on-surface-variant">
                                    {formatRelativeTime(detection.reviewed_at)}
                                </p>
                            )}
                        </div>
                    </div>
                    {detection.review_notes && (
                        <div className="p-4 bg-surface-container rounded-xl border border-outline-variant/20">
                            <p className="text-sm text-on-surface-variant whitespace-pre-wrap">{detection.review_notes}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Rejected */}
            {reviewStatus === 'rejected' && (
                <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-error/5 border border-error/10">
                        <div className="w-10 h-10 rounded-full bg-error/10 text-error flex items-center justify-center flex-shrink-0">
                            <Icon name="x-circle" className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-on-surface">Changes requested</p>
                        </div>
                    </div>
                    {detection.review_notes && (
                        <div className="p-4 bg-error/5 rounded-xl border border-error/10">
                            <p className="text-sm text-on-surface-variant whitespace-pre-wrap">{detection.review_notes}</p>
                        </div>
                    )}
                    {canRequestReview && (
                        <button
                            onClick={() => setShowReviewForm(true)}
                            className="w-full px-3 py-2.5 text-sm font-medium bg-tertiary/10 text-tertiary rounded-lg hover:bg-tertiary/20 transition-colors"
                        >
                            Request New Review
                        </button>
                    )}
                </div>
            )}
        </DetailCard>
    );
};

// =============================================================================
// COMMENTS PANEL
// =============================================================================

interface CommentsPanelProps {
    detection: Detection;
    currentUserId: string | null;
}

const CommentsPanel: React.FC<CommentsPanelProps> = ({
    detection,
    currentUserId,
}) => {
    const {
        comments,
        isLoading,
        isSubmitting,
        addComment,
        editComment,
        deleteComment,
        resolveComment,
        unresolveComment,
        getCommentCounts,
    } = useDetectionComments({ detectionId: detection.id });

    const [newComment, setNewComment] = useState('');
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyContent, setReplyContent] = useState('');
    const [showResolved, setShowResolved] = useState(false);

    const { total, resolved, unresolved } = getCommentCounts();

    const handleSubmitComment = async () => {
        if (!newComment.trim()) return;
        const result = await addComment(newComment);
        if (result.success) setNewComment('');
    };

    const handleSubmitReply = async (parentId: string) => {
        if (!replyContent.trim()) return;
        const result = await addComment(replyContent, parentId);
        if (result.success) {
            setReplyContent('');
            setReplyingTo(null);
        }
    };

    const filteredComments = showResolved
        ? comments
        : comments.filter(c => !c.is_resolved);

    return (
        <DetailCard
            title="Comments"
            description={total > 0 ? `${unresolved} active${resolved > 0 ? ` · ${resolved} resolved` : ''}` : 'Discussion and feedback'}
            headerRight={resolved > 0 ? (
                <button
                    onClick={() => setShowResolved(!showResolved)}
                    className="text-xs text-on-surface-variant hover:text-on-surface transition-colors"
                >
                    {showResolved ? 'Hide resolved' : 'Show resolved'}
                </button>
            ) : undefined}
        >
            {/* New Comment Input */}
            <div className="flex gap-3">
                <div className="w-9 h-9 rounded-full bg-tertiary/10 text-tertiary flex items-center justify-center text-xs font-medium flex-shrink-0">
                    You
                </div>
                <div className="flex-1">
                    <textarea
                        placeholder="Add a comment..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 text-sm bg-surface-container border border-outline-variant/20 rounded-lg text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-tertiary/30 resize-none"
                    />
                    {newComment.trim() && (
                        <div className="flex justify-end mt-2">
                            <button
                                onClick={handleSubmitComment}
                                disabled={isSubmitting}
                                className="px-4 py-1.5 text-sm font-medium bg-tertiary text-on-tertiary rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                            >
                                {isSubmitting ? 'Posting...' : 'Post'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Comments List */}
            {isLoading ? (
                <div className="flex items-center justify-center py-8">
                    <Icon name="spinner" className="w-5 h-5 animate-spin text-on-surface-variant/50" />
                </div>
            ) : filteredComments.length === 0 ? (
                <div className="text-center py-6 bg-surface-container rounded-xl border border-dashed border-outline-variant/30">
                    <p className="text-sm text-on-surface-variant italic">
                        No comments yet. Be the first to add one!
                    </p>
                </div>
            ) : (
                <div className="space-y-1">
                    {filteredComments.map((comment) => (
                        <CommentItem
                            key={comment.id}
                            comment={comment}
                            currentUserId={currentUserId}
                            onReply={() => setReplyingTo(comment.id)}
                            onResolve={() => resolveComment(comment.id)}
                            onUnresolve={() => unresolveComment(comment.id)}
                            onDelete={() => deleteComment(comment.id)}
                            isReplying={replyingTo === comment.id}
                            replyContent={replyContent}
                            onReplyContentChange={setReplyContent}
                            onSubmitReply={() => handleSubmitReply(comment.id)}
                            onCancelReply={() => { setReplyingTo(null); setReplyContent(''); }}
                            isSubmitting={isSubmitting}
                        />
                    ))}
                </div>
            )}
        </DetailCard>
    );
};

// =============================================================================
// COMMENT ITEM
// =============================================================================

interface CommentItemProps {
    comment: DetectionComment;
    currentUserId: string | null;
    onReply: () => void;
    onResolve: () => void;
    onUnresolve: () => void;
    onDelete: () => void;
    isReplying: boolean;
    replyContent: string;
    onReplyContentChange: (value: string) => void;
    onSubmitReply: () => void;
    onCancelReply: () => void;
    isSubmitting: boolean;
}

const CommentItem: React.FC<CommentItemProps> = ({
    comment,
    currentUserId,
    onReply,
    onResolve,
    onUnresolve,
    onDelete,
    isReplying,
    replyContent,
    onReplyContentChange,
    onSubmitReply,
    onCancelReply,
    isSubmitting,
}) => {
    const isOwner = comment.user_id === currentUserId;

    return (
        <div className={`rounded-xl p-4 ${comment.is_resolved ? 'opacity-50' : 'bg-surface-container border border-outline-variant/20'}`}>
            <div className="flex gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium flex-shrink-0">
                    {getInitials(comment.user?.full_name, comment.user?.email)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-on-surface">
                            {comment.user?.full_name || comment.user?.email?.split('@')[0]}
                        </span>
                        <span className="text-xs text-on-surface-variant/60">
                            {formatRelativeTime(comment.created_at)}
                        </span>
                        {comment.is_resolved && (
                            <span className="text-[10px] font-medium text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                Resolved
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">
                        {comment.content}
                    </p>

                    {/* Actions */}
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-outline-variant/10">
                        <button
                            onClick={onReply}
                            className="text-xs text-on-surface-variant/60 hover:text-on-surface transition-colors"
                        >
                            Reply
                        </button>
                        {!comment.is_resolved ? (
                            <button
                                onClick={onResolve}
                                className="text-xs text-on-surface-variant/60 hover:text-emerald-500 transition-colors"
                            >
                                Resolve
                            </button>
                        ) : (
                            <button
                                onClick={onUnresolve}
                                className="text-xs text-on-surface-variant/60 hover:text-on-surface transition-colors"
                            >
                                Reopen
                            </button>
                        )}
                        {isOwner && (
                            <button
                                onClick={onDelete}
                                className="text-xs text-on-surface-variant/60 hover:text-error transition-colors"
                            >
                                Delete
                            </button>
                        )}
                    </div>

                    {/* Reply Input */}
                    {isReplying && (
                        <div className="mt-3 flex gap-2">
                            <input
                                type="text"
                                placeholder="Write a reply..."
                                value={replyContent}
                                onChange={(e) => onReplyContentChange(e.target.value)}
                                className="flex-1 px-3 py-2 text-sm bg-surface-container-low border border-outline-variant/20 rounded-lg text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-tertiary/30"
                                autoFocus
                            />
                            <button
                                onClick={onSubmitReply}
                                disabled={isSubmitting || !replyContent.trim()}
                                className="px-3 py-2 text-sm font-medium bg-tertiary text-on-tertiary rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                            >
                                Reply
                            </button>
                            <button
                                onClick={onCancelReply}
                                className="px-3 py-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    )}

                    {/* Replies */}
                    {comment.replies && comment.replies.length > 0 && (
                        <div className="mt-3 pl-4 border-l-2 border-outline-variant/10 space-y-3">
                            {comment.replies.map((reply) => (
                                <div key={reply.id} className="flex gap-2">
                                    <div className="w-7 h-7 rounded-full bg-surface-container-highest text-on-surface-variant flex items-center justify-center text-[10px] font-medium flex-shrink-0">
                                        {getInitials(reply.user?.full_name, reply.user?.email)}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium text-on-surface">
                                                {reply.user?.full_name || reply.user?.email?.split('@')[0]}
                                            </span>
                                            <span className="text-[10px] text-on-surface-variant/60">
                                                {formatRelativeTime(reply.created_at)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-on-surface-variant">
                                            {reply.content}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CollaborationTab;
