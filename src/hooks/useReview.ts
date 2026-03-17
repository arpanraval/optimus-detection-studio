import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { 
  Detection, 
  DetectionReview, 
  ReviewStatus, 
  ReviewRequestStatus,
  ReviewChecklistItem,
  DEFAULT_REVIEW_CHECKLIST,
  Profile 
} from '../types';
import { useToast } from './useToast';

interface UseReviewOptions {
  onReviewChange?: (detection: Detection) => void;
}

interface ReviewResult {
  success: boolean;
  review?: DetectionReview;
  error?: string;
}

export const useReview = (options: UseReviewOptions = {}) => {
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Request a review for a detection (via edge function for authorization)
   */
  const requestReview = useCallback(async (
    detection: Detection,
    notes?: string
  ): Promise<ReviewResult> => {
    setIsSubmitting(true);

    try {
      // Create checklist for the review
      const checklist: ReviewChecklistItem[] = DEFAULT_REVIEW_CHECKLIST.map((item, idx) => ({
        id: `check-${idx}`,
        ...item,
      }));

      // Call edge function with proper server-side authorization
      const { data, error } = await supabase.functions.invoke('review-ops', {
        body: {
          action: 'request',
          detectionId: detection.id,
          notes,
          checklist,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      showToast('success', 'Review Requested', 'Your detection is pending review');

      if (options.onReviewChange) {
        options.onReviewChange({
          ...detection,
          review_status: 'requested',
          review_requested_at: new Date().toISOString(),
        });
      }

      return { success: true, review: data.review };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to request review';
      showToast('error', 'Request Failed', errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsSubmitting(false);
    }
  }, [showToast, options]);

  /**
   * Start reviewing a detection (via edge function for authorization)
   * Only lead+ role can start reviews, and cannot self-review
   */
  const startReview = useCallback(async (
    detection: Detection
  ): Promise<ReviewResult> => {
    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Call edge function with proper server-side authorization
      const { data, error } = await supabase.functions.invoke('review-ops', {
        body: {
          action: 'start',
          detectionId: detection.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      showToast('success', 'Review Started', 'You are now reviewing this detection');

      if (options.onReviewChange) {
        options.onReviewChange({
          ...detection,
          review_status: 'in_review',
          reviewer_id: user.id,
        });
      }

      return { success: true, review: data.review };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start review';
      showToast('error', 'Error', errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsSubmitting(false);
    }
  }, [showToast, options]);

  /**
   * Complete a review (via edge function for authorization)
   * Only assigned reviewer can complete
   */
  const completeReview = useCallback(async (
    detection: Detection,
    approved: boolean,
    notes?: string,
    checklist?: ReviewChecklistItem[]
  ): Promise<ReviewResult> => {
    setIsSubmitting(true);

    try {
      const now = new Date().toISOString();
      const detectionReviewStatus: ReviewStatus = approved ? 'approved' : 'rejected';

      // Call edge function with proper server-side authorization
      const { data, error } = await supabase.functions.invoke('review-ops', {
        body: {
          action: 'complete',
          detectionId: detection.id,
          approved,
          notes,
          checklist,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      showToast(
        'success',
        approved ? 'Approved' : 'Changes Requested',
        approved ? 'Detection approved' : 'Review feedback submitted'
      );

      if (options.onReviewChange) {
        options.onReviewChange({
          ...detection,
          review_status: detectionReviewStatus,
          reviewed_at: now,
          review_notes: notes,
        });
      }

      return { success: true, review: data.review };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to complete review';
      showToast('error', 'Error', errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsSubmitting(false);
    }
  }, [showToast, options]);

  /**
   * Cancel a review request (via edge function for authorization)
   * Requester, assigned reviewer, or lead+ can cancel
   */
  const cancelReview = useCallback(async (
    detection: Detection
  ): Promise<{ success: boolean; error?: string }> => {
    setIsSubmitting(true);

    try {
      // Call edge function with proper server-side authorization
      const { data, error } = await supabase.functions.invoke('review-ops', {
        body: {
          action: 'cancel',
          detectionId: detection.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      showToast('success', 'Cancelled', 'Review request cancelled');

      if (options.onReviewChange) {
        options.onReviewChange({
          ...detection,
          review_status: 'none',
          reviewer_id: undefined,
          review_requested_at: undefined,
        });
      }

      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to cancel review';
      showToast('error', 'Error', errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsSubmitting(false);
    }
  }, [showToast, options]);

  /**
   * Get review history for a detection
   */
  const getReviewHistory = useCallback(async (
    detectionId: string
  ): Promise<DetectionReview[]> => {
    try {
      const { data, error } = await supabase
        .from('detection_reviews')
        .select('*')
        .eq('detection_id', detectionId)
        .order('requested_at', { ascending: false });

      if (error) throw error;

      // Fetch profiles separately to avoid PostgREST FK hint issues
      const userIds = new Set<string>();
      for (const r of data || []) {
        if (r.requested_by) userIds.add(r.requested_by);
        if (r.reviewer_id) userIds.add(r.reviewer_id);
      }

      let profileMap: Record<string, Profile> = {};
      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, full_name, avatar_url')
          .in('id', Array.from(userIds));
        if (profiles) {
          profileMap = Object.fromEntries(profiles.map(p => [p.id, p as Profile]));
        }
      }

      return (data || []).map(d => ({
        ...d,
        requester: profileMap[d.requested_by] || null,
        reviewer: profileMap[d.reviewer_id] || null,
      }));

    } catch (err) {
      console.error('Failed to fetch review history:', err);
      return [];
    }
  }, []);

  /**
   * Get current active review for a detection
   */
  const getCurrentReview = useCallback(async (
    detectionId: string
  ): Promise<DetectionReview | null> => {
    try {
      const { data, error } = await supabase
        .from('detection_reviews')
        .select('*')
        .eq('detection_id', detectionId)
        .in('status', ['pending', 'in_progress'])
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) return null;

      // Fetch profiles separately
      const userIds = [data.requested_by, data.reviewer_id].filter(Boolean);
      let profileMap: Record<string, Profile> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, full_name, avatar_url')
          .in('id', userIds);
        if (profiles) {
          profileMap = Object.fromEntries(profiles.map(p => [p.id, p as Profile]));
        }
      }

      return {
        ...data,
        requester: profileMap[data.requested_by] || null,
        reviewer: profileMap[data.reviewer_id] || null,
      };

    } catch (err) {
      console.error('Failed to fetch current review:', err);
      return null;
    }
  }, []);

  /**
   * Get detections pending review (for reviewers)
   */
  const getPendingReviews = useCallback(async (): Promise<DetectionReview[]> => {
    try {
      const { data, error } = await supabase
        .from('detection_reviews')
        .select('*')
        .eq('status', 'pending')
        .order('requested_at', { ascending: true });

      if (error) throw error;

      // Fetch related profiles and detections separately
      const userIds = new Set<string>();
      const detectionIds = new Set<string>();
      for (const r of data || []) {
        if (r.requested_by) userIds.add(r.requested_by);
        if (r.detection_id) detectionIds.add(r.detection_id);
      }

      let profileMap: Record<string, Profile> = {};
      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, full_name, avatar_url')
          .in('id', Array.from(userIds));
        if (profiles) {
          profileMap = Object.fromEntries(profiles.map(p => [p.id, p as Profile]));
        }
      }

      let detectionMap: Record<string, any> = {};
      if (detectionIds.size > 0) {
        const { data: detections } = await supabase
          .from('detections')
          .select('id, name, severity, status, user_id')
          .in('id', Array.from(detectionIds));
        if (detections) {
          detectionMap = Object.fromEntries(detections.map(d => [d.id, d]));
        }
      }

      return (data || []).map(d => ({
        ...d,
        detection: detectionMap[d.detection_id] || null,
        requester: profileMap[d.requested_by] || null,
      }));

    } catch (err) {
      console.error('Failed to fetch pending reviews:', err);
      return [];
    }
  }, []);

  /**
   * Get my reviews in progress
   */
  const getMyActiveReviews = useCallback(async (): Promise<DetectionReview[]> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('detection_reviews')
        .select('*')
        .eq('reviewer_id', user.id)
        .eq('status', 'in_progress')
        .order('assigned_at', { ascending: false });

      if (error) throw error;

      // Fetch related profiles and detections separately
      const userIds = new Set<string>();
      const detectionIds = new Set<string>();
      for (const r of data || []) {
        if (r.requested_by) userIds.add(r.requested_by);
        if (r.detection_id) detectionIds.add(r.detection_id);
      }

      let profileMap: Record<string, Profile> = {};
      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, full_name, avatar_url')
          .in('id', Array.from(userIds));
        if (profiles) {
          profileMap = Object.fromEntries(profiles.map(p => [p.id, p as Profile]));
        }
      }

      let detectionMap: Record<string, any> = {};
      if (detectionIds.size > 0) {
        const { data: detections } = await supabase
          .from('detections')
          .select('id, name, severity, status, user_id')
          .in('id', Array.from(detectionIds));
        if (detections) {
          detectionMap = Object.fromEntries(detections.map(d => [d.id, d]));
        }
      }

      return (data || []).map(d => ({
        ...d,
        detection: detectionMap[d.detection_id] || null,
        requester: profileMap[d.requested_by] || null,
      }));

    } catch (err) {
      console.error('Failed to fetch my active reviews:', err);
      return [];
    }
  }, []);

  /**
   * Update review checklist
   */
  const updateChecklist = useCallback(async (
    reviewId: string,
    checklist: ReviewChecklistItem[]
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase
        .from('detection_reviews')
        .update({
          checklist,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reviewId);

      if (error) throw error;

      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update checklist';
      return { success: false, error: errorMessage };
    }
  }, []);

  return {
    // State
    isSubmitting,
    
    // Actions
    requestReview,
    startReview,
    completeReview,
    cancelReview,
    updateChecklist,
    
    // Queries
    getReviewHistory,
    getCurrentReview,
    getPendingReviews,
    getMyActiveReviews,
  };
};

export default useReview;