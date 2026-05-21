-- ============================================================
-- 06_functions.sql - All PL/pgSQL and SQL functions
-- Run after: 05_materialized_views.sql
-- ============================================================

-- ============================================================
-- AUTH HELPERS
-- ============================================================

-- Trigger function: creates profile on new user signup, processes pending invitation if any
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invitation RECORD;
  v_full_name text;
  v_role text;
BEGIN
  -- Extract display name from email
  v_full_name := split_part(NEW.email, '@', 1);

  -- Extract role from invite metadata, default to 'analyst'
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'analyst');
  IF v_role NOT IN ('owner', 'admin', 'lead', 'analyst', 'viewer') THEN
    v_role := 'analyst';
  END IF;

  -- Create the profile
  INSERT INTO public.profiles (id, email, role, full_name, status, password_set, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    v_role,
    v_full_name,
    'active',
    CASE WHEN NEW.raw_app_meta_data->>'provider' = 'email' THEN false ELSE true END,
    now(),
    now()
  );

  -- Check for pending invitation by email and mark accepted if found
  SELECT * INTO v_invitation
  FROM user_invitations
  WHERE email = NEW.email
    AND accepted_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invitation IS NOT NULL THEN
    UPDATE user_invitations
    SET accepted_at = now()
    WHERE id = v_invitation.id;

    INSERT INTO activity_log (user_id, entity_type, entity_id, action, details)
    VALUES (
      NEW.id, 'user', NEW.id::text, 'user_joined',
      jsonb_build_object(
        'email', NEW.email, 'role', v_invitation.role,
        'invited_by', v_invitation.invited_by, 'method', 'invitation'
      )
    );

    INSERT INTO user_notifications (user_id, type, title, message)
    VALUES (
      NEW.id, 'welcome', 'Welcome to Optimus!',
      'Your account has been created as ' || v_invitation.role || '. Start by exploring the Detection Library.'
    );
  ELSE
    INSERT INTO activity_log (user_id, entity_type, entity_id, action, details)
    VALUES (
      NEW.id, 'user', NEW.id::text, 'user_registered',
      jsonb_build_object('email', NEW.email, 'method', 'direct_signup')
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Complete password setup after invite (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.complete_password_setup(p_full_name text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE profiles
  SET password_set = true,
      full_name = COALESCE(p_full_name, full_name),
      updated_at = now()
  WHERE id = auth.uid();
END;
$$;

-- Check if user is a global admin (owner or admin role in profiles)
CREATE OR REPLACE FUNCTION public.is_global_admin(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id
    AND role IN ('owner', 'admin')
  );
END;
$function$;

-- Check if user is a global admin or lead (owner, admin, or lead role in profiles)
CREATE OR REPLACE FUNCTION public.is_global_admin_or_lead(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id
    AND role IN ('owner', 'admin', 'lead')
  );
END;
$function$;

-- Get user permissions based on global role (in profiles.role)
CREATE OR REPLACE FUNCTION public.get_user_permissions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_current_user uuid := auth.uid();
  v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = v_current_user;

  RETURN jsonb_build_object(
    'user_id', v_current_user,
    'role', COALESCE(v_role, 'viewer'),
    'is_global_admin', COALESCE(v_role IN ('owner', 'admin'), false),
    'permissions', CASE COALESCE(v_role, 'viewer')
      WHEN 'owner' THEN jsonb_build_object(
        'detection_create', true, 'detection_edit_any', true, 'detection_delete_any', true,
        'user_manage', true, 'user_invite', true,
        'assign', true, 'review', true, 'publish_approve', true,
        'view_activity', true, 'export_bulk', true
      )
      WHEN 'admin' THEN jsonb_build_object(
        'detection_create', true, 'detection_edit_any', true, 'detection_delete_any', true,
        'user_manage', true, 'user_invite', true,
        'assign', true, 'review', true, 'publish_approve', true,
        'view_activity', true, 'export_bulk', true
      )
      WHEN 'lead' THEN jsonb_build_object(
        'detection_create', true, 'detection_edit_any', true, 'detection_delete_any', true,
        'user_manage', false, 'user_invite', false,
        'assign', true, 'review', true, 'publish_approve', false,
        'view_activity', true, 'export_bulk', false
      )
      WHEN 'analyst' THEN jsonb_build_object(
        'detection_create', true, 'detection_edit_assigned', true, 'detection_delete_own', true,
        'user_manage', false, 'user_invite', false,
        'assign', false, 'review', false, 'publish_approve', false,
        'view_activity', false, 'export_bulk', false,
        'self_assign', true, 'request_review', true
      )
      ELSE jsonb_build_object(
        'detection_view', true,
        'comment', true
      )
    END
  );
END;
$function$;

-- Clean up all data for a user being deleted
CREATE OR REPLACE FUNCTION public.cleanup_user_data(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    owner_user_id UUID;
BEGIN
    -- Get an owner to transfer detections to
    SELECT id INTO owner_user_id
    FROM profiles
    WHERE role = 'owner' AND id != target_user_id
    LIMIT 1;

    IF owner_user_id IS NULL THEN
        SELECT id INTO owner_user_id
        FROM profiles
        WHERE id != target_user_id
        LIMIT 1;
    END IF;

    -- Clean up related data
    DELETE FROM activity_log WHERE user_id = target_user_id;
    DELETE FROM user_notifications WHERE user_id = target_user_id;
    DELETE FROM detection_comments WHERE user_id = target_user_id;
    DELETE FROM detection_reviews WHERE reviewer_id = target_user_id OR requested_by = target_user_id;
    DELETE FROM user_invitations WHERE invited_by = target_user_id;
    UPDATE detections SET assigned_to = NULL WHERE assigned_to = target_user_id;

    IF owner_user_id IS NOT NULL THEN
        UPDATE detections SET user_id = owner_user_id WHERE user_id = target_user_id;
    ELSE
        DELETE FROM detections WHERE user_id = target_user_id;
    END IF;

    DELETE FROM profiles WHERE id = target_user_id;
END;
$function$;


-- ============================================================
-- TEAM MANAGEMENT — removed; teams concept retired
-- See migration 20260429b_drop_teams.sql
-- (was: add_user_to_team, change_team_role, deactivate_team_member,
--  get_team_role, has_team_role, is_team_member)
-- ============================================================

-- ============================================================
-- DETECTION OPERATIONS
-- ============================================================

-- Pre-flight check to verify user has permission to write detections
CREATE OR REPLACE FUNCTION public.check_detection_write_permission(p_user_id uuid, p_library_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_profile RECORD;
  v_result JSONB;
BEGIN
  -- Get user profile
  SELECT * INTO v_profile
  FROM profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error', 'User profile not found'
    );
  END IF;

  -- Check Development Library permissions (only owners/admins can write directly)
  IF p_library_type = 'development' THEN
    IF v_profile.role NOT IN ('owner', 'admin') THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'error', 'Only owners and admins can import to Development Library',
        'required_role', 'admin',
        'current_role', v_profile.role
      );
    END IF;
  END IF;

  -- All checks passed
  RETURN jsonb_build_object(
    'allowed', true,
    'user_id', p_user_id,
    'library_type', p_library_type,
    'user_role', v_profile.role
  );
END;
$function$;

-- Fork a Production Library detection to the Development Library for experimentation
CREATE OR REPLACE FUNCTION public.fork_to_development(p_detection_id text, p_user_id uuid DEFAULT auth.uid())
RETURNS text AS $$
DECLARE
  v_source_rule RECORD;
  v_new_id text;
  v_existing_id text;
BEGIN
  -- Source must be a Production Library rule (library_type = 'production')
  SELECT * INTO v_source_rule
  FROM detections
  WHERE id = p_detection_id AND library_type = 'production';

  IF v_source_rule IS NULL THEN
    RAISE EXCEPTION 'Detection not found or not in Production Library';
  END IF;

  -- Check if user already has a development fork
  SELECT id INTO v_existing_id
  FROM detections
  WHERE source_rule_id = p_detection_id
    AND user_id = p_user_id
    AND library_type = 'development';

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'You already have a development copy of this detection (ID: %)', v_existing_id;
  END IF;

  v_new_id := gen_random_uuid()::text;

  INSERT INTO detections (
    id, user_id, version, library_type, source_rule_id, promotion_status,
    name, description, author, status, severity, "detectionType",
    "logSource", "logSources", technology, "queryLanguage", "detectionQuery",
    queries, "queryExplanation", "mitreAttackIds", "mitreTactics", "mitreTechniques",
    "linkedGroups", "linkedSoftware", "linkedCampaigns",
    "threatActors", campaigns, software, "associatedCVEs",
    "dataSources", "dataComponents", platforms,
    "investigationSteps", "responseActions", "falsePositiveGuidance",
    prerequisites, caveats, "fineTuning",
    "testedAndValidated", "testCases", "qualityScore",
    "references", tags,
    "createdDate", "updatedDate"
  )
  SELECT
    v_new_id, p_user_id, 1, 'development', p_detection_id, 'none',
    name, description, author, 'Draft', severity, "detectionType",
    "logSource", "logSources", technology, "queryLanguage", "detectionQuery",
    queries, "queryExplanation", "mitreAttackIds", "mitreTactics", "mitreTechniques",
    "linkedGroups", "linkedSoftware", "linkedCampaigns",
    "threatActors", campaigns, software, "associatedCVEs",
    "dataSources", "dataComponents", platforms,
    "investigationSteps", "responseActions", "falsePositiveGuidance",
    prerequisites, caveats, "fineTuning",
    "testedAndValidated", "testCases", "qualityScore",
    "references", tags,
    now(), now()
  FROM detections WHERE id = p_detection_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get dynamic filter options for detections based on library type
CREATE OR REPLACE FUNCTION public.get_filter_options(p_library_type text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT json_build_object(
    'technologies',
      COALESCE((
        SELECT array_agg(DISTINCT technology ORDER BY technology)
        FROM detections
        WHERE library_type = p_library_type
          AND technology IS NOT NULL AND technology != ''
      ), '{}'),

    'log_sources',
      COALESCE((
        SELECT array_agg(DISTINCT "logSource" ORDER BY "logSource")
        FROM detections
        WHERE library_type = p_library_type
          AND "logSource" IS NOT NULL AND "logSource" != ''
      ), '{}'),

    'authors',
      COALESCE((
        SELECT array_agg(DISTINCT author ORDER BY author)
        FROM detections
        WHERE library_type = p_library_type
          AND author IS NOT NULL AND author != ''
      ), '{}'),

    'platforms',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest(platforms) val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'tags',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest(tags) val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'mitre_tactics',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest("mitreTactics") val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'mitre_techniques',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest("mitreTechniques") val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'threat_actors',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest("threatActors") val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'campaigns',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest(campaigns) val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'software',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest(software) val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'cves',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest("associatedCVEs") val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}')
  );
$function$;

-- Check promotion eligibility for a detection
CREATE OR REPLACE FUNCTION public.check_promotion_eligibility(p_detection_id text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_detection RECORD;
  v_is_pending BOOLEAN;
  v_is_promoted_unchanged BOOLEAN;
BEGIN
  SELECT * INTO v_detection FROM detections WHERE id = p_detection_id;

  IF NOT FOUND THEN
    RETURN json_build_object('eligible', false, 'error', 'Detection not found');
  END IF;

  -- Check if currently pending approval
  v_is_pending := v_detection.promotion_status = 'pending';

  -- Check if promoted and NOT updated since (no changes to re-promote)
  v_is_promoted_unchanged := (
    v_detection.promotion_status = 'promoted' AND
    v_detection.promoted_at IS NOT NULL AND
    v_detection."updatedDate" <= v_detection.promoted_at
  );

  RETURN json_build_object(
    'eligible', (
      NOT v_is_pending AND
      NOT v_is_promoted_unchanged AND
      COALESCE(v_detection."qualityScore", 0) >= 60 AND
      v_detection.name IS NOT NULL AND v_detection.name != '' AND
      v_detection.description IS NOT NULL AND LENGTH(v_detection.description) >= 20 AND
      v_detection."mitreAttackIds" IS NOT NULL AND array_length(v_detection."mitreAttackIds", 1) > 0 AND
      v_detection."detectionQuery" IS NOT NULL AND v_detection."detectionQuery" != ''
    ),
    'checks', json_build_object(
      'quality_score', json_build_object('passed', COALESCE(v_detection."qualityScore", 0) >= 60, 'value', COALESCE(v_detection."qualityScore", 0), 'required', 60),
      'name', json_build_object('passed', v_detection.name IS NOT NULL AND v_detection.name != '', 'value', v_detection.name),
      'description', json_build_object('passed', v_detection.description IS NOT NULL AND LENGTH(v_detection.description) >= 20, 'length', COALESCE(LENGTH(v_detection.description), 0), 'required', 20),
      'mitre_mapping', json_build_object('passed', v_detection."mitreAttackIds" IS NOT NULL AND array_length(v_detection."mitreAttackIds", 1) > 0, 'count', COALESCE(array_length(v_detection."mitreAttackIds", 1), 0)),
      'detection_query', json_build_object('passed', v_detection."detectionQuery" IS NOT NULL AND v_detection."detectionQuery" != '')
    ),
    'promotion_status', v_detection.promotion_status,
    'already_promoted', v_detection.promotion_status = 'promoted',
    'is_pending', v_is_pending,
    'is_promoted_unchanged', v_is_promoted_unchanged,
    'is_update', v_detection.source_rule_id IS NOT NULL
  );
END;
$function$;

-- Submit a detection for promotion to the Production Library (text id variant)
CREATE OR REPLACE FUNCTION public.submit_for_promotion(p_detection_id text, p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_detection RECORD;
  v_request_id UUID;
  v_target_rule_id TEXT;
BEGIN
  -- Get the detection — must be in Development Library and owned by user
  SELECT * INTO v_detection
  FROM detections
  WHERE id = p_detection_id
    AND library_type = 'development'
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Detection not found or not owned by user');
  END IF;

  IF v_detection.promotion_status = 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'Already pending approval');
  END IF;

  -- Quality gates
  IF COALESCE(v_detection."qualityScore", 0) < 60 THEN
    RETURN json_build_object('success', false, 'error', 'Quality score must be at least 60',
                            'current_score', v_detection."qualityScore");
  END IF;

  IF v_detection.name IS NULL OR v_detection.name = '' THEN
    RETURN json_build_object('success', false, 'error', 'Name is required');
  END IF;

  IF v_detection.description IS NULL OR LENGTH(v_detection.description) < 20 THEN
    RETURN json_build_object('success', false, 'error', 'Description must be at least 20 characters');
  END IF;

  IF v_detection."mitreAttackIds" IS NULL OR array_length(v_detection."mitreAttackIds", 1) IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'At least one MITRE technique is required');
  END IF;

  IF v_detection."detectionQuery" IS NULL OR v_detection."detectionQuery" = '' THEN
    RETURN json_build_object('success', false, 'error', 'Detection query is required');
  END IF;

  v_target_rule_id := v_detection.source_rule_id;

  INSERT INTO promotion_requests (detection_id, target_rule_id, submitted_by, status)
  VALUES (p_detection_id, v_target_rule_id, p_user_id, 'pending')
  RETURNING id INTO v_request_id;

  UPDATE detections
  SET promotion_status = 'pending', "updatedDate" = now()
  WHERE id = p_detection_id;

  -- Notify admin users about new publish request
  INSERT INTO user_notifications (id, user_id, type, title, message, detection_id, action_url, category, source_user_id)
  SELECT
    gen_random_uuid(),
    p2.id,
    'publish_submitted',
    'New Publish Request',
    '"' || v_detection.name || '" submitted for production',
    p_detection_id,
    '/approval-queue',
    'approval',
    p_user_id
  FROM profiles p2
  WHERE p2.role IN ('admin', 'lead')
    AND p2.id != p_user_id;

  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'target_action', CASE WHEN v_target_rule_id IS NULL THEN 'create_new' ELSE 'update_existing' END,
    'target_rule_id', v_target_rule_id
  );
END;
$function$;

-- Submit a detection for promotion to the Production Library (uuid id variant)
CREATE OR REPLACE FUNCTION public.submit_for_promotion(p_detection_id uuid, p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_detection RECORD;
  v_request_id UUID;
  v_target_rule_id TEXT;
BEGIN
  -- Get the detection — must be in Development Library and owned by user
  SELECT * INTO v_detection
  FROM detections
  WHERE id = p_detection_id
    AND library_type = 'development'
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Detection not found or not owned by user');
  END IF;

  IF v_detection.promotion_status = 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'Already pending approval');
  END IF;

  -- Block re-submission of promoted detections that haven't been modified
  IF v_detection.promotion_status = 'promoted'
     AND v_detection.promoted_at IS NOT NULL
     AND v_detection."updatedDate" <= v_detection.promoted_at THEN
    RETURN json_build_object('success', false, 'error', 'Already promoted and unchanged since last promotion');
  END IF;

  -- Quality gates
  IF COALESCE(v_detection."qualityScore", 0) < 60 THEN
    RETURN json_build_object('success', false, 'error', 'Quality score must be at least 60',
                            'current_score', v_detection."qualityScore");
  END IF;

  IF v_detection.name IS NULL OR v_detection.name = '' THEN
    RETURN json_build_object('success', false, 'error', 'Name is required');
  END IF;

  IF v_detection.description IS NULL OR LENGTH(v_detection.description) < 20 THEN
    RETURN json_build_object('success', false, 'error', 'Description must be at least 20 characters');
  END IF;

  IF v_detection."mitreAttackIds" IS NULL OR array_length(v_detection."mitreAttackIds", 1) IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'At least one MITRE technique is required');
  END IF;

  IF v_detection."detectionQuery" IS NULL OR v_detection."detectionQuery" = '' THEN
    RETURN json_build_object('success', false, 'error', 'Detection query is required');
  END IF;

  v_target_rule_id := v_detection.source_rule_id;

  INSERT INTO promotion_requests (detection_id, target_rule_id, submitted_by, status)
  VALUES (p_detection_id, v_target_rule_id, p_user_id, 'pending')
  RETURNING id INTO v_request_id;

  UPDATE detections
  SET promotion_status = 'pending', "updatedDate" = now()
  WHERE id = p_detection_id;

  -- Notify admin users about new publish request
  INSERT INTO user_notifications (id, user_id, type, title, message, detection_id, action_url, category, source_user_id)
  SELECT
    gen_random_uuid(),
    p2.id,
    'publish_submitted',
    'New Publish Request',
    '"' || v_detection.name || '" submitted for production',
    p_detection_id,
    '/approval-queue',
    'approval',
    p_user_id
  FROM profiles p2
  WHERE p2.role IN ('admin', 'lead')
    AND p2.id != p_user_id;

  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'target_action', CASE WHEN v_target_rule_id IS NULL THEN 'create_new' ELSE 'update_existing' END,
    'target_rule_id', v_target_rule_id
  );
END;
$function$;

-- Approve or reject a promotion request (admin/lead action)
CREATE OR REPLACE FUNCTION public.approve_promotion(p_request_id uuid, p_admin_id uuid DEFAULT auth.uid(), p_action text DEFAULT 'approve'::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_request RECORD;
  v_detection RECORD;
  v_target_detection_id TEXT;
  v_notification_type TEXT;
  v_notification_title TEXT;
  v_notification_message TEXT;
  v_is_update BOOLEAN := false;
  v_current_version INTEGER;
BEGIN
  -- Verify role (owner, admin, or lead can approve promotions)
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin_id AND role IN ('owner', 'admin', 'lead')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin or Lead access required');
  END IF;

  -- Get request
  SELECT * INTO v_request FROM promotion_requests WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_request.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request already processed');
  END IF;

  -- Get detection
  SELECT * INTO v_detection FROM detections WHERE id = v_request.detection_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Detection not found');
  END IF;

  IF p_action = 'approve' THEN
    -- Determine if this is an update or new promotion

    IF v_detection.promoted_to_id IS NOT NULL THEN
      v_target_detection_id := v_detection.promoted_to_id;
      v_is_update := true;

      IF NOT EXISTS (SELECT 1 FROM detections WHERE id = v_target_detection_id AND library_type = 'production') THEN
        v_target_detection_id := gen_random_uuid()::text;
        v_is_update := false;
      END IF;

    ELSIF v_detection.source_rule_id IS NOT NULL THEN
      v_target_detection_id := v_detection.source_rule_id;
      v_is_update := true;

      IF NOT EXISTS (SELECT 1 FROM detections WHERE id = v_target_detection_id AND library_type = 'production') THEN
        v_target_detection_id := gen_random_uuid()::text;
        v_is_update := false;
      END IF;

    ELSE
      v_target_detection_id := gen_random_uuid()::text;
      v_is_update := false;
    END IF;

    IF v_is_update THEN
      -- Get current version as integer
      SELECT COALESCE(version, 1) INTO v_current_version
      FROM detections WHERE id = v_target_detection_id;

      -- UPDATE existing Production Library rule
      UPDATE detections
      SET
        name = v_detection.name,
        description = v_detection.description,
        status = v_detection.status,
        severity = v_detection.severity,
        author = v_detection.author,
        "detectionType" = v_detection."detectionType",
        "logSource" = v_detection."logSource",
        "logSources" = v_detection."logSources",
        technology = v_detection.technology,
        "queryLanguage" = v_detection."queryLanguage",
        "detectionQuery" = v_detection."detectionQuery",
        queries = v_detection.queries,
        "queryExplanation" = v_detection."queryExplanation",
        "mitreAttackIds" = v_detection."mitreAttackIds",
        "mitreTactics" = v_detection."mitreTactics",
        "mitreTechniques" = v_detection."mitreTechniques",
        "linkedGroups" = v_detection."linkedGroups",
        "linkedSoftware" = v_detection."linkedSoftware",
        "linkedCampaigns" = v_detection."linkedCampaigns",
        "threatActors" = v_detection."threatActors",
        campaigns = v_detection.campaigns,
        software = v_detection.software,
        "associatedCVEs" = v_detection."associatedCVEs",
        "dataSources" = v_detection."dataSources",
        "dataComponents" = v_detection."dataComponents",
        platforms = v_detection.platforms,
        "investigationSteps" = v_detection."investigationSteps",
        "responseActions" = v_detection."responseActions",
        "falsePositiveGuidance" = v_detection."falsePositiveGuidance",
        prerequisites = v_detection.prerequisites,
        caveats = v_detection.caveats,
        "fineTuning" = v_detection."fineTuning",
        "testedAndValidated" = v_detection."testedAndValidated",
        "testCases" = v_detection."testCases",
        "qualityScore" = v_detection."qualityScore",
        "references" = v_detection."references",
        tags = v_detection.tags,
        "updatedDate" = NOW(),
        version = v_current_version + 1
      WHERE id = v_target_detection_id;

      v_notification_message := 'Your update to "' || v_detection.name || '" has been approved and the Production Library rule has been updated.';
    ELSE
      -- CREATE new Production Library rule
      INSERT INTO detections (
        id, name, description, status, severity, author, version,
        "createdDate", "updatedDate", "detectionType", "logSource", "logSources", technology,
        "queryLanguage", "detectionQuery", queries, "queryExplanation",
        "mitreAttackIds", "mitreTactics", "mitreTechniques",
        "linkedGroups", "linkedSoftware", "linkedCampaigns",
        "threatActors", campaigns, software, "associatedCVEs",
        "dataSources", "dataComponents", platforms,
        "investigationSteps", "responseActions", "falsePositiveGuidance",
        prerequisites, caveats, "fineTuning",
        "testedAndValidated", "testCases", "qualityScore",
        "references", tags,
        library_type, source, user_id
      ) VALUES (
        v_target_detection_id,
        v_detection.name,
        v_detection.description,
        v_detection.status,
        v_detection.severity,
        v_detection.author,
        1,
        NOW(),
        NOW(),
        v_detection."detectionType",
        v_detection."logSource",
        v_detection."logSources",
        v_detection.technology,
        v_detection."queryLanguage",
        v_detection."detectionQuery",
        v_detection.queries,
        v_detection."queryExplanation",
        v_detection."mitreAttackIds",
        v_detection."mitreTactics",
        v_detection."mitreTechniques",
        v_detection."linkedGroups",
        v_detection."linkedSoftware",
        v_detection."linkedCampaigns",
        v_detection."threatActors",
        v_detection.campaigns,
        v_detection.software,
        v_detection."associatedCVEs",
        v_detection."dataSources",
        v_detection."dataComponents",
        v_detection.platforms,
        v_detection."investigationSteps",
        v_detection."responseActions",
        v_detection."falsePositiveGuidance",
        v_detection.prerequisites,
        v_detection.caveats,
        v_detection."fineTuning",
        v_detection."testedAndValidated",
        v_detection."testCases",
        v_detection."qualityScore",
        v_detection."references",
        v_detection.tags,
        'production',
        'community',
        v_request.submitted_by
      );

      v_notification_message := 'Your detection "' || v_detection.name || '" has been approved and promoted to the Production Library.';
    END IF;

    -- Update original Development Library detection to link to Production
    UPDATE detections
    SET
      promotion_status = 'promoted',
      promoted_to_id = v_target_detection_id,
      promoted_at = NOW(),
      "updatedDate" = NOW()
    WHERE id = v_request.detection_id;

    -- Update request with correct column names
    UPDATE promotion_requests
    SET
      status = 'approved',
      reviewed_by = p_admin_id,
      reviewer_id = p_admin_id,
      reviewed_at = NOW(),
      review_notes = p_notes,
      result_rule_id = v_target_detection_id,
      updated_at = NOW()
    WHERE id = p_request_id;

    v_notification_type := 'promotion_approved';
    v_notification_title := CASE WHEN v_is_update THEN 'Production Update Approved' ELSE 'Promoted to Production' END;

  ELSIF p_action = 'approve_as_new' THEN
    v_target_detection_id := gen_random_uuid()::text;

    INSERT INTO detections (
      id, name, description, status, severity, author, version,
      "createdDate", "updatedDate", "detectionType", "logSource", "logSources", technology,
      "queryLanguage", "detectionQuery", queries, "queryExplanation",
      "mitreAttackIds", "mitreTactics", "mitreTechniques",
      "linkedGroups", "linkedSoftware", "linkedCampaigns",
      "threatActors", campaigns, software, "associatedCVEs",
      "dataSources", "dataComponents", platforms,
      "investigationSteps", "responseActions", "falsePositiveGuidance",
      prerequisites, caveats, "fineTuning",
      "testedAndValidated", "testCases", "qualityScore",
      "references", tags,
      library_type, source, user_id
    ) VALUES (
      v_target_detection_id,
      v_detection.name,
      v_detection.description,
      v_detection.status,
      v_detection.severity,
      v_detection.author,
      1,
      NOW(),
      NOW(),
      v_detection."detectionType",
      v_detection."logSource",
      v_detection."logSources",
      v_detection.technology,
      v_detection."queryLanguage",
      v_detection."detectionQuery",
      v_detection.queries,
      v_detection."queryExplanation",
      v_detection."mitreAttackIds",
      v_detection."mitreTactics",
      v_detection."mitreTechniques",
      v_detection."linkedGroups",
      v_detection."linkedSoftware",
      v_detection."linkedCampaigns",
      v_detection."threatActors",
      v_detection.campaigns,
      v_detection.software,
      v_detection."associatedCVEs",
      v_detection."dataSources",
      v_detection."dataComponents",
      v_detection.platforms,
      v_detection."investigationSteps",
      v_detection."responseActions",
      v_detection."falsePositiveGuidance",
      v_detection.prerequisites,
      v_detection.caveats,
      v_detection."fineTuning",
      v_detection."testedAndValidated",
      v_detection."testCases",
      v_detection."qualityScore",
      v_detection."references",
      v_detection.tags,
      'production',
      'community',
      v_request.submitted_by
    );

    -- Update original detection
    UPDATE detections
    SET
      promotion_status = 'promoted',
      promoted_to_id = v_target_detection_id,
      promoted_at = NOW(),
      "updatedDate" = NOW()
    WHERE id = v_request.detection_id;

    -- Update request
    UPDATE promotion_requests
    SET
      status = 'approved',
      reviewed_by = p_admin_id,
      reviewer_id = p_admin_id,
      reviewed_at = NOW(),
      review_notes = p_notes,
      result_rule_id = v_target_detection_id,
      updated_at = NOW()
    WHERE id = p_request_id;

    v_notification_type := 'promotion_approved_as_new';
    v_notification_title := 'Promoted as New Rule';
    v_notification_message := 'Your detection "' || v_detection.name || '" has been approved and added as a NEW rule in the Production Library.';

  ELSIF p_action = 'reject' THEN
    -- Update detection status
    UPDATE detections
    SET
      promotion_status = 'rejected',
      "updatedDate" = NOW()
    WHERE id = v_request.detection_id;

    -- Update request
    UPDATE promotion_requests
    SET
      status = 'rejected',
      reviewed_by = p_admin_id,
      reviewer_id = p_admin_id,
      reviewed_at = NOW(),
      review_notes = p_notes,
      updated_at = NOW()
    WHERE id = p_request_id;

    v_notification_type := 'promotion_rejected';
    v_notification_title := 'Promotion Request Rejected';
    v_notification_message := 'Your detection "' || v_detection.name || '" was not approved.' ||
      CASE WHEN p_notes IS NOT NULL AND p_notes != '' THEN ' Reason: ' || p_notes ELSE '' END;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Use approve, approve_as_new, or reject.');
  END IF;

  -- Create notification for submitter (using submitted_by column)
  INSERT INTO user_notifications (
    user_id,
    type,
    title,
    message,
    detection_id,
    is_read,
    created_at
  ) VALUES (
    v_request.submitted_by,
    v_notification_type,
    v_notification_title,
    v_notification_message,
    v_request.detection_id,
    false,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', p_action,
    'is_update', v_is_update,
    'production_id', v_target_detection_id
  );
END;
$function$;

-- Safely rolls back a bulk import by deleting all detections created by the import job
CREATE OR REPLACE FUNCTION public.rollback_bulk_import(p_job_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_job RECORD;
  v_deleted_count INTEGER;
  v_result JSONB;
BEGIN
  -- Get the job and verify ownership/permissions
  SELECT * INTO v_job
  FROM bulk_import_jobs
  WHERE id = p_job_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Import job not found'
    );
  END IF;

  -- Check if already reverted
  IF v_job.status = 'reverted' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Import has already been reverted'
    );
  END IF;

  -- Check if job was completed (only completed jobs can be rolled back)
  IF v_job.status NOT IN ('completed', 'failed') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only completed or failed imports can be rolled back'
    );
  END IF;

  -- Verify user has permission (owner of job or admin)
  IF v_job.user_id != p_user_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = p_user_id
      AND role IN ('owner', 'admin')
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Permission denied: you can only rollback your own imports'
      );
    END IF;
  END IF;

  -- Delete all detections created by this import
  DELETE FROM detections
  WHERE bulk_import_id = p_job_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Update the job status
  UPDATE bulk_import_jobs
  SET
    status = 'reverted',
    reverted_at = now(),
    reverted_by = p_user_id,
    updated_at = now()
  WHERE id = p_job_id;

  -- Build result
  v_result := jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'job_id', p_job_id,
    'reverted_at', now()
  );

  RETURN v_result;
END;
$function$;


-- ============================================================
-- MITRE ANALYTICS / SCORING
-- ============================================================

-- Get coverage summary across all MITRE techniques
CREATE OR REPLACE FUNCTION public.get_coverage_summary(p_platform text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_total_techniques int;
  v_covered_techniques int;
  v_total_detections bigint;
  v_production_detections bigint;
  v_by_tactic jsonb;
  v_top_covered jsonb;
  v_critical_gaps jsonb;
begin
  -- Overall counts
  select
    count(*),
    count(*) filter (where is_covered),
    sum(detection_count),
    sum(production_count)
  into v_total_techniques, v_covered_techniques, v_total_detections, v_production_detections
  from mv_coverage_stats
  where is_subtechnique = false;

  -- Coverage by tactic
  with tactic_stats as (
    select
      unnest(string_to_array(tactics, ', ')) as tactic,
      count(*) as total,
      count(*) filter (where is_covered) as covered
    from mv_coverage_stats
    where tactics is not null
    group by 1
  )
  select jsonb_agg(
    jsonb_build_object(
      'tactic', tactic,
      'total', total,
      'covered', covered,
      'percent', case when total > 0 then round((covered::numeric / total) * 100) else 0 end
    ) order by
      case tactic
        when 'reconnaissance' then 1
        when 'resource development' then 2
        when 'initial access' then 3
        when 'execution' then 4
        when 'persistence' then 5
        when 'privilege escalation' then 6
        when 'defense evasion' then 7
        when 'credential access' then 8
        when 'discovery' then 9
        when 'lateral movement' then 10
        when 'collection' then 11
        when 'command and control' then 12
        when 'exfiltration' then 13
        when 'impact' then 14
        else 15
      end
  )
  into v_by_tactic
  from tactic_stats;

  -- Top covered techniques
  select jsonb_agg(
    jsonb_build_object(
      'technique_id', technique_id,
      'name', technique_name,
      'detection_count', detection_count
    )
  )
  into v_top_covered
  from (
    select technique_id, technique_name, detection_count
    from mv_coverage_stats
    where detection_count > 0
    order by detection_count desc
    limit 5
  ) t;

  -- Critical gaps
  select jsonb_agg(
    jsonb_build_object(
      'technique_id', technique_id,
      'name', technique_name,
      'tactic', coalesce(split_part(tactics, ', ', 1), 'Unknown'),
      'priority', 'high'
    )
  )
  into v_critical_gaps
  from (
    select technique_id, technique_name, tactics
    from mv_coverage_stats
    where not is_covered
      and is_subtechnique = false
    order by technique_id
    limit 10
  ) t;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'total_techniques', coalesce(v_total_techniques, 0),
      'covered_techniques', coalesce(v_covered_techniques, 0),
      'coverage_percent', case when v_total_techniques > 0
        then round((v_covered_techniques::numeric / v_total_techniques) * 100)
        else 0 end,
      'total_detections', coalesce(v_total_detections, 0),
      'production_detections', coalesce(v_production_detections, 0)
    ),
    'by_tactic', coalesce(v_by_tactic, '[]'::jsonb),
    'top_covered', coalesce(v_top_covered, '[]'::jsonb),
    'critical_gaps', coalesce(v_critical_gaps, '[]'::jsonb)
  );
end;
$function$;

-- Calculate user defensive posture based on detection coverage
CREATE OR REPLACE FUNCTION public.get_defensive_posture(p_user_id uuid, p_scope text DEFAULT 'production')
 RETURNS TABLE(total_detections bigint, techniques_covered bigint, total_techniques bigint, technique_coverage_pct numeric, groups_defended bigint, total_groups bigint, group_coverage_pct numeric, campaigns_defended bigint, total_campaigns bigint, campaign_coverage_pct numeric, avg_taw_covered numeric, top_gaps jsonb)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
AS $function$
  WITH user_techniques AS MATERIALIZED (
    -- Get all unique MITRE technique IDs from user's detections
    SELECT DISTINCT unnest(d."mitreAttackIds") AS technique_id
    FROM detections d
    WHERE d."mitreAttackIds" IS NOT NULL
    AND array_length(d."mitreAttackIds", 1) > 0
    AND (
      CASE p_scope
        WHEN 'production' THEN d.library_type = 'production' AND d.user_id = p_user_id
        WHEN 'lab' THEN d.library_type = 'development'
        WHEN 'all' THEN (d.library_type = 'production' AND d.user_id = p_user_id) OR d.library_type = 'development'
        ELSE d.library_type = 'production' AND d.user_id = p_user_id
      END
    )
  ),
  covered_techniques AS MATERIALIZED (
    -- Map technique IDs to stix_ids
    SELECT DISTINCT ti.stix_id, ti.mitre_id, ti.name, ti.tis
    FROM user_techniques ut
    JOIN mv_technique_importance ti ON ti.mitre_id = ut.technique_id
  ),
  detection_count AS MATERIALIZED (
    SELECT COUNT(*) AS cnt
    FROM detections d
    WHERE d."mitreAttackIds" IS NOT NULL
    AND (
      CASE p_scope
        WHEN 'production' THEN d.library_type = 'production' AND d.user_id = p_user_id
        WHEN 'lab' THEN d.library_type = 'development'
        WHEN 'all' THEN (d.library_type = 'production' AND d.user_id = p_user_id) OR d.library_type = 'development'
        ELSE d.library_type = 'production' AND d.user_id = p_user_id
      END
    )
  ),
  snapshot AS MATERIALIZED (
    SELECT * FROM mitre_scoring_snapshot WHERE is_active = true LIMIT 1
  ),
  -- Groups defended: groups that use techniques we detect
  defended_groups AS MATERIALIZED (
    SELECT DISTINCT gt.group_stix_id, taw.taw
    FROM covered_techniques ct
    JOIN mitre_group_techniques gt ON gt.technique_stix_id = ct.stix_id
    JOIN mv_threat_actor_weights taw ON taw.stix_id = gt.group_stix_id
  ),
  -- Campaigns defended: campaigns that use techniques we detect
  defended_campaigns AS MATERIALIZED (
    SELECT DISTINCT ct_camp.campaign_stix_id
    FROM covered_techniques ct
    JOIN mitre_campaign_techniques ct_camp ON ct_camp.technique_stix_id = ct.stix_id
  ),
  -- Top gaps: high-TIS techniques without detection coverage
  technique_gaps AS MATERIALIZED (
    SELECT
      ti.mitre_id,
      ti.name,
      ti.tis,
      ti.group_count,
      -- Gap score: TIS * group_count for prioritization
      (ti.tis * COALESCE(ti.group_count, 0))::numeric AS gap_score
    FROM mv_technique_importance ti
    WHERE NOT EXISTS (
      SELECT 1 FROM covered_techniques ct WHERE ct.stix_id = ti.stix_id
    )
    AND ti.group_count > 0
    ORDER BY ti.tis DESC, ti.group_count DESC
    LIMIT 10
  )
  SELECT
    dc.cnt AS total_detections,
    (SELECT COUNT(*) FROM covered_techniques) AS techniques_covered,
    s.total_techniques::bigint AS total_techniques,
    CASE WHEN s.total_techniques > 0
      THEN ROUND((SELECT COUNT(*) FROM covered_techniques)::numeric / s.total_techniques * 100, 1)
      ELSE 0
    END AS technique_coverage_pct,
    (SELECT COUNT(*) FROM defended_groups) AS groups_defended,
    s.total_groups::bigint AS total_groups,
    CASE WHEN s.total_groups > 0
      THEN ROUND((SELECT COUNT(*) FROM defended_groups)::numeric / s.total_groups * 100, 1)
      ELSE 0
    END AS group_coverage_pct,
    (SELECT COUNT(*) FROM defended_campaigns) AS campaigns_defended,
    s.total_campaigns::bigint AS total_campaigns,
    CASE WHEN s.total_campaigns > 0
      THEN ROUND((SELECT COUNT(*) FROM defended_campaigns)::numeric / s.total_campaigns * 100, 1)
      ELSE 0
    END AS campaign_coverage_pct,
    COALESCE((SELECT ROUND(AVG(taw)::numeric, 3) FROM defended_groups), 0) AS avg_taw_covered,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'mitre_id', tg.mitre_id,
        'name', tg.name,
        'tis', ROUND(tg.tis::numeric, 3),
        'gap_score', ROUND(tg.gap_score, 2)
      ) ORDER BY tg.gap_score DESC)
      FROM technique_gaps tg),
      '[]'::jsonb
    ) AS top_gaps
  FROM detection_count dc
  CROSS JOIN snapshot s;
$function$;

-- Identify coverage gaps for a threat profile
CREATE OR REPLACE FUNCTION public.identify_coverage_gaps(p_profile text DEFAULT 'apt'::text, p_custom_techniques text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_techniques text[];
  v_result jsonb;
begin
  -- Define threat profiles
  v_techniques := case p_profile
    when 'ransomware' then array['T1486', 'T1490', 'T1027', 'T1547.001', 'T1059.001', 'T1059.003', 'T1082', 'T1083', 'T1105', 'T1112', 'T1489', 'T1562.001']
    when 'apt' then array['T1003.001', 'T1003.002', 'T1021.001', 'T1021.002', 'T1055', 'T1087', 'T1018', 'T1057', 'T1016', 'T1049', 'T1071.001', 'T1105']
    when 'initial_access' then array['T1566.001', 'T1566.002', 'T1190', 'T1133', 'T1078', 'T1189', 'T1195.002', 'T1199']
    when 'persistence' then array['T1547.001', 'T1543.003', 'T1053.005', 'T1136.001', 'T1546.003', 'T1574.001', 'T1574.002', 'T1505.003']
    when 'credential_access' then array['T1003.001', 'T1003.002', 'T1003.003', 'T1003.006', 'T1555', 'T1552.001', 'T1558.003', 'T1110.001', 'T1110.003']
    when 'defense_evasion' then array['T1027', 'T1070.001', 'T1055', 'T1218.011', 'T1036.005', 'T1562.001', 'T1112', 'T1140']
    when 'lateral_movement' then array['T1021.001', 'T1021.002', 'T1021.003', 'T1021.006', 'T1080', 'T1534', 'T1570']
    when 'exfiltration' then array['T1048.001', 'T1048.002', 'T1041', 'T1567.002', 'T1020', 'T1030']
    when 'impact' then array['T1486', 'T1490', 'T1489', 'T1485', 'T1491.001', 'T1529', 'T1561.002']
    when 'custom' then coalesce(p_custom_techniques, array[]::text[])
    else array['T1059.001', 'T1003.001', 'T1547.001', 'T1055', 'T1021.002']
  end;

  -- Analyze coverage
  with profile_analysis as (
    select
      t.technique_id,
      mo.name as technique_name,
      coalesce(cs.detection_count, 0) as detection_count,
      coalesce(cs.is_covered, false) as is_covered,
      cs.tactics
    from unnest(v_techniques) as t(technique_id)
    left join mitre_objects mo on mo.mitre_id = t.technique_id and mo.type = 'attack-pattern'
    left join mv_coverage_stats cs on cs.technique_id = t.technique_id
  )
  select jsonb_build_object(
    'profile', p_profile,
    'profile_techniques', array_length(v_techniques, 1),
    'covered', count(*) filter (where is_covered),
    'coverage_percent', case when count(*) > 0
      then round((count(*) filter (where is_covered)::numeric / count(*)) * 100)
      else 0 end,
    'critical_gaps', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'technique_id', technique_id,
          'name', coalesce(technique_name, technique_id),
          'tactic', coalesce(split_part(tactics, ', ', 1), 'Unknown'),
          'priority', 'high',
          'reason', 'Key technique in ' || p_profile || ' attack chain'
        )
      ), '[]'::jsonb)
      from profile_analysis
      where not is_covered
    ),
    'quick_wins', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'technique_id', technique_id,
          'name', coalesce(technique_name, technique_id),
          'reason', 'Already have ' || detection_count || ' detection(s), add more for depth'
        )
      ), '[]'::jsonb)
      from (
        select * from profile_analysis
        where is_covered and detection_count < 3
        order by detection_count
        limit 3
      ) t
    ),
    'recommendation', case
      when count(*) filter (where is_covered)::float / nullif(count(*), 0) < 0.3
        then 'Critical: Very low coverage for ' || p_profile || ' threats. Prioritize detection development.'
      when count(*) filter (where is_covered)::float / nullif(count(*), 0) < 0.6
        then 'Moderate: Partial coverage for ' || p_profile || ' threats. Focus on the identified gaps.'
      else 'Good: Reasonable coverage for ' || p_profile || ' threats. Consider depth improvements.'
    end
  )
  into v_result
  from profile_analysis;

  return v_result;
end;
$function$;

-- Get techniques used by a MITRE group
CREATE OR REPLACE FUNCTION public.get_group_techniques(group_stix_id text)
 RETURNS TABLE(stix_id text, mitre_id text, name text, description text, relationship_description text, tactics json, platforms json, is_subtechnique boolean, data jsonb)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    v.stix_id,
    v.mitre_id,
    v.name,
    v.description,
    mr.description as relationship_description,
    v.tactics,
    v.platforms,
    COALESCE((v.data->>'x_mitre_is_subtechnique')::boolean, false) as is_subtechnique,
    v.data
  FROM mitre_relationships mr
  JOIN v_mitre_techniques_full v ON v.stix_id = mr.target_ref
  WHERE mr.source_ref = group_stix_id
    AND mr.relationship_type = 'uses'
    AND v.deprecated = FALSE
  ORDER BY v.mitre_id;
END;
$function$;

-- Get parent and sub-technique relationships
CREATE OR REPLACE FUNCTION public.get_technique_hierarchy(technique_stix_id text)
 RETURNS TABLE(parent_stix_id text, parent_mitre_id text, parent_name text, subtechnique_stix_id text, subtechnique_mitre_id text, subtechnique_name text)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  -- Get parent if this is a sub-technique
  SELECT
    p.stix_id as parent_stix_id,
    p.mitre_id as parent_mitre_id,
    p.name as parent_name,
    t.stix_id as subtechnique_stix_id,
    t.mitre_id as subtechnique_mitre_id,
    t.name as subtechnique_name
  FROM mitre_relationships r
  JOIN mitre_objects p ON r.target_ref = p.stix_id
  JOIN mitre_objects t ON r.source_ref = t.stix_id
  WHERE r.source_ref = technique_stix_id
    AND r.relationship_type = 'subtechnique-of'

  UNION ALL

  -- Get sub-techniques if this is a parent
  SELECT
    p.stix_id as parent_stix_id,
    p.mitre_id as parent_mitre_id,
    p.name as parent_name,
    s.stix_id as subtechnique_stix_id,
    s.mitre_id as subtechnique_mitre_id,
    s.name as subtechnique_name
  FROM mitre_relationships r
  JOIN mitre_objects p ON r.target_ref = p.stix_id
  JOIN mitre_objects s ON r.source_ref = s.stix_id
  WHERE r.target_ref = technique_stix_id
    AND r.relationship_type = 'subtechnique-of';
END;
$function$;

-- Get all mitigations for a specific technique
CREATE OR REPLACE FUNCTION public.get_technique_mitigations(technique_stix_id text)
 RETURNS TABLE(stix_id text, mitre_id text, name text, description text, relationship_description text)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    m.stix_id,
    m.mitre_id,
    m.name,
    m.description,
    r.description as relationship_description
  FROM mitre_relationships r
  JOIN mitre_objects m ON r.source_ref = m.stix_id
  WHERE r.target_ref = technique_stix_id
    AND r.relationship_type = 'mitigates'
    AND m.type = 'course-of-action'
    AND NOT m.deprecated
    AND NOT m.revoked;
END;
$function$;

-- Get detection strategies for a technique by stix_id
CREATE OR REPLACE FUNCTION public.get_technique_detection_strategies(p_technique_stix_id text)
 RETURNS TABLE(stix_id text, mitre_id text, name text, description text, analytic_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        ds.stix_id,
        ds.mitre_id,
        ds.name,
        ds.description,
        COALESCE(jsonb_array_length(ds.data->'x_mitre_analytic_refs'), 0)::INT as analytic_count
    FROM mitre_objects ds
    JOIN mitre_relationships r ON r.source_ref = ds.stix_id
    WHERE r.target_ref = p_technique_stix_id
    AND r.relationship_type = 'detects'
    AND ds.type = 'x-mitre-detection-strategy'
    AND ds.deprecated = false
    AND ds.revoked = false;
END;
$function$;

-- Get detection strategies for a technique by mitre_id
CREATE OR REPLACE FUNCTION public.get_technique_strategies_by_mitre_id(p_technique_mitre_id text)
 RETURNS TABLE(strategy_stix_id text, strategy_mitre_id text, strategy_name text, strategy_description text, analytic_count integer, technique_stix_id text, technique_mitre_id text, technique_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        ds.stix_id as strategy_stix_id,
        ds.mitre_id as strategy_mitre_id,
        ds.name as strategy_name,
        ds.description as strategy_description,
        COALESCE(jsonb_array_length(ds.data->'x_mitre_analytic_refs'), 0)::INT as analytic_count,
        t.stix_id as technique_stix_id,
        t.mitre_id as technique_mitre_id,
        t.name as technique_name
    FROM mitre_objects t
    JOIN mitre_relationships r ON r.target_ref = t.stix_id AND r.relationship_type = 'detects'
    JOIN mitre_objects ds ON ds.stix_id = r.source_ref AND ds.type = 'x-mitre-detection-strategy'
    WHERE t.mitre_id = p_technique_mitre_id
    AND t.type = 'attack-pattern'
    AND ds.deprecated = false;
END;
$function$;

-- Get analytics for a detection strategy
CREATE OR REPLACE FUNCTION public.get_strategy_analytics(p_strategy_stix_id text)
 RETURNS TABLE(stix_id text, mitre_id text, name text, description text, platforms jsonb, log_source_references jsonb, mutable_elements jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        a.stix_id,
        a.mitre_id,
        a.name,
        a.description,
        a.data->'x_mitre_platforms' as platforms,
        a.data->'x_mitre_log_source_references' as log_source_references,
        a.data->'x_mitre_mutable_elements' as mutable_elements
    FROM mitre_objects ds
    CROSS JOIN LATERAL jsonb_array_elements_text(ds.data->'x_mitre_analytic_refs') as ref
    JOIN mitre_objects a ON a.stix_id = ref
    WHERE ds.stix_id = p_strategy_stix_id
    AND ds.type = 'x-mitre-detection-strategy'
    AND a.type = 'x-mitre-analytic'
    AND a.deprecated = false;
END;
$function$;

-- Get techniques mitigated by a specific mitigation
CREATE OR REPLACE FUNCTION public.get_mitigation_techniques(p_mitigation_stix_id text)
 RETURNS TABLE(stix_id text, mitre_id text, name text, description text, relationship_description text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        t.stix_id,
        t.mitre_id,
        t.name,
        t.description,
        r.description as relationship_description
    FROM mitre_objects t
    JOIN mitre_relationships r ON r.target_ref = t.stix_id
    WHERE r.source_ref = p_mitigation_stix_id
    AND r.relationship_type = 'mitigates'
    AND t.type = 'attack-pattern'
    AND t.deprecated = false
    AND t.revoked = false;
END;
$function$;

-- Returns detailed impact breakdown for a mitigation using pre-computed data
CREATE OR REPLACE FUNCTION public.get_mitigation_impact_detail(p_mitigation_stix_id text)
 RETURNS TABLE(mitigation_stix_id text, mitigation_mitre_id text, mitigation_name text, impact_score integer, technique_count integer, total_groups_disrupted integer, total_campaigns_disrupted integer, top_groups jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  WITH mit AS (
    SELECT * FROM mv_mitigation_impact WHERE stix_id = p_mitigation_stix_id
  ),
  technique_list AS (
    SELECT DISTINCT r.target_ref AS technique_stix_id
    FROM mitre_relationships r
    WHERE r.source_ref = p_mitigation_stix_id
    AND r.relationship_type = 'mitigates'
  ),
  disrupted_groups AS (
    SELECT
      taw.stix_id,
      taw.mitre_id,
      taw.name,
      taw.taw,
      COUNT(DISTINCT gt.technique_stix_id) AS techniques_blocked
    FROM technique_list tl
    JOIN mitre_group_techniques gt ON gt.technique_stix_id = tl.technique_stix_id
    JOIN mv_threat_actor_weights taw ON taw.stix_id = gt.group_stix_id
    GROUP BY taw.stix_id, taw.mitre_id, taw.name, taw.taw
    ORDER BY taw.taw DESC
    LIMIT 15
  ),
  campaign_count AS (
    SELECT COUNT(DISTINCT ct.campaign_stix_id) AS cnt
    FROM technique_list tl
    JOIN mitre_campaign_techniques ct ON ct.technique_stix_id = tl.technique_stix_id
  )
  SELECT
    mit.stix_id,
    mit.mitre_id,
    mit.name,
    mit.impact_score,
    mit.technique_count::int,
    mit.groups_disrupted::int,
    COALESCE(cc.cnt, 0)::int,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'stix_id', dg.stix_id,
        'mitre_id', dg.mitre_id,
        'name', dg.name,
        'taw', ROUND(dg.taw::numeric, 3),
        'techniques_blocked', dg.techniques_blocked
      ) ORDER BY dg.taw DESC)
      FROM disrupted_groups dg),
      '[]'::jsonb
    )
  FROM mit
  CROSS JOIN campaign_count cc;
$function$;

-- Returns detailed impact breakdown for a strategy using pre-computed data
CREATE OR REPLACE FUNCTION public.get_strategy_impact_detail(p_strategy_stix_id text)
 RETURNS TABLE(strategy_stix_id text, strategy_mitre_id text, strategy_name text, technique_id text, technique_name text, impact_score integer, analytic_count integer, total_groups_detected integer, total_campaigns_detected integer, top_groups jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  WITH strat AS (
    SELECT * FROM mv_strategy_impact WHERE stix_id = p_strategy_stix_id
  ),
  detected_groups AS (
    SELECT
      taw.stix_id,
      taw.mitre_id,
      taw.name,
      taw.taw
    FROM strat s
    JOIN mitre_group_techniques gt ON gt.technique_stix_id = s.technique_stix_id
    JOIN mv_threat_actor_weights taw ON taw.stix_id = gt.group_stix_id
    ORDER BY taw.taw DESC
    LIMIT 15
  ),
  campaign_count AS (
    SELECT COUNT(DISTINCT ct.campaign_stix_id) AS cnt
    FROM strat s
    JOIN mitre_campaign_techniques ct ON ct.technique_stix_id = s.technique_stix_id
  )
  SELECT
    s.stix_id,
    s.mitre_id,
    s.name,
    s.technique_id,
    s.technique_name,
    s.impact_score,
    s.analytic_count::int,
    s.groups_detected::int,
    COALESCE(cc.cnt, 0)::int,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'stix_id', dg.stix_id,
        'mitre_id', dg.mitre_id,
        'name', dg.name,
        'taw', ROUND(dg.taw::numeric, 3)
      ) ORDER BY dg.taw DESC)
      FROM detected_groups dg),
      '[]'::jsonb
    )
  FROM strat s
  CROSS JOIN campaign_count cc;
$function$;

-- Returns top N mitigations by impact score
CREATE OR REPLACE FUNCTION public.get_top_impact_mitigations(p_limit integer DEFAULT 20)
 RETURNS TABLE(stix_id text, mitre_id text, name text, description text, technique_count integer, impact_score numeric)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT
    stix_id,
    mitre_id,
    name,
    description,
    technique_count::int,
    impact_score
  FROM v_mitigation_impact
  ORDER BY impact_score DESC
  LIMIT p_limit;
$function$;

-- Returns top N detection strategies by impact score
CREATE OR REPLACE FUNCTION public.get_top_impact_strategies(p_limit integer DEFAULT 20)
 RETURNS TABLE(stix_id text, mitre_id text, name text, technique_id text, technique_name text, analytic_count integer, impact_score numeric)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT
    stix_id,
    mitre_id,
    name,
    technique_id,
    technique_name,
    analytic_count::int,
    impact_score
  FROM v_strategy_impact
  ORDER BY impact_score DESC
  LIMIT p_limit;
$function$;

-- Captures current MITRE data totals for stable impact scoring
CREATE OR REPLACE FUNCTION public.populate_scoring_snapshot(p_mitre_version text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_snapshot_id uuid;
BEGIN
  -- Deactivate previous snapshots
  UPDATE mitre_scoring_snapshot SET is_active = false WHERE is_active = true;

  -- Insert new snapshot
  INSERT INTO mitre_scoring_snapshot (
    mitre_version,
    total_groups,
    total_techniques,
    total_campaigns,
    total_software,
    total_mitigations,
    total_strategies,
    max_group_technique_count,
    max_group_campaign_count,
    max_group_software_count,
    max_technique_group_count,
    max_technique_campaign_count
  )
  SELECT
    COALESCE(p_mitre_version, 'unknown'),
    (SELECT COUNT(*) FROM mitre_groups WHERE NOT deprecated),
    (SELECT COUNT(*) FROM mitre_techniques WHERE NOT deprecated),
    (SELECT COUNT(*) FROM mitre_campaigns),
    (SELECT COUNT(*) FROM mitre_software WHERE NOT deprecated),
    (SELECT COUNT(*) FROM mitre_mitigations WHERE NOT deprecated),
    (SELECT COUNT(*) FROM v_mitre_detection_strategies),
    (SELECT COALESCE(MAX(cnt), 1) FROM (SELECT COUNT(*) as cnt FROM mitre_group_techniques GROUP BY group_stix_id) t),
    (SELECT COALESCE(MAX(cnt), 1) FROM (SELECT COUNT(*) as cnt FROM mitre_group_campaigns GROUP BY group_stix_id) t),
    (SELECT COALESCE(MAX(cnt), 1) FROM (SELECT COUNT(*) as cnt FROM mitre_group_software GROUP BY group_stix_id) t),
    (SELECT COALESCE(MAX(cnt), 1) FROM (SELECT COUNT(*) as cnt FROM mitre_group_techniques GROUP BY technique_stix_id) t),
    (SELECT COALESCE(MAX(cnt), 1) FROM (SELECT COUNT(*) as cnt FROM mitre_campaign_techniques GROUP BY technique_stix_id) t)
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$function$;

-- Refresh coverage stats materialized view
CREATE OR REPLACE FUNCTION public.refresh_coverage_stats()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  refresh materialized view concurrently mv_coverage_stats;
end;
$function$;

-- Refresh all impact materialized views
CREATE OR REPLACE FUNCTION public.refresh_impact_materialized_views()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_threat_actor_weights;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_technique_importance;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_mitigation_impact;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_strategy_impact;
END;
$function$;

-- Get threat actor coverage analysis
CREATE OR REPLACE FUNCTION public.get_threat_actor_coverage(p_actor_stix_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_actor jsonb;
  v_techniques jsonb;
  v_covered_techniques jsonb;
  v_gaps jsonb;
  v_total int;
  v_covered int;
begin
  -- Get actor info
  select jsonb_build_object(
    'name', name,
    'mitreId', mitre_id,
    'stixId', stix_id,
    'aliases', coalesce(data->'aliases', '[]'::jsonb),
    'description', coalesce(data->>'description', ''),
    'originCountry', coalesce(data->'targeting_intel'->>'origin_country', null),
    'targetSectors', coalesce(data->'targeting_intel'->'target_sectors', '[]'::jsonb)
  )
  into v_actor
  from mitre_objects
  where stix_id = p_actor_stix_id;

  if v_actor is null then
    return jsonb_build_object('error', 'Threat actor not found');
  end if;

  -- Get techniques used by this actor and coverage info
  with actor_techniques as (
    select distinct
      mo.mitre_id,
      mo.name,
      mo.stix_id
    from mitre_relationships mr
    join mitre_objects mo on mr.target_ref = mo.stix_id
    where mr.source_ref = p_actor_stix_id
      and mr.relationship_type = 'uses'
      and mo.type = 'attack-pattern'
  ),
  detection_coverage as (
    select
      at.mitre_id,
      at.name,
      count(d.id) as detection_count,
      array_agg(distinct d.name) filter (where d.name is not null) as detection_names
    from actor_techniques at
    left join detections d on at.mitre_id = any(d."mitreAttackIds")
    group by at.mitre_id, at.name
  )
  select
    count(*),
    count(*) filter (where detection_count > 0),
    jsonb_agg(
      jsonb_build_object(
        'id', mitre_id,
        'name', name,
        'detectionCount', detection_count
      ) order by detection_count desc
    ) filter (where detection_count > 0),
    jsonb_agg(
      jsonb_build_object(
        'id', mitre_id,
        'name', name,
        'reason', 'Uncovered technique used by ' || (v_actor->>'name')
      ) order by mitre_id
    ) filter (where detection_count = 0)
  into v_total, v_covered, v_covered_techniques, v_gaps
  from detection_coverage;

  return jsonb_build_object(
    'actor', v_actor,
    'coverage', jsonb_build_object(
      'total', coalesce(v_total, 0),
      'covered', coalesce(v_covered, 0),
      'percent', case when v_total > 0
        then round((v_covered::numeric / v_total) * 100)
        else 0 end
    ),
    'coveredTechniques', coalesce(v_covered_techniques, '[]'::jsonb),
    'gaps', coalesce(v_gaps, '[]'::jsonb)
  );
end;
$function$;

-- Search for a threat actor by name, mitre_id, aliases, or vendor names
CREATE OR REPLACE FUNCTION public.find_threat_actor(p_query text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_matches jsonb;
  v_query_lower text := lower(p_query);
begin
  -- Search by name, mitre_id, aliases, or vendor names
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'stix_id', stix_id,
      'mitre_id', mitre_id,
      'name', name,
      'aliases', coalesce(data->'aliases', '[]'::jsonb),
      'origin_country', coalesce(data->'targeting_intel'->>'origin_country', null),
      'target_sectors', coalesce(data->'targeting_intel'->'target_sectors', '[]'::jsonb)
    ) order by
      case
        when lower(name) = v_query_lower then 1
        when lower(mitre_id) = v_query_lower then 2
        when lower(name) like v_query_lower || '%' then 3
        else 4
      end,
      name
  ), '[]'::jsonb)
  into v_matches
  from mitre_objects
  where type = 'intrusion-set'
    and (
      lower(name) like '%' || v_query_lower || '%'
      or lower(mitre_id) = v_query_lower
      or exists (
        select 1
        from jsonb_array_elements_text(data->'aliases') as alias
        where lower(alias) like '%' || v_query_lower || '%'
      )
      or exists (
        select 1
        from jsonb_each_text(data->'targeting_intel'->'vendor_names') as vn(key, value)
        where lower(vn.value) like '%' || v_query_lower || '%'
      )
    )
  limit 10;

  return jsonb_build_object(
    'found', jsonb_array_length(v_matches) > 0,
    'matches', v_matches,
    'query', p_query
  );
end;
$function$;

-- Updates the targeting_intel key in a MITRE object data column
CREATE OR REPLACE FUNCTION public.update_targeting_intel(p_stix_id text, p_targeting_intel jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE mitre_objects
  SET
    data = COALESCE(data, '{}'::jsonb) || jsonb_build_object('targeting_intel', p_targeting_intel),
    updated_at = NOW()
  WHERE stix_id = p_stix_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MITRE object not found: %', p_stix_id;
  END IF;
END;
$function$;

-- Removes the targeting_intel key from a MITRE object data column
CREATE OR REPLACE FUNCTION public.remove_targeting_intel(p_stix_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE mitre_objects
  SET
    data = data - 'targeting_intel',
    updated_at = NOW()
  WHERE stix_id = p_stix_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MITRE object not found: %', p_stix_id;
  END IF;
END;
$function$;


-- ============================================================
-- SEARCH / VECTOR / FTS
-- ============================================================

-- Generate full-text search vector for a detection
CREATE OR REPLACE FUNCTION public.generate_detection_fts_vector(p_name text, p_description text, p_detection_query text, p_mitre_ids text[], p_tags text[], p_query_explanation text)
 RETURNS tsvector
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
begin
  return
    setweight(to_tsvector('english', coalesce(p_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(p_description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(p_detection_query, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(p_mitre_ids, ' '), '')), 'A') ||
    setweight(to_tsvector('english', coalesce(array_to_string(p_tags, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(p_query_explanation, '')), 'C');
end;
$function$;

-- Trigger function: auto-update FTS vector on detection insert/update
CREATE OR REPLACE FUNCTION public.update_detection_fts_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.fts_vector := generate_detection_fts_vector(
    new.name,
    new.description,
    new."detectionQuery",
    new."mitreAttackIds",
    new.tags,
    new."queryExplanation"
  );
  return new;
end;
$function$;

-- Find semantically similar detections using pgvector cosine similarity
CREATE OR REPLACE FUNCTION public.find_similar_detections(p_detection_id text, p_match_threshold double precision DEFAULT 0.3, p_match_count integer DEFAULT 10, p_exclude_self boolean DEFAULT true)
 RETURNS TABLE(detection_id text, name text, description text, status text, severity text, query_language text, similarity double precision, mitre_attack_ids text[], source text, library_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_embedding vector(1536);
  v_caller_id UUID;
BEGIN
  -- Get the calling user's ID from the JWT
  v_caller_id := auth.uid();

  -- Look up the embedding for the given detection
  SELECT de.embedding INTO v_embedding
  FROM detection_embeddings de
  JOIN detections d ON d.id = de.detection_id
  WHERE de.detection_id = p_detection_id
    AND (d.user_id = v_caller_id OR d.library_type = 'production');

  -- If no embedding found (or unauthorized), return empty
  IF v_embedding IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    d.id AS detection_id,
    d.name,
    d.description,
    d.status,
    d.severity,
    d."queryLanguage" AS query_language,
    1 - (de.embedding <=> v_embedding) AS similarity,
    d."mitreAttackIds" AS mitre_attack_ids,
    d.source,
    d.library_type
  FROM detection_embeddings de
  JOIN detections d ON d.id = de.detection_id
  WHERE
    (NOT p_exclude_self OR de.detection_id != p_detection_id)
    AND 1 - (de.embedding <=> v_embedding) > p_match_threshold
    AND (d.user_id = v_caller_id OR d.library_type = 'production')
  ORDER BY de.embedding <=> v_embedding ASC
  LIMIT p_match_count;
END;
$function$;

-- Search detections by embedding vector
CREATE OR REPLACE FUNCTION public.search_detections_by_embedding(query_embedding vector, match_threshold double precision DEFAULT 0.5, match_count integer DEFAULT 25)
 RETURNS TABLE(detection_id text, name text, description text, mitre_attack_ids text[], status text, severity text, similarity double precision)
 LANGUAGE plpgsql
AS $function$
begin
  return query
  select
    de.detection_id,
    d.name,
    d.description,
    d."mitreAttackIds" as mitre_attack_ids,
    d.status,
    d.severity,
    (1 - (de.embedding <=> query_embedding))::float as similarity
  from detection_embeddings de
  join detections d on d.id = de.detection_id
  where 1 - (de.embedding <=> query_embedding) > match_threshold
  order by de.embedding <=> query_embedding
  limit match_count;
end;
$function$;

-- Hybrid search combining semantic (vector) and keyword (FTS) results.
-- Defaults retuned 2026-05-20 from 0.7/0.3 → 0.5/0.5; see migration
-- 20260520120000_threat_research_library_match_tuning.sql for audit.
CREATE OR REPLACE FUNCTION public.hybrid_search_detections(p_query text, p_query_embedding vector, p_semantic_weight double precision DEFAULT 0.5, p_keyword_weight double precision DEFAULT 0.5, p_limit integer DEFAULT 25, p_status text DEFAULT NULL::text, p_severity text DEFAULT NULL::text)
 RETURNS TABLE(detection_id text, name text, description text, mitre_ids text[], status text, severity text, semantic_score double precision, keyword_score double precision, combined_score double precision)
 LANGUAGE plpgsql
AS $function$
begin
  return query
  with semantic_results as (
    select
      de.detection_id as det_id,
      (1 - (de.embedding <=> p_query_embedding))::float as score
    from detection_embeddings de
    where 1 - (de.embedding <=> p_query_embedding) > 0.4
    order by de.embedding <=> p_query_embedding
    limit p_limit * 3
  ),
  keyword_results as (
    select
      d.id as det_id,
      ts_rank_cd(d.fts_vector, websearch_to_tsquery('english', p_query), 32)::float as score
    from detections d
    where d.fts_vector @@ websearch_to_tsquery('english', p_query)
    order by score desc
    limit p_limit * 3
  ),
  combined as (
    select
      coalesce(sr.det_id, kr.det_id) as det_id,
      coalesce(sr.score, 0.0)::float as sem_score,
      coalesce(kr.score, 0.0)::float as kw_score,
      ((coalesce(sr.score, 0.0) * p_semantic_weight) +
       (coalesce(kr.score, 0.0) * p_keyword_weight))::float as total_score
    from semantic_results sr
    full outer join keyword_results kr on sr.det_id = kr.det_id
  )
  select
    c.det_id as detection_id,
    d.name,
    d.description,
    d."mitreAttackIds" as mitre_ids,
    d.status,
    d.severity,
    c.sem_score as semantic_score,
    c.kw_score as keyword_score,
    c.total_score as combined_score
  from combined c
  join detections d on c.det_id = d.id
  where
    (p_status is null or d.status = p_status)
    and (p_severity is null or d.severity = p_severity)
  order by c.total_score desc
  limit p_limit;
end;
$function$;


-- Workspace functions removed (feature deprecated)


-- ============================================================
-- UTILITY / TRIGGER FUNCTIONS
-- ============================================================

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- updated_at trigger for bulk_import_jobs
CREATE OR REPLACE FUNCTION public.update_bulk_import_jobs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- updated_at trigger for user_dashboards
CREATE OR REPLACE FUNCTION public.update_user_dashboards_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- updated_at trigger for integrations
CREATE OR REPLACE FUNCTION public.update_integrations_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- updated_at trigger for scoring_profiles
CREATE OR REPLACE FUNCTION public.update_scoring_profiles_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- updated_at trigger for environment_profiles
CREATE OR REPLACE FUNCTION public.update_environment_profiles_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
$function$;

-- Enforce only one default dashboard per user
CREATE OR REPLACE FUNCTION public.enforce_single_default_dashboard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE user_dashboards
    SET is_default = false
    WHERE user_id = NEW.user_id AND id != NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$function$;

-- Get unread notification count for a user
CREATE OR REPLACE FUNCTION public.get_unread_notification_count(p_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COUNT(*)::INTEGER FROM user_notifications WHERE user_id = p_user_id AND is_read = false;
$function$;

-- Mark notifications as read (all or specific IDs)
CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_user_id uuid, p_notification_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE v_count INTEGER;
BEGIN
  IF p_notification_ids IS NULL THEN
    UPDATE user_notifications SET is_read = true, read_at = now()
    WHERE user_id = p_user_id AND is_read = false;
  ELSE
    UPDATE user_notifications SET is_read = true, read_at = now()
    WHERE user_id = p_user_id AND id = ANY(p_notification_ids) AND is_read = false;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- updated_at trigger for detection_drift
CREATE OR REPLACE FUNCTION public.update_detection_drift_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
