/**
 * Client-side audit logging hook.
 *
 * - logEvent() calls the audit-log edge function (fire-and-forget)
 * - fetchAuditEvents() queries audit_events directly via Supabase (RLS enforced)
 */

import { useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { escapePostgrestFilter } from '../lib/sanitize';
import { AuditEvent, AuditEventAction } from '../types';

// ============================================
// TYPES
// ============================================

export interface AuditEventInput {
  action: AuditEventAction;
  entity_type?: string;
  entity_id?: string;
  entity_name?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  team_id?: string;
  details?: Record<string, unknown>;
}

export interface AuditFilters {
  entityType?: string;
  entityId?: string;
  userId?: string;
  actions?: string[];
  startDate?: string;
  endDate?: string;
  teamId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AuditFetchResult {
  events: AuditEvent[];
  count: number;
}

// ============================================
// HOOK
// ============================================

export function useAuditLog() {
  /**
   * Log an audit event via edge function.
   * Fire-and-forget: errors are logged to console, never block UI.
   */
  const logEvent = useCallback(async (event: AuditEventInput): Promise<void> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      // Fire-and-forget — don't await in the calling code if you don't want to block
      supabase.functions.invoke('audit-log', {
        body: event,
      }).catch(err => {
        console.warn('[AuditLog] Failed to log event:', err);
      });
    } catch (err) {
      console.warn('[AuditLog] Error preparing audit event:', err);
    }
  }, []);

  /**
   * Log multiple audit events in a batch.
   */
  const logEvents = useCallback(async (events: AuditEventInput[]): Promise<void> => {
    if (events.length === 0) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      supabase.functions.invoke('audit-log', {
        body: { events },
      }).catch(err => {
        console.warn('[AuditLog] Failed to log batch events:', err);
      });
    } catch (err) {
      console.warn('[AuditLog] Error preparing batch audit events:', err);
    }
  }, []);

  /**
   * Fetch audit events with filters. Uses direct Supabase query (RLS enforced).
   */
  const fetchAuditEvents = useCallback(async (filters: AuditFilters = {}): Promise<AuditFetchResult> => {
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    let query = supabase
      .from('audit_events')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.entityType) {
      query = query.eq('entity_type', filters.entityType);
    }
    if (filters.entityId) {
      query = query.eq('entity_id', filters.entityId);
    }
    if (filters.userId) {
      query = query.eq('user_id', filters.userId);
    }
    if (filters.actions?.length) {
      query = query.in('action', filters.actions);
    }
    if (filters.startDate) {
      query = query.gte('created_at', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('created_at', filters.endDate);
    }
    if (filters.teamId) {
      query = query.eq('team_id', filters.teamId);
    }
    if (filters.search) {
      const esc = escapePostgrestFilter(filters.search);
      query = query.or(
        `entity_name.ilike.%${esc}%,user_email.ilike.%${esc}%,action.ilike.%${esc}%`
      );
    }

    const { data, count, error } = await query;

    if (error) {
      console.error('[AuditLog] Fetch error:', error);
      return { events: [], count: 0 };
    }

    return {
      events: (data || []) as AuditEvent[],
      count: count || 0,
    };
  }, []);

  return { logEvent, logEvents, fetchAuditEvents };
}
