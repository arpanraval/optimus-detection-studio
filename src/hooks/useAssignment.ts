import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Detection, DetectionAssignment, Profile } from '../types';
import { useToast } from './useToast';

interface UseAssignmentOptions {
  onAssignmentChange?: (detection: Detection) => void;
}

interface AssignmentResult {
  success: boolean;
  error?: string;
}

export const useAssignment = (options: UseAssignmentOptions = {}) => {
  const { showToast } = useToast();
  const [isAssigning, setIsAssigning] = useState(false);

  /**
   * Assign a detection to a user
   */
  const assignDetection = useCallback(async (
    detection: Detection,
    assigneeId: string,
    notes?: string
  ): Promise<AssignmentResult> => {
    setIsAssigning(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const now = new Date().toISOString();

      // Update the detection
      const { error: updateError } = await supabase
        .from('detections')
        .update({
          assigned_to: assigneeId,
          assigned_by: user.id,
          assigned_at: now,
          updatedDate: now,
        })
        .eq('id', detection.id);

      if (updateError) throw updateError;

      // Create assignment history record
      const { error: historyError } = await supabase
        .from('detection_assignments')
        .insert({
          detection_id: detection.id,
          assigned_to: assigneeId,
          assigned_by: user.id,
          assigned_at: now,
          notes,
        });

      if (historyError) {
        console.error('Failed to create assignment history:', historyError);
        // Don't fail the operation, history is supplementary
      }

      // Log activity
      await supabase.from('activity_log').insert({
        team_id: detection.team_id,
        user_id: user.id,
        entity_type: 'detection',
        entity_id: detection.id,
        action: 'detection_assigned',
        details: {
          detection_name: detection.name,
          assigned_to: assigneeId,
          assigned_by: user.id,
          notes,
        },
      });

      // Create notification for assignee
      if (assigneeId !== user.id) {
        const { error: notifError } = await supabase.from('user_notifications').insert({
          user_id: assigneeId,
          type: 'assignment',
          title: 'Detection Assigned',
          message: `You have been assigned to "${detection.name}"`,
          detection_id: detection.id,
          source_user_id: user.id,
        });
        if (notifError) {
          console.error('Failed to create assignment notification:', notifError);
        }
      }

      showToast('success', 'Assigned', 'Detection assigned successfully');
      
      // Callback with updated detection
      if (options.onAssignmentChange) {
        options.onAssignmentChange({
          ...detection,
          assigned_to: assigneeId,
          assigned_by: user.id,
          assigned_at: now,
        });
      }

      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to assign detection';
      showToast('error', 'Assignment Failed', errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsAssigning(false);
    }
  }, [showToast, options]);

  /**
   * Self-assign a detection
   */
  const selfAssign = useCallback(async (
    detection: Detection
  ): Promise<AssignmentResult> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    setIsAssigning(true);

    try {
      const now = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('detections')
        .update({
          assigned_to: user.id,
          assigned_by: user.id,
          assigned_at: now,
          updatedDate: now,
        })
        .eq('id', detection.id);

      if (updateError) throw updateError;

      // Create assignment history
      await supabase.from('detection_assignments').insert({
        detection_id: detection.id,
        assigned_to: user.id,
        assigned_by: user.id,
        assigned_at: now,
        notes: 'Self-assigned',
      });

      // Log activity
      await supabase.from('activity_log').insert({
        team_id: detection.team_id,
        user_id: user.id,
        entity_type: 'detection',
        entity_id: detection.id,
        action: 'detection_self_assigned',
        details: {
          detection_name: detection.name,
        },
      });

      showToast('success', 'Assigned', 'Detection assigned to you');

      if (options.onAssignmentChange) {
        options.onAssignmentChange({
          ...detection,
          assigned_to: user.id,
          assigned_by: user.id,
          assigned_at: now,
        });
      }

      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to self-assign';
      showToast('error', 'Assignment Failed', errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsAssigning(false);
    }
  }, [showToast, options]);

  /**
   * Unassign a detection
   */
  const unassignDetection = useCallback(async (
    detection: Detection
  ): Promise<AssignmentResult> => {
    setIsAssigning(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const now = new Date().toISOString();
      const previousAssignee = detection.assigned_to;

      // Update the detection
      const { error: updateError } = await supabase
        .from('detections')
        .update({
          assigned_to: null,
          assigned_by: null,
          assigned_at: null,
          updatedDate: now,
        })
        .eq('id', detection.id);

      if (updateError) throw updateError;

      // Update assignment history (close the current assignment)
      if (previousAssignee) {
        await supabase
          .from('detection_assignments')
          .update({
            unassigned_at: now,
            unassigned_by: user.id,
          })
          .eq('detection_id', detection.id)
          .eq('assigned_to', previousAssignee)
          .is('unassigned_at', null);
      }

      // Log activity
      await supabase.from('activity_log').insert({
        team_id: detection.team_id,
        user_id: user.id,
        entity_type: 'detection',
        entity_id: detection.id,
        action: 'detection_unassigned',
        details: {
          detection_name: detection.name,
          previous_assignee: previousAssignee,
          unassigned_by: user.id,
        },
      });

      showToast('success', 'Unassigned', 'Detection unassigned');

      if (options.onAssignmentChange) {
        options.onAssignmentChange({
          ...detection,
          assigned_to: undefined,
          assigned_by: undefined,
          assigned_at: undefined,
        });
      }

      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to unassign';
      showToast('error', 'Unassignment Failed', errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsAssigning(false);
    }
  }, [showToast, options]);

  /**
   * Get assignment history for a detection
   */
  const getAssignmentHistory = useCallback(async (
    detectionId: string
  ): Promise<DetectionAssignment[]> => {
    try {
      const { data, error } = await supabase
        .from('detection_assignments')
        .select(`
          *,
          assignee:profiles!detection_assignments_assigned_to_fkey (
            id, email, full_name, avatar_url
          ),
          assigner:profiles!detection_assignments_assigned_by_fkey (
            id, email, full_name, avatar_url
          )
        `)
        .eq('detection_id', detectionId)
        .order('assigned_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(d => ({
        ...d,
        assignee: d.assignee as unknown as Profile,
        assigner: d.assigner as unknown as Profile,
      }));

    } catch (err) {
      console.error('Failed to fetch assignment history:', err);
      return [];
    }
  }, []);

  /**
   * Get detections assigned to current user
   */
  const getMyAssignments = useCallback(async (): Promise<Detection[]> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('detections')
        .select('*')
        .eq('assigned_to', user.id)
        .order('assigned_at', { ascending: false });

      if (error) throw error;
      return data || [];

    } catch (err) {
      console.error('Failed to fetch my assignments:', err);
      return [];
    }
  }, []);

  /**
   * Get detections assigned by current user
   */
  const getAssignedByMe = useCallback(async (): Promise<Detection[]> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('detections')
        .select('*')
        .eq('assigned_by', user.id)
        .not('assigned_to', 'eq', user.id) // Exclude self-assignments
        .order('assigned_at', { ascending: false });

      if (error) throw error;
      return data || [];

    } catch (err) {
      console.error('Failed to fetch detections assigned by me:', err);
      return [];
    }
  }, []);

  return {
    // State
    isAssigning,
    
    // Actions
    assignDetection,
    selfAssign,
    unassignDetection,
    
    // Queries
    getAssignmentHistory,
    getMyAssignments,
    getAssignedByMe,
  };
};

export default useAssignment;
