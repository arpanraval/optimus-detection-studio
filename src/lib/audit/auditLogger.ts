/**
 * Standalone audit logger (non-hook version).
 *
 * For use in contexts, services, and non-component code
 * where React hooks aren't available.
 */

import { supabase } from '../supabaseClient';
import { AuditEventAction } from '../../types';

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

/**
 * Fire-and-forget audit event logger.
 * Errors are logged to console, never thrown.
 */
export async function logAuditEvent(event: AuditEventInput): Promise<void> {
  try {
    supabase.functions.invoke('audit-log', { body: event }).catch(err => {
      console.warn('[AuditLog] Failed to log event:', err);
    });
  } catch (err) {
    console.warn('[AuditLog] Error preparing audit event:', err);
  }
}

/**
 * Fire-and-forget batch audit event logger.
 */
export async function logAuditEvents(events: AuditEventInput[]): Promise<void> {
  if (events.length === 0) return;
  try {
    supabase.functions.invoke('audit-log', { body: { events } }).catch(err => {
      console.warn('[AuditLog] Failed to log batch events:', err);
    });
  } catch (err) {
    console.warn('[AuditLog] Error preparing batch audit events:', err);
  }
}
