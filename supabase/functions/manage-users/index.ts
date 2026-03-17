import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response>): void;
};

// Valid roles (global, stored in profiles.role)
const VALID_ROLES = ['owner', 'admin', 'lead', 'analyst', 'viewer', 'user'];
const ROLE_HIERARCHY: Record<string, number> = {
  owner: 5,
  admin: 4,
  lead: 3,
  analyst: 2,
  viewer: 1,
  user: 0,
};

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
  action: 'list' | 'create' | 'delete' | 'invite' | 'changeRole' | 'deactivate' | 'reactivate' | 'setPassword' | 'addToTeam' | 'removeFromTeam';
  email?: string;
  password?: string;
  userId?: string;
  role?: string;
  teamId?: string;
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

    // Extract client IP once — use last value in XFF chain (closest trusted proxy)
    const xffHeader = req.headers.get('x-forwarded-for');
    const clientIp = xffHeader ? xffHeader.split(',').pop()?.trim() || null : null;

    const body: RequestBody = await req.json();
    const { action, email, password, userId, role, teamId } = body;

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
          return new Response(JSON.stringify({ error: 'Admin access required.' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        if (!email || !password) throw new Error('Email and password are required.');
        if (!role) throw new Error('Role is required.');
        if (!VALID_ROLES.includes(role)) {
          throw new Error(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);
        }
        
        // Can't create users with higher role than yourself
        if (ROLE_HIERARCHY[role] > currentUserRoleLevel) {
          throw new Error(`Cannot create user with role higher than your own.`);
        }
        
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        
        if (error) throw error;
        
        // Set the global role in profiles
        if (data.user) {
          await supabaseAdmin
            .from('profiles')
            .update({ role })
            .eq('id', data.user.id);
        }

        try {
          await supabaseAdmin.from('audit_events').insert({
            user_id: user.id,
            user_email: user.email,
            user_role: currentUserRole,
            action: 'user.created',
            entity_type: 'user',
            entity_id: data.user?.id || null,
            entity_name: email,
            ip_address: clientIp,
            user_agent: req.headers.get('user-agent') || null,
            source: 'edge_function',
            details: { email, role },
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
        if (!role) throw new Error('Role is required.');
        
        if (!VALID_ROLES.includes(role)) {
          throw new Error(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);
        }
        
        if (!hasRoleLevel('admin')) {
          return new Response(JSON.stringify({ error: 'Admin access required to invite users.' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // Can't invite users with higher role than yourself
        if (ROLE_HIERARCHY[role] > currentUserRoleLevel) {
          throw new Error(`Cannot invite user with role higher than your own.`);
        }
        
        // Check if user already exists
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find(u => u.email === email);
        
        if (existingUser) {
          // Check existing user's role — cannot demote equal or higher role
          const { data: existingProfile } = await supabaseAdmin
            .from('profiles')
            .select('role')
            .eq('id', existingUser.id)
            .single();
          const existingRoleLevel = ROLE_HIERARCHY[existingProfile?.role] || 0;
          if (currentUserRole !== 'owner' && existingRoleLevel >= currentUserRoleLevel) {
            throw new Error('Cannot modify users with same or higher role.');
          }

          // User exists - update their role if needed and optionally add to team
          await supabaseAdmin
            .from('profiles')
            .update({ role, updated_at: new Date().toISOString() })
            .eq('id', existingUser.id);
          
          // If teamId provided, add to team
          if (teamId) {
            const { data: existingMember } = await supabaseAdmin
              .from('team_members')
              .select('id')
              .eq('team_id', teamId)
              .eq('user_id', existingUser.id)
              .single();
            
            if (!existingMember) {
              await supabaseAdmin
                .from('team_members')
                .insert({
                  team_id: teamId,
                  user_id: existingUser.id,
                  joined_at: new Date().toISOString(),
                });
            }
          }
          
          try {
            await supabaseAdmin.from('audit_events').insert({
              user_id: user.id,
              user_email: user.email,
              user_role: currentUserRole,
              action: 'user.invited',
              entity_type: 'user',
              entity_id: existingUser.id,
              entity_name: email,
              ip_address: clientIp,
              user_agent: req.headers.get('user-agent') || null,
              source: 'edge_function',
              details: { email, role, existing_user: true, team_id: teamId || null },
            });
          } catch (auditErr) {
            console.error('Audit log error:', auditErr);
          }

          return new Response(JSON.stringify({
            success: true,
            message: 'Existing user role updated.',
            userId: existingUser.id
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // Create invitation record
        const { data: invitation, error: inviteRecordError } = await supabaseAdmin
          .from('team_invitations')
          .insert({
            team_id: teamId || null,
            email,
            role,  // This is the GLOBAL role the user will get
            invited_by: user.id,
          })
          .select()
          .single();
        
        if (inviteRecordError) throw inviteRecordError;
        
        // Send Supabase auth invitation
        const siteUrl = Deno.env.get('SITE_URL') || 'http://localhost:5173';
        
        const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          redirectTo: `${siteUrl}/auth/callback`,
          data: {
            role,  // Pass role in metadata for profile creation trigger
            team_id: teamId,
          }
        });
        
        if (inviteError) {
          // Cleanup invitation record
          await supabaseAdmin
            .from('team_invitations')
            .delete()
            .eq('id', invitation.id);
          
          throw inviteError;
        }
        
        // Log activity
        await supabaseAdmin
          .from('activity_log')
          .insert({
            team_id: teamId || null,
            user_id: user.id,
            entity_type: 'user',
            entity_id: email,
            action: 'user_invited',
            details: { email, role, invited_by: user.id },
          });

        try {
          await supabaseAdmin.from('audit_events').insert({
            user_id: user.id,
            user_email: user.email,
            user_role: currentUserRole,
            action: 'user.invited',
            entity_type: 'user',
            entity_id: invitation.id,
            entity_name: email,
            ip_address: clientIp,
            user_agent: req.headers.get('user-agent') || null,
            source: 'edge_function',
            details: { email, role, team_id: teamId || null, invitation_id: invitation.id },
          });
        } catch (auditErr) {
          console.error('Audit log error:', auditErr);
        }

        return new Response(JSON.stringify({
          success: true,
          message: `Invitation sent to ${email}`,
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
        
        if (!VALID_ROLES.includes(role)) {
          throw new Error(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);
        }
        
        if (!hasRoleLevel('admin')) {
          return new Response(JSON.stringify({ error: 'Admin access required.' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
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
        
        const targetRoleLevel = ROLE_HIERARCHY[targetProfile.role] || 0;
        const newRoleLevel = ROLE_HIERARCHY[role] || 0;
        
        // Can't modify users with same or higher role (unless you're owner)
        if (currentUserRole !== 'owner' && targetRoleLevel >= currentUserRoleLevel) {
          throw new Error('Cannot modify users with same or higher role.');
        }
        
        // Can't promote to same or higher level than yourself (unless owner)
        if (currentUserRole !== 'owner' && newRoleLevel >= currentUserRoleLevel) {
          throw new Error('Cannot promote user to same or higher role than yourself.');
        }
        
        // Can't demote yourself
        if (userId === user.id) {
          throw new Error('Cannot change your own role.');
        }
        
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

      // ==========================================
      // ADD USER TO TEAM (Lead+ only) - Just membership, no role
      // ==========================================
      case 'addToTeam': {
        if (!userId) throw new Error('User ID is required.');
        if (!teamId) throw new Error('Team ID is required.');
        
        if (!hasRoleLevel('lead')) {
          return new Response(JSON.stringify({ error: 'Lead or higher access required.' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // Check if already a member
        const { data: existingMember } = await supabaseAdmin
          .from('team_members')
          .select('id')
          .eq('team_id', teamId)
          .eq('user_id', userId)
          .single();
        
        if (existingMember) {
          throw new Error('User is already a member of this team.');
        }
        
        // Add to team
        const { error: insertError } = await supabaseAdmin
          .from('team_members')
          .insert({
            team_id: teamId,
            user_id: userId,
            joined_at: new Date().toISOString(),
          });
        
        if (insertError) throw insertError;
        
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'User added to team.' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ==========================================
      // REMOVE USER FROM TEAM (Lead+ only)
      // ==========================================
      case 'removeFromTeam': {
        if (!userId) throw new Error('User ID is required.');
        if (!teamId) throw new Error('Team ID is required.');
        
        if (!hasRoleLevel('lead')) {
          return new Response(JSON.stringify({ error: 'Lead or higher access required.' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // Remove from team
        const { error: deleteError } = await supabaseAdmin
          .from('team_members')
          .delete()
          .eq('team_id', teamId)
          .eq('user_id', userId);
        
        if (deleteError) throw deleteError;
        
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'User removed from team.' 
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