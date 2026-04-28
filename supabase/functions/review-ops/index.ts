/**
 * Review Operations Edge Function
 *
 * Handles detection review workflow operations with proper server-side authorization.
 * Replaces direct client-side Supabase calls to enforce:
 * - Only detection owner can request review
 * - Only lead+ can start/complete reviews
 * - Users cannot review their own detections
 * - Proper audit logging for all operations
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflight, corsErrorResponse } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rate-limiter.ts';

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response>): void;
};

// Role hierarchy for authorization checks
const ROLE_HIERARCHY: Record<string, number> = {
  owner: 5,
  admin: 4,
  lead: 3,
  analyst: 2,
  viewer: 1,
};

// Roles that can perform reviews
const REVIEWER_ROLES = ['owner', 'admin', 'lead'];

interface RequestBody {
  action: 'request' | 'start' | 'complete' | 'cancel';
  detectionId: string;
  notes?: string;
  approved?: boolean;
  checklist?: Array<{
    id: string;
    label: string;
    checked: boolean;
    required?: boolean;
  }>;
}

function hasRoleLevel(userRole: string, requiredRole: string): boolean {
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
  return userLevel >= requiredLevel;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflight(req);
  if (preflightResponse) return preflightResponse;

  // Get CORS headers for this request
  const corsHeaders = getCorsHeaders(req);

  try {
    // Setup Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error('Supabase environment variables are not set.');
    }

    // Admin client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // User client for authentication
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } }
    });

    // Authenticate user
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Authentication failed.');
    }

    // Rate limiting
    const { allowed } = await checkRateLimit(
      supabaseAdmin,
      `user:${user.id}:fn:review-ops`,
      30,
      60
    );
    if (!allowed) {
      return corsErrorResponse('Rate limit exceeded. Try again shortly.', req, 429);
    }

    // Get current user's role
    const { data: currentUserProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single();

    if (profileError) {
      throw new Error('Could not fetch user profile.');
    }

    const currentUserRole = currentUserProfile?.role || 'viewer';
    const currentUserName = currentUserProfile?.full_name || 'Unknown';

    // Extract client IP once - use last value in XFF chain (closest trusted proxy)
    const xffHeader = req.headers.get('x-forwarded-for');
    const clientIp = xffHeader ? xffHeader.split(',').pop()?.trim() || null : null;

    // Parse request body
    const body: RequestBody = await req.json();
    const { action, detectionId, notes, approved, checklist } = body;

    if (!detectionId) {
      throw new Error('Detection ID is required.');
    }

    // Get detection details
    const { data: detection, error: detectionError } = await supabaseAdmin
      .from('detections')
      .select('id, name, user_id, assigned_to, review_status')
      .eq('id', detectionId)
      .single();

    if (detectionError || !detection) {
      throw new Error('Detection not found.');
    }

    const now = new Date().toISOString();

    switch (action) {
      // ==========================================
      // REQUEST REVIEW - Only detection owner or assigned user
      // ==========================================
      case 'request': {
        // Verify user owns or is assigned to the detection
        if (detection.user_id !== user.id && detection.assigned_to !== user.id) {
          return new Response(JSON.stringify({
            error: 'You can only request review for your own or assigned detections.'
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Check if already has pending review
        if (detection.review_status === 'requested' || detection.review_status === 'in_review') {
          throw new Error('Detection already has a pending review.');
        }

        // Create review request
        const { data: review, error: reviewError } = await supabaseAdmin
          .from('detection_reviews')
          .insert({
            detection_id: detectionId,
            requested_by: user.id,
            requested_at: now,
            status: 'pending',
            notes,
            checklist: checklist || [],
          })
          .select()
          .single();

        if (reviewError) throw reviewError;

        // Update detection status
        const { error: updateError } = await supabaseAdmin
          .from('detections')
          .update({
            review_status: 'requested',
            review_requested_at: now,
            updatedDate: now,
          })
          .eq('id', detectionId);

        if (updateError) throw updateError;

        // Log activity
        await supabaseAdmin.from('activity_log').insert({
          user_id: user.id,
          entity_type: 'review',
          entity_id: review.id,
          action: 'review_requested',
          details: {
            detection_id: detectionId,
            detection_name: detection.name,
          },
        });

        // Notify lead+ users about pending review
        try {
          const { data: leads } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .in('role', ['lead', 'admin', 'owner'])
            .neq('id', user.id);

          if (leads && leads.length > 0) {
            const reviewNotifications = leads.map((reviewer: { id: string }) => ({
              user_id: reviewer.id,
              type: 'review_request',
              title: 'Review Requested',
              message: `"${detection.name}" needs review`,
              detection_id: detectionId,
              action_url: '/approval-queue',
              category: 'review',
              source_user_id: user.id,
            }));

            await supabaseAdmin
              .from('user_notifications')
              .insert(reviewNotifications);
          }
        } catch (notifError) {
          console.error('Failed to send review request notifications:', notifError);
        }

        // Audit trail
        try {
          await supabaseAdmin.from('audit_events').insert({
            user_id: user.id,
            user_email: user.email,
            user_role: currentUserRole,
            action: 'review.requested',
            entity_type: 'review',
            entity_id: detectionId,
            entity_name: detection.name,
            ip_address: clientIp,
            user_agent: req.headers.get('user-agent') || null,
            source: 'edge_function',
            details: { notes },
          });
        } catch (auditError) {
          console.error('Audit log failed for review.requested:', auditError);
        }

        return new Response(JSON.stringify({
          success: true,
          review,
          message: 'Review requested successfully.'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ==========================================
      // START REVIEW - Only lead+ role, cannot self-review
      // ==========================================
      case 'start': {
        // Check role permission
        if (!REVIEWER_ROLES.includes(currentUserRole)) {
          return new Response(JSON.stringify({
            error: 'Lead or higher role required to review detections.'
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Prevent self-review
        if (detection.user_id === user.id) {
          return new Response(JSON.stringify({
            error: 'You cannot review your own detection.'
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Find pending review
        const { data: pendingReview, error: findError } = await supabaseAdmin
          .from('detection_reviews')
          .select('*')
          .eq('detection_id', detectionId)
          .eq('status', 'pending')
          .order('requested_at', { ascending: false })
          .limit(1)
          .single();

        if (findError || !pendingReview) {
          throw new Error('No pending review found for this detection.');
        }

        // Update review with optimistic locking
        const { data: review, error: updateError } = await supabaseAdmin
          .from('detection_reviews')
          .update({
            reviewer_id: user.id,
            status: 'in_progress',
            started_at: now,
            updated_at: now,
          })
          .eq('id', pendingReview.id)
          .eq('status', 'pending') // Only update if still pending
          .select()
          .single();

        if (updateError || !review) {
          throw new Error('Review was already claimed by another reviewer. Please refresh.');
        }

        // Update detection status
        await supabaseAdmin
          .from('detections')
          .update({
            review_status: 'in_review',
            reviewer_id: user.id,
            updatedDate: now,
          })
          .eq('id', detectionId);

        // Log activity
        await supabaseAdmin.from('activity_log').insert({
          user_id: user.id,
          entity_type: 'review',
          entity_id: review.id,
          action: 'review_started',
          details: {
            detection_id: detectionId,
            detection_name: detection.name,
          },
        });

        // Audit trail
        try {
          await supabaseAdmin.from('audit_events').insert({
            user_id: user.id,
            user_email: user.email,
            user_role: currentUserRole,
            action: 'review.started',
            entity_type: 'review',
            entity_id: detectionId,
            entity_name: detection.name,
            ip_address: clientIp,
            user_agent: req.headers.get('user-agent') || null,
            source: 'edge_function',
            details: { notes },
          });
        } catch (auditError) {
          console.error('Audit log failed for review.started:', auditError);
        }

        return new Response(JSON.stringify({
          success: true,
          review,
          message: 'Review started successfully.'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ==========================================
      // COMPLETE REVIEW - Only assigned reviewer
      // ==========================================
      case 'complete': {
        if (approved === undefined) {
          throw new Error('Approval decision is required.');
        }

        // Check role permission
        if (!REVIEWER_ROLES.includes(currentUserRole)) {
          return new Response(JSON.stringify({
            error: 'Lead or higher role required to complete reviews.'
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Find active review assigned to this user
        const { data: activeReview, error: findError } = await supabaseAdmin
          .from('detection_reviews')
          .select('*')
          .eq('detection_id', detectionId)
          .eq('status', 'in_progress')
          .eq('reviewer_id', user.id)
          .single();

        if (findError || !activeReview) {
          throw new Error('No active review found that you are assigned to.');
        }

        const newStatus = approved ? 'approved' : 'rejected';

        // Update review
        const { data: review, error: updateError } = await supabaseAdmin
          .from('detection_reviews')
          .update({
            status: newStatus,
            decision_at: now,
            notes: notes || activeReview.notes,
            checklist: checklist || activeReview.checklist,
            updated_at: now,
          })
          .eq('id', activeReview.id)
          .select()
          .single();

        if (updateError || !review) {
          throw new Error('Failed to complete review.');
        }

        // Update detection status
        await supabaseAdmin
          .from('detections')
          .update({
            review_status: newStatus,
            reviewed_at: now,
            review_notes: notes,
            updatedDate: now,
          })
          .eq('id', detectionId);

        // Notify detection author
        if (detection.user_id !== user.id) {
          await supabaseAdmin.from('user_notifications').insert({
            user_id: detection.user_id,
            type: 'review_complete',
            title: approved ? 'Review Approved' : 'Changes Requested',
            message: approved
              ? `Your detection "${detection.name}" has been approved by ${currentUserName}!`
              : `Changes requested for "${detection.name}": ${notes || 'See review notes'}`,
            detection_id: detectionId,
          });
        }

        // Log activity
        await supabaseAdmin.from('activity_log').insert({
          user_id: user.id,
          entity_type: 'review',
          entity_id: review.id,
          action: approved ? 'review_approved' : 'review_rejected',
          details: {
            detection_id: detectionId,
            detection_name: detection.name,
            notes,
          },
        });

        // Audit trail
        try {
          await supabaseAdmin.from('audit_events').insert({
            user_id: user.id,
            user_email: user.email,
            user_role: currentUserRole,
            action: approved ? 'review.approved' : 'review.rejected',
            entity_type: 'review',
            entity_id: detectionId,
            entity_name: detection.name,
            ip_address: clientIp,
            user_agent: req.headers.get('user-agent') || null,
            source: 'edge_function',
            details: { notes, approved },
          });
        } catch (auditError) {
          console.error('Audit log failed for review.complete:', auditError);
        }

        return new Response(JSON.stringify({
          success: true,
          review,
          message: approved ? 'Detection approved.' : 'Review completed with requested changes.'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ==========================================
      // CANCEL REVIEW - Requester or lead+
      // ==========================================
      case 'cancel': {
        // Find active review
        const { data: activeReview, error: findError } = await supabaseAdmin
          .from('detection_reviews')
          .select('id, requested_by, reviewer_id')
          .eq('detection_id', detectionId)
          .in('status', ['pending', 'in_progress'])
          .order('requested_at', { ascending: false })
          .limit(1)
          .single();

        if (findError || !activeReview) {
          throw new Error('No active review found to cancel.');
        }

        // Check authorization: requester, assigned reviewer, or lead+
        const canCancel =
          activeReview.requested_by === user.id ||
          activeReview.reviewer_id === user.id ||
          REVIEWER_ROLES.includes(currentUserRole);

        if (!canCancel) {
          return new Response(JSON.stringify({
            error: 'Not authorized to cancel this review.'
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Cancel the review
        await supabaseAdmin
          .from('detection_reviews')
          .update({
            status: 'cancelled',
            updated_at: now,
          })
          .eq('id', activeReview.id);

        // Reset detection review status
        await supabaseAdmin
          .from('detections')
          .update({
            review_status: 'none',
            reviewer_id: null,
            review_requested_at: null,
            updatedDate: now,
          })
          .eq('id', detectionId);

        // Log activity
        await supabaseAdmin.from('activity_log').insert({
          user_id: user.id,
          entity_type: 'detection',
          entity_id: detectionId,
          action: 'review_cancelled',
          details: { detection_name: detection.name },
        });

        // Audit trail
        try {
          await supabaseAdmin.from('audit_events').insert({
            user_id: user.id,
            user_email: user.email,
            user_role: currentUserRole,
            action: 'review.cancelled',
            entity_type: 'review',
            entity_id: detectionId,
            entity_name: detection.name,
            ip_address: clientIp,
            user_agent: req.headers.get('user-agent') || null,
            source: 'edge_function',
            details: { notes },
          });
        } catch (auditError) {
          console.error('Audit log failed for review.cancelled:', auditError);
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'Review cancelled.'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error: unknown) {
    console.error('Review operation error:', error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ error: 'Operation failed' }), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
