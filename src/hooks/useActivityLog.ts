import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ActivityLogEntry, ActivityAction, ActivityEntityType, Profile } from '../types';

interface UseActivityLogOptions {
  entityType?: ActivityEntityType;
  entityId?: string;
  limit?: number;
  autoFetch?: boolean;
}

interface ActivityFilters {
  actions?: ActivityAction[];
  userId?: string;
  startDate?: string;
  endDate?: string;
}

export const useActivityLog = (options: UseActivityLogOptions = {}) => {
  const {
    entityType,
    entityId,
    limit = 50,
    autoFetch = false
  } = options;

  const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activitiesRef = useRef(activities);
  useEffect(() => { activitiesRef.current = activities; }, [activities]);

  /**
   * Fetch activity log entries
   */
  const fetchActivities = useCallback(async (
    filters?: ActivityFilters,
    append = false
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      // Apply filters
      if (entityType) {
        query = query.eq('entity_type', entityType);
      }

      if (entityId) {
        query = query.eq('entity_id', entityId);
      }

      if (filters?.actions && filters.actions.length > 0) {
        query = query.in('action', filters.actions);
      }

      if (filters?.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate);
      }

      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      // Pagination: if appending, offset by current count
      if (append && activitiesRef.current.length > 0) {
        query = query.lt('created_at', activitiesRef.current[activitiesRef.current.length - 1].created_at);
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      const transformedData: ActivityLogEntry[] = (data || []).map(d => ({
        ...d,
        user: d.user as unknown as Profile,
      }));

      if (append) {
        setActivities(prev => [...prev, ...transformedData]);
      } else {
        setActivities(transformedData);
      }

      setHasMore(transformedData.length === limit);

    } catch (err) {
      console.error('Failed to fetch activity log:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch activities');
    } finally {
      setIsLoading(false);
    }
  }, [entityType, entityId, limit]);

  /**
   * Load more activities (pagination)
   */
  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;
    await fetchActivities(undefined, true);
  }, [isLoading, hasMore, fetchActivities]);

  /**
   * Refresh activities
   */
  const refresh = useCallback(async () => {
    setActivities([]);
    setHasMore(true);
    await fetchActivities();
  }, [fetchActivities]);

  /**
   * Log a new activity (utility for manual logging)
   */
  const logActivity = useCallback(async (
    action: ActivityAction,
    entityType: ActivityEntityType,
    entityId: string,
    details: Record<string, any> = {},
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('activity_log').insert({
        user_id: user.id,
        entity_type: entityType,
        entity_id: entityId,
        action,
        details,
      });

      if (error) throw error;

      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to log activity';
      return { success: false, error: errorMessage };
    }
  }, []);

  /**
   * Get activities for a specific detection
   */
  const getDetectionActivities = useCallback(async (
    detectionId: string
  ): Promise<ActivityLogEntry[]> => {
    try {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .eq('entity_type', 'detection')
        .eq('entity_id', detectionId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      return (data || []).map(d => ({
        ...d,
        user: d.user as unknown as Profile,
      }));

    } catch (err) {
      console.error('Failed to fetch detection activities:', err);
      return [];
    }
  }, []);

  /**
   * Get user's recent activities
   */
  const getMyActivities = useCallback(async (
    activityLimit = 20
  ): Promise<ActivityLogEntry[]> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(activityLimit);

      if (error) throw error;

      return (data || []).map(d => ({
        ...d,
      }));

    } catch (err) {
      console.error('Failed to fetch my activities:', err);
      return [];
    }
  }, []);

  // Auto-fetch on mount if enabled
  useEffect(() => {
    if (autoFetch) {
      fetchActivities();
    }
  }, [autoFetch, fetchActivities]);

  return {
    // State
    activities,
    isLoading,
    hasMore,
    error,
    
    // Actions
    fetchActivities,
    loadMore,
    refresh,
    logActivity,
    
    // Specialized queries
    getDetectionActivities,
    getMyActivities,
  };
};

/**
 * Format activity action for display
 */
export const formatActivityAction = (action: ActivityAction): string => {
  const actionLabels: Record<ActivityAction, string> = {
    detection_created: 'created a detection',
    detection_updated: 'updated a detection',
    detection_deleted: 'deleted a detection',
    detection_status_changed: 'changed status',
    detection_assigned: 'assigned a detection',
    detection_unassigned: 'unassigned a detection',
    detection_self_assigned: 'self-assigned a detection',
    review_requested: 'requested a review',
    review_started: 'started reviewing',
    review_approved: 'approved',
    review_rejected: 'requested changes',
    review_cancelled: 'cancelled review',
    comment_added: 'commented',
    comment_resolved: 'resolved a comment',
    detection_promoted: 'promoted a detection',
    detection_promotion_requested: 'requested to promote',
    detection_copied: 'copied a detection',
    user_invited: 'invited a user',
    user_joined: 'joined',
    user_registered: 'registered',
    user_added: 'added a user',
    user_deactivated: 'deactivated a user',
    user_reactivated: 'reactivated a user',
    role_changed: 'changed a role',
  };

  return actionLabels[action] || action.replace(/_/g, ' ');
};

/**
 * Get icon for activity action
 */
export const getActivityIcon = (action: ActivityAction): string => {
  const iconMap: Record<string, string> = {
    detection_created: 'plus-circle',
    detection_updated: 'edit',
    detection_deleted: 'trash',
    detection_status_changed: 'refresh-cw',
    detection_assigned: 'user-plus',
    detection_unassigned: 'user-minus',
    detection_self_assigned: 'user-check',
    review_requested: 'git-pull-request',
    review_started: 'play-circle',
    review_approved: 'check-circle',
    review_rejected: 'x-circle',
    review_cancelled: 'slash',
    comment_added: 'message-circle',
    comment_resolved: 'check-square',
    detection_published: 'upload-cloud',
    detection_publish_requested: 'send',
    detection_copied: 'copy',
    user_invited: 'mail',
    user_joined: 'log-in',
    user_registered: 'user-plus',
    user_added: 'user-plus',
    user_deactivated: 'user-x',
    role_changed: 'shield',
  };

  return iconMap[action] || 'activity';
};

export default useActivityLog;
