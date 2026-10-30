import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflight, corsErrorResponse } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rate-limiter.ts';
import {
  ROLE_LEVELS,
  canGrantRole,
  canManageUser,
  isGlobalRole,
  normalizeEmail,
  roleChangeError,
} from '../_shared/role-policy.ts';

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response>): void;
};

// Global roles (profiles.role) and who may grant them live in the shared role policy.
const ROLE_HIERARCHY: Record<string, number> = ROLE_LEVELS;

async function getSupabaseAdmin() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase environment variables are not set.');
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function getUserClient(req: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not set.');
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization')! } }
  });
}

interface RequestBody {
  action: 'list' | 'create' | 'delete' | 'invite' | 'changeRole' | 'deactivate' | 'reactivate' | 'setPassword';
  email?: string;
  password?: string;
  userId?: string;
  role?: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflight(req);
  if (preflightResponse) return preflightResponse;

  // Get CORS headers for this request (validates origin)
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseAdmin = await getSupabaseAdmin();
    const userClient = await getUserClient(req);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Authentication failed.');
    }

    // Rate limiting
    const { allowed } = await checkRateLimit(
      supabaseAdmin,
      `user:${user.id}:fn:manage-users`,
      20,
      60
    );
    if (!allowed) {
      return corsErrorResponse('Rate limit exceeded. Try again shortly.', req, 429);
    }

    // Get current user's GLOBAL role from profiles
    const { data: currentUserProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .single();

    if (profileError) {
      throw new Error('Could not fetch user profile.');
    }

    const currentUserRole = currentUserProfile?.role || 'viewer';
    const currentUserRoleLevel = ROLE_HIERARCHY[currentUserRole] || 0;

    // Helper to check if current user has required role level
    const hasRoleLevel = (requiredRole: string): boolean => {
      return currentUserRoleLevel >= (ROLE_HIERARCHY[requiredRole] || 0);
    };

    const forbidden = (message: string) =>
      new Response(JSON.stringify({ error: message }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    // One pending invitation per email, replaced atomically in the database. The new account
    // names this id (invitation_id), so a concurrent re-invite cannot give it another role.
    const issueInvitation = async (inviteEmail: string, inviteRole: string) => {
      const { data: id, error } = await supabaseAdmin.rpc('issue_user_invitation', {
        p_email: inviteEmail,
        p_role: inviteRole,
        p_invited_by: user.id,
      });
      if (error) throw error;
      return { id: id as string };
    };

    // Withdraw an invitation that never produced an account; never touch one already used.
    const withdrawInvitation = (id: string) =>
      supabaseAdmin.from('user_invitations').delete().eq('id', id).is('accepted_at', null);

    // Extract client IP once - use last value in XFF chain (closest trusted proxy)
    const xffHeader = req.headers.get('x-forwarded-for');
    const clientIp = xffHeader ? xffHeader.split(',').pop()?.trim() || null : null;

    const body: RequestBody = await req.json();
    const { action, email, password, userId, role } = body;

    switch (action) {
      // ==========================================
      // LIST ALL USERS (Admin+ only)
      // ==========================================
      case 'list': {
        if (!hasRoleLevel('admin')) {
          return new Response(JSON.stringify({ error: 'Admin access required.' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data: profiles, error } = await supabaseAdmin
          .from('profiles')
          .select('id, email, role, full_name, status, created_at, last_active_at')
          .order('full_name', { ascending: true });

        if (error) throw error;

        return new Response(JSON.stringify({ users: profiles }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ==========================================
      // CREATE USER (Admin+ only)
      // ==========================================
      case 'create': {
        if (!hasRoleLevel('admin')) {
          return forbidden('Admin access required.');
        }

        if (!email || !password) throw new Error('Email and password are required.');
        if (!canGrantRole(currentUserRole, role)) {
          return forbidden(isGlobalRole(role) ? `Only an owner can grant the ${role} role.` : 'A valid role is required.');
        }
        const newEmail = normalizeEmail(email);

        // The database gives a new account its role only from an invitation (handle_new_user),
        // and refuses accounts without one, so issue it before creating the account.
        const invitation = await issueInvitation(newEmail, role!);

        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email: newEmail,
          password,
          email_confirm: true,
          user_metadata: { invitation_id: invitation.id },
        });

        if (error) {
          await withdrawInvitation(invitation.id);
          throw error;
        }

        try {
          await supabaseAdmin.from('audit_events').insert({
            user_id: user.id,
            user_email: user.email,
            user_role: currentUserRole,
            action: 'user.created',
            entity_type: 'user',
            entity_id: data.user?.id || null,
            entity_name: newEmail,
            ip_address: clientIp,
            user_agent: req.headers.get('user-agent') || null,
            source: 'edge_function',
            details: { email: newEmail, role, invitation_id: invitation.id },
          });
        } catch (auditErr) {
          console.error('Audit log error:', auditErr);
        }

        return new Response(JSON.stringify({ user: data.user }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ==========================================
      // INVITE USER (Admin+ only) - Creates user with global role
      // ==========================================
      case 'invite': {
        if (!email) throw new Error('Email is required.');

        if (!hasRoleLevel('admin')) {
          return forbidden('Admin access required to invite users.');
        }

        if (!canGrantRole(currentUserRole, role)) {
          return forbidden(isGlobalRole(role) ? `Only an owner can grant the ${role} role.` : 'A valid role is required.');
        }
        const inviteEmail = normalizeEmail(email);

        // Check if user already exists, by sign-in email in Supabase Auth. profiles.email is
        // only a mirror, and listUsers returns a single page.
        const { data: accountIds, error: lookupError } = await supabaseAdmin.rpc('auth_user_ids_for_email', {
          p_email: inviteEmail,
        });
        if (lookupError) throw lookupError;
        const existingIds = (accountIds ?? []) as string[];
        if (existingIds.length > 1) {
          return forbidden('More than one account signs in with this email. Change the role from the user list.');
        }

        if (existingIds.length === 1) {
          const { data: existingProfile, error: existingError } = await supabaseAdmin
            .from('profiles')
            .select('id, role')
            .eq('id', existingIds[0])
            .single();
          if (existingError || !existingProfile) throw existingError ?? new Error('Profile not found.');

          // Inviting an existing user changes their role, under the same rules as changeRole.
          const refusal = roleChangeError(
            { id: user.id, role: currentUserRole },
            { id: existingProfile.id, role: existingProfile.role },
            role,
          );
          if (refusal) return forbidden(refusal);

          const { error: updateError } = await supabaseAdmin
            .from('profiles')
            .update({ role, updated_at: new Date().toISOString() })
            .eq('id', existingProfile.id);
          if (updateError) throw updateError;

          try {
            await supabaseAdmin.from('audit_events').insert({
              user_id: user.id,
              user_email: user.email,
              user_role: currentUserRole,
              action: 'user.invited',
              entity_type: 'user',
              entity_id: existingProfile.id,
              entity_name: inviteEmail,
              ip_address: clientIp,
              user_agent: req.headers.get('user-agent') || null,
              source: 'edge_function',
              details: { email: inviteEmail, role, old_role: existingProfile.role, existing_user: true },
            });
          } catch (auditErr) {
            console.error('Audit log error:', auditErr);
          }

          return new Response(JSON.stringify({
            success: true,
            message: 'Existing user role updated.',
            userId: existingProfile.id
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Create invitation record. Supabase creates the account when it sends the email,
        // and handle_new_user takes the GLOBAL role from this row.
        const invitation = await issueInvitation(inviteEmail, role!);

        // Send Supabase auth invitation
        const siteUrl = Deno.env.get('SITE_URL') || 'http://localhost:5173';

        const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(inviteEmail, {
          redirectTo: `${siteUrl}/auth/callback`,
          data: { invitation_id: invitation.id },
        });

        if (inviteError) {
          // Cleanup invitation record
          await withdrawInvitation(invitation.id);

          throw inviteError;
        }

        // Log activity
        await supabaseAdmin
          .from('activity_log')
          .insert({
            user_id: user.id,
            entity_type: 'user',
            entity_id: inviteEmail,
            action: 'user_invited',
            details: { email: inviteEmail, role, invited_by: user.id },
          });

        try {
          await supabaseAdmin.from('audit_events').insert({
            user_id: user.id,
            user_email: user.email,
            user_role: currentUserRole,
            action: 'user.invited',
            entity_type: 'user',
            entity_id: invitation.id,
            entity_name: inviteEmail,
            ip_address: clientIp,
            user_agent: req.headers.get('user-agent') || null,
            source: 'edge_function',
            details: { email: inviteEmail, role, invitation_id: invitation.id },
          });
        } catch (auditErr) {
          console.error('Audit log error:', auditErr);
        }

        return new Response(JSON.stringify({
          success: true,
          message: `Invitation sent to ${inviteEmail}`,
          invitationId: invitation.id
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ==========================================
      // CHANGE ROLE (Admin+ only) - Changes GLOBAL role in profiles
      // ==========================================
      case 'changeRole': {
        if (!userId) throw new Error('User ID is required.');
        if (!role) throw new Error('New role is required.');

        if (!hasRoleLevel('admin')) {
          return forbidden('Admin access required.');
        }

        // Get target user's current role
        const { data: targetProfile } = await supabaseAdmin
          .from('profiles')
          .select('role, email')
          .eq('id', userId)
          .single();

        if (!targetProfile) {
          throw new Error('Target user not found.');
        }

        const refusal = roleChangeError(
          { id: user.id, role: currentUserRole },
          { id: userId, role: targetProfile.role },
          role,
        );
        if (refusal) return forbidden(refusal);

        const oldRole = targetProfile.role;

        // Update the GLOBAL role in profiles
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({ role, updated_at: new Date().toISOString() })
          .eq('id', userId);

        if (updateError) throw updateError;

        // Log activity
        await supabaseAdmin
          .from('activity_log')
          .insert({
            user_id: user.id,
            entity_type: 'user',
            entity_id: userId,
            action: 'role_changed',
            details: { user_id: userId, old_role: oldRole, new_role: role },
          });

        // Notify user
        await supabaseAdmin
          .from('user_notifications')
          .insert({
            user_id: userId,
            type: 'role_change',
            title: 'Role Updated',
            message: `Your role has been changed from ${oldRole} to ${role}.`,
          });

        try {
          await supabaseAdmin.from('audit_events').insert({
            user_id: user.id,
            user_email: user.email,
            user_role: currentUserRole,
            action: 'user.role_changed',
            entity_type: 'user',
            entity_id: userId,
            entity_name: targetProfile.email || null,
            ip_address: clientIp,
            user_agent: req.headers.get('user-agent') || null,
            source: 'edge_function',
            details: {
              old_values: { role: oldRole },
              new_values: { role },
            },
          });
        } catch (auditErr) {
          console.error('Audit log error:', auditErr);
        }

        return new Response(JSON.stringify({
          success: true,
          old_role: oldRole,
          new_role: role
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ==========================================
      // DEACTIVATE USER (Admin+ only) - Sets profiles.status = 'deactivated'
      // ==========================================
      case 'deactivate': {
        if (!userId) throw new Error('User ID is required.');

        if (!hasRoleLevel('admin')) {
          return new Response(JSON.stringify({ error: 'Admin access required.' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get target user's role and email
        const { data: targetProfile } = await supabaseAdmin
          .from('profiles')
          .select('role, email')
          .eq('id', userId)
          .single();

        if (!targetProfile) {
          throw new Error('User not found.');
        }

        const targetRoleLevel = ROLE_HIERARCHY[targetProfile.role] || 0;

        // Can't deactivate users with same or higher role (unless owner)
        if (currentUserRole !== 'owner' && targetRoleLevel >= currentUserRoleLevel) {
          throw new Error('Cannot deactivate users with same or higher role.');
        }

        // Can't deactivate yourself
        if (userId === user.id) {
          throw new Error('Cannot deactivate yourself.');
        }

        // Update status in profiles
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({ status: 'deactivated', updated_at: new Date().toISOString() })
          .eq('id', userId);

        if (updateError) throw updateError;

        // Ban user permanently in Supabase Auth
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          ban_duration: '876000h'  // ~100 years permanent ban
        });
        // Invalidate all existing sessions immediately
        try {
          await supabaseAdmin.auth.admin.signOut(userId, 'global');
        } catch (signOutErr) {
          console.error('Failed to sign out deactivated user:', signOutErr);
        }

        // Log activity
        await supabaseAdmin
          .from('activity_log')
          .insert({
            user_id: user.id,
            entity_type: 'user',
            entity_id: userId,
            action: 'user_deactivated',
            details: { user_id: userId, role_was: targetProfile.role },
          });

        try {
          await supabaseAdmin.from('audit_events').insert({
            user_id: user.id,
            user_email: user.email,
            user_role: currentUserRole,
            action: 'user.deactivated',
            entity_type: 'user',
            entity_id: userId,
            entity_name: targetProfile?.email || null,
            ip_address: clientIp,
            user_agent: req.headers.get('user-agent') || null,
            source: 'edge_function',
            details: { role: targetProfile.role },
          });
        } catch (auditErr) {
          console.error('Audit log error:', auditErr);
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'User deactivated.'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ==========================================
      // REACTIVATE USER (Admin+ only) - Sets profiles.status = 'active'
      // ==========================================
      case 'reactivate': {
        if (!userId) throw new Error('User ID is required.');

        if (!hasRoleLevel('admin')) {
          return new Response(JSON.stringify({ error: 'Admin access required.' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get target user's current status, role, and email
        const { data: targetUserProfile } = await supabaseAdmin
          .from('profiles')
          .select('role, status, email')
          .eq('id', userId)
          .single();

        if (!targetUserProfile) {
          throw new Error('User not found.');
        }

        // Check if user is already active
        if (targetUserProfile.status === 'active') {
          throw new Error('User is already active.');
        }

        const targetUserRoleLevel = ROLE_HIERARCHY[targetUserProfile.role] || 0;

        // Can't reactivate users with same or higher role (unless owner)
        if (currentUserRole !== 'owner' && targetUserRoleLevel >= currentUserRoleLevel) {
          throw new Error('Cannot reactivate users with same or higher role.');
        }

        // Update status in profiles
        const { error: reactivateError } = await supabaseAdmin
          .from('profiles')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('id', userId);

        if (reactivateError) throw reactivateError;

        // Log activity
        await supabaseAdmin
          .from('activity_log')
          .insert({
            user_id: user.id,
            entity_type: 'user',
            entity_id: userId,
            action: 'user_reactivated',
            details: { user_id: userId, role: targetUserProfile.role },
          });

        try {
          await supabaseAdmin.from('audit_events').insert({
            user_id: user.id,
            user_email: user.email,
            user_role: currentUserRole,
            action: 'user.reactivated',
            entity_type: 'user',
            entity_id: userId,
            entity_name: targetUserProfile?.email || null,
            ip_address: clientIp,
            user_agent: req.headers.get('user-agent') || null,
            source: 'edge_function',
            details: { role: targetUserProfile.role },
          });
        } catch (auditErr) {
          console.error('Audit log error:', auditErr);
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'User reactivated.'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ==========================================
      // DELETE USER (Admin+ only)
      // ==========================================
      case 'delete': {
        if (!hasRoleLevel('admin')) {
          return new Response(JSON.stringify({ error: 'Admin access required.' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!userId) throw new Error('User ID is required.');

        if (userId === user.id) {
          throw new Error('Cannot delete your own account.');
        }

        // Get target user's role and email
        const { data: targetProfile } = await supabaseAdmin
          .from('profiles')
          .select('role, email')
          .eq('id', userId)
          .single();

        if (targetProfile) {
          const targetRoleLevel = ROLE_HIERARCHY[targetProfile.role] || 0;
          if (currentUserRole !== 'owner' && targetRoleLevel >= currentUserRoleLevel) {
            throw new Error('Cannot delete users with same or higher role.');
          }
        }

        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (error) throw error;

        try {
          await supabaseAdmin.from('audit_events').insert({
            user_id: user.id,
            user_email: user.email,
            user_role: currentUserRole,
            action: 'user.deleted',
            entity_type: 'user',
            entity_id: userId,
            entity_name: targetProfile?.email || null,
            ip_address: clientIp,
            user_agent: req.headers.get('user-agent') || null,
            source: 'edge_function',
            details: { role: targetProfile?.role || null },
          });
        } catch (auditErr) {
          console.error('Audit log error:', auditErr);
        }

        return new Response(JSON.stringify({ message: 'User deleted successfully.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ==========================================
      // SET PASSWORD (Admin+ only)
      // ==========================================
      case 'setPassword': {
        if (!userId) throw new Error('User ID is required.');
        if (!password) throw new Error('Password is required.');
        if (password.length < 12) throw new Error('Password must be at least 12 characters.');
        if (!/[A-Z]/.test(password)) throw new Error('Password must contain at least one uppercase letter.');
        if (!/[a-z]/.test(password)) throw new Error('Password must contain at least one lowercase letter.');
        if (!/[0-9]/.test(password)) throw new Error('Password must contain at least one number.');

        if (!hasRoleLevel('admin')) {
          return new Response(JSON.stringify({ error: 'Admin access required.' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Setting a password signs in as that person, so it needs the same right as managing them.
        const { data: passwordTarget } = await supabaseAdmin
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .maybeSingle();
        if (!passwordTarget || !canManageUser({ id: user.id, role: currentUserRole }, { id: userId, role: passwordTarget.role })) {
          return forbidden(userId === user.id
            ? 'Change your own password from Account Settings.'
            : 'Only an owner can set the password of an admin or owner.');
        }

        // Update user password using admin API
        const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          userId,
          { password }
        );

        if (updateError) throw updateError;

        // Revoke all other sessions for the user whose password was reset
        await supabaseAdmin.auth.admin.signOut(userId, 'others');

        // Also confirm email if not confirmed (for invited users)
        if (updatedUser.user && !updatedUser.user.email_confirmed_at) {
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            email_confirm: true,
          });
        }

        try {
          await supabaseAdmin.from('audit_events').insert({
            user_id: user.id,
            user_email: user.email,
            user_role: currentUserRole,
            action: 'user.password_set',
            entity_type: 'user',
            entity_id: userId,
            entity_name: updatedUser.user?.email || null,
            ip_address: clientIp,
            user_agent: req.headers.get('user-agent') || null,
            source: 'edge_function',
            details: { email_confirmed: !updatedUser.user?.email_confirmed_at },
          });
        } catch (auditErr) {
          console.error('Audit log error:', auditErr);
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'Password set successfully. User can now log in.'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        throw new Error(`Invalid action: ${action}`);
    }

  } catch (error: unknown) {
    console.error('[manage-users] error:', error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});