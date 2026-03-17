import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { logAuditEvent } from '../lib/audit';
import { DetectionComment, CommentType, Profile } from '../types';
import { useToast } from './useToast';

interface UseDetectionCommentsOptions {
  detectionId: string;
  autoFetch?: boolean;
}

interface CommentResult {
  success: boolean;
  comment?: DetectionComment;
  error?: string;
}

export const useDetectionComments = ({ 
  detectionId, 
  autoFetch = true 
}: UseDetectionCommentsOptions) => {
  const { showToast } = useToast();
  
  const [comments, setComments] = useState<DetectionComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Fetch all comments for the detection
   */
  const fetchComments = useCallback(async () => {
    if (!detectionId) return;

    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('detection_comments')
        .select(`
          *,
          user:profiles!detection_comments_user_id_fkey (
            id, email, full_name, avatar_url
          )
        `)
        .eq('detection_id', detectionId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Transform and organize comments with replies
      const transformedComments = (data || []).map(c => ({
        ...c,
        user: c.user as unknown as Profile,
      }));

      // Build thread structure
      const topLevel: DetectionComment[] = [];
      const repliesMap = new Map<string, DetectionComment[]>();

      transformedComments.forEach(comment => {
        if (comment.parent_id) {
          const replies = repliesMap.get(comment.parent_id) || [];
          replies.push(comment);
          repliesMap.set(comment.parent_id, replies);
        } else {
          topLevel.push(comment);
        }
      });

      // Attach replies to parent comments
      topLevel.forEach(comment => {
        comment.replies = repliesMap.get(comment.id) || [];
      });

      setComments(topLevel);

    } catch (err) {
      console.error('Failed to fetch comments:', err);
      showToast('error', 'Error', 'Failed to load comments');
    } finally {
      setIsLoading(false);
    }
  }, [detectionId, showToast]);

  // Auto-fetch on mount if enabled
  useEffect(() => {
    if (autoFetch && detectionId) {
      fetchComments();
    }
  }, [autoFetch, detectionId, fetchComments]);

  /**
   * Add a new comment
   */
  const addComment = useCallback(async (
    content: string,
    parentId?: string,
    commentType: CommentType = 'comment'
  ): Promise<CommentResult> => {
    if (!content.trim()) {
      return { success: false, error: 'Comment cannot be empty' };
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('detection_comments')
        .insert({
          detection_id: detectionId,
          user_id: user.id,
          parent_id: parentId || null,
          content: content.trim(),
          comment_type: commentType,
        })
        .select(`
          *,
          user:profiles!detection_comments_user_id_fkey (
            id, email, full_name, avatar_url
          )
        `)
        .single();

      if (error) throw error;

      const newComment: DetectionComment = {
        ...data,
        user: data.user as unknown as Profile,
        replies: [],
      };

      // Update local state
      if (parentId) {
        // Add as reply
        setComments(prev => prev.map(c => {
          if (c.id === parentId) {
            return {
              ...c,
              replies: [...(c.replies || []), newComment],
            };
          }
          return c;
        }));
      } else {
        // Add as top-level comment
        setComments(prev => [...prev, newComment]);
      }

      // Log activity
      await supabase.from('activity_log').insert({
        user_id: user.id,
        entity_type: 'comment',
        entity_id: data.id,
        action: 'comment_added',
        details: {
          detection_id: detectionId,
          parent_id: parentId,
          comment_type: commentType,
        },
      });

      logAuditEvent({ action: 'comment.created', entity_type: 'comment', entity_id: data.id, details: { detection_id: detectionId } });

      return { success: true, comment: newComment };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add comment';
      showToast('error', 'Error', errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsSubmitting(false);
    }
  }, [detectionId, showToast]);

  /**
   * Edit an existing comment
   */
  const editComment = useCallback(async (
    commentId: string,
    newContent: string
  ): Promise<CommentResult> => {
    if (!newContent.trim()) {
      return { success: false, error: 'Comment cannot be empty' };
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('detection_comments')
        .update({
          content: newContent.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', commentId)
        .eq('user_id', user.id) // Only allow editing own comments
        .select(`
          *,
          user:profiles!detection_comments_user_id_fkey (
            id, email, full_name, avatar_url
          )
        `)
        .single();

      if (error) throw error;

      const updatedComment: DetectionComment = {
        ...data,
        user: data.user as unknown as Profile,
      };

      // Update local state
      setComments(prev => prev.map(c => {
        if (c.id === commentId) {
          return { ...c, ...updatedComment };
        }
        // Check replies
        if (c.replies) {
          return {
            ...c,
            replies: c.replies.map(r => 
              r.id === commentId ? { ...r, ...updatedComment } : r
            ),
          };
        }
        return c;
      }));

      logAuditEvent({ action: 'comment.updated', entity_type: 'comment', entity_id: commentId });

      showToast('success', 'Updated', 'Comment updated');
      return { success: true, comment: updatedComment };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to edit comment';
      showToast('error', 'Error', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [showToast]);

  /**
   * Delete a comment
   */
  const deleteComment = useCallback(async (
    commentId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('detection_comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', user.id); // Only allow deleting own comments

      if (error) throw error;

      // Update local state
      setComments(prev => {
        // Remove from top-level
        const filtered = prev.filter(c => c.id !== commentId);
        // Remove from replies
        return filtered.map(c => ({
          ...c,
          replies: c.replies?.filter(r => r.id !== commentId),
        }));
      });

      logAuditEvent({ action: 'comment.deleted', entity_type: 'comment', entity_id: commentId });

      showToast('success', 'Deleted', 'Comment deleted');
      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete comment';
      showToast('error', 'Error', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [showToast]);

  /**
   * Resolve a comment thread
   */
  const resolveComment = useCallback(async (
    commentId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const now = new Date().toISOString();

      const { error } = await supabase
        .from('detection_comments')
        .update({
          is_resolved: true,
          resolved_by: user.id,
          resolved_at: now,
          updated_at: now,
        })
        .eq('id', commentId);

      if (error) throw error;

      // Update local state
      setComments(prev => prev.map(c => {
        if (c.id === commentId) {
          return {
            ...c,
            is_resolved: true,
            resolved_by: user.id,
            resolved_at: now,
          };
        }
        return c;
      }));

      // Log activity
      await supabase.from('activity_log').insert({
        user_id: user.id,
        entity_type: 'comment',
        entity_id: commentId,
        action: 'comment_resolved',
        details: { detection_id: detectionId },
      });

      showToast('success', 'Resolved', 'Comment thread resolved');
      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to resolve comment';
      showToast('error', 'Error', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [detectionId, showToast]);

  /**
   * Unresolve a comment thread
   */
  const unresolveComment = useCallback(async (
    commentId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase
        .from('detection_comments')
        .update({
          is_resolved: false,
          resolved_by: null,
          resolved_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', commentId);

      if (error) throw error;

      // Update local state
      setComments(prev => prev.map(c => {
        if (c.id === commentId) {
          return {
            ...c,
            is_resolved: false,
            resolved_by: undefined,
            resolved_at: undefined,
          };
        }
        return c;
      }));

      showToast('success', 'Reopened', 'Comment thread reopened');
      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reopen comment';
      showToast('error', 'Error', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [showToast]);

  /**
   * Get comment counts
   */
  const getCommentCounts = useCallback(() => {
    const total = comments.reduce(
      (count, c) => count + 1 + (c.replies?.length || 0), 
      0
    );
    const resolved = comments.filter(c => c.is_resolved).length;
    const unresolved = comments.filter(c => !c.is_resolved).length;

    return { total, resolved, unresolved };
  }, [comments]);

  return {
    // State
    comments,
    isLoading,
    isSubmitting,
    
    // Actions
    fetchComments,
    addComment,
    editComment,
    deleteComment,
    resolveComment,
    unresolveComment,
    
    // Helpers
    getCommentCounts,
  };
};

export default useDetectionComments;
