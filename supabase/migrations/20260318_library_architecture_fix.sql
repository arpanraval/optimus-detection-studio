-- ============================================================
-- 20260318_library_architecture_fix.sql
-- Fix library architecture: user=Production, universal=Lab
--
-- The semantic flip (user=Production, universal=Lab) was only applied
-- to labels. This migration fixes all behavioral logic in SQL.
-- ============================================================

-- ============================================================
-- FIX 1: RLS — Production Library ('user') needs team read access
-- Currently library_type='user' detections are only visible to the owner.
-- Production Library needs to be visible to ALL authenticated team members.
-- ============================================================

CREATE POLICY "Production library readable by authenticated users" ON public.detections
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (library_type = 'user');


-- ============================================================
-- FIX 2: submit_for_publish() must allow FROM Lab ('universal')
-- Both text and uuid variants need to check library_type = 'universal'
-- ============================================================

-- Text ID variant
CREATE OR REPLACE FUNCTION public.submit_for_publish(p_detection_id text, p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_detection RECORD;
  v_request_id UUID;
  v_target_rule_id TEXT;
BEGIN
  -- Get the detection — must be in Lab (universal) and owned by user
  SELECT * INTO v_detection
  FROM detections
  WHERE id = p_detection_id
    AND library_type = 'universal'
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Detection not found or not owned by user');
  END IF;

  IF v_detection.publish_status = 'pending' THEN
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

  INSERT INTO publish_requests (detection_id, target_rule_id, submitted_by, status)
  VALUES (p_detection_id, v_target_rule_id, p_user_id, 'pending')
  RETURNING id INTO v_request_id;

  UPDATE detections
  SET publish_status = 'pending', "updatedDate" = now()
  WHERE id = p_detection_id;

  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'target_action', CASE WHEN v_target_rule_id IS NULL THEN 'create_new' ELSE 'update_existing' END,
    'target_rule_id', v_target_rule_id
  );
END;
$function$;

-- UUID ID variant
CREATE OR REPLACE FUNCTION public.submit_for_publish(p_detection_id uuid, p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_detection RECORD;
  v_request_id UUID;
  v_target_rule_id TEXT;
BEGIN
  -- Get the detection — must be in Lab (universal) and owned by user
  SELECT * INTO v_detection
  FROM detections
  WHERE id = p_detection_id
    AND library_type = 'universal'
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Detection not found or not owned by user');
  END IF;

  IF v_detection.publish_status = 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'Already pending approval');
  END IF;

  -- Block re-submission of published detections that haven't been modified
  IF v_detection.publish_status = 'published'
     AND v_detection.published_at IS NOT NULL
     AND v_detection."updatedDate" <= v_detection.published_at THEN
    RETURN json_build_object('success', false, 'error', 'Already published and unchanged since last publish');
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

  INSERT INTO publish_requests (detection_id, target_rule_id, submitted_by, status)
  VALUES (p_detection_id, v_target_rule_id, p_user_id, 'pending')
  RETURNING id INTO v_request_id;

  UPDATE detections
  SET publish_status = 'pending', "updatedDate" = now()
  WHERE id = p_detection_id;

  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'target_action', CASE WHEN v_target_rule_id IS NULL THEN 'create_new' ELSE 'update_existing' END,
    'target_rule_id', v_target_rule_id
  );
END;
$function$;


-- ============================================================
-- FIX 3: approve_publish_request() must create IN Production ('user')
-- When creating new rules, set library_type='user' and user_id=submitter
-- When checking for existing target rules, check library_type='user'
-- ============================================================

CREATE OR REPLACE FUNCTION public.approve_publish_request(p_request_id uuid, p_admin_id uuid, p_action text, p_notes text DEFAULT NULL::text)
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
  -- Verify admin role
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin_id AND role IN ('owner', 'admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;

  -- Get request
  SELECT * INTO v_request FROM publish_requests WHERE id = p_request_id;

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
    -- Determine if this is an update or new publish

    IF v_detection.published_to_id IS NOT NULL THEN
      v_target_detection_id := v_detection.published_to_id;
      v_is_update := true;

      -- Check target exists in Production Library (library_type='user')
      IF NOT EXISTS (SELECT 1 FROM detections WHERE id = v_target_detection_id AND library_type = 'user') THEN
        v_target_detection_id := gen_random_uuid()::text;
        v_is_update := false;
      END IF;

    ELSIF v_detection.source_rule_id IS NOT NULL THEN
      v_target_detection_id := v_detection.source_rule_id;
      v_is_update := true;

      -- Check target exists in Production Library (library_type='user')
      IF NOT EXISTS (SELECT 1 FROM detections WHERE id = v_target_detection_id AND library_type = 'user') THEN
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

      -- UPDATE existing Production rule
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
        maturity = v_detection.maturity,
        confidence = v_detection.confidence,
        "updatedDate" = NOW(),
        version = v_current_version + 1
      WHERE id = v_target_detection_id;

      v_notification_message := 'Your update to "' || v_detection.name || '" has been approved and the Production Library rule has been updated.';
    ELSE
      -- CREATE new Production Library rule (library_type='user')
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
        "references", tags, maturity, confidence,
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
        v_detection.maturity,
        v_detection.confidence,
        'user',
        'community',
        v_request.submitted_by
      );

      v_notification_message := 'Your detection "' || v_detection.name || '" has been approved and promoted to the Production Library.';
    END IF;

    -- Update original Lab detection to link to Production
    UPDATE detections
    SET
      publish_status = 'published',
      published_to_id = v_target_detection_id,
      published_at = NOW(),
      "updatedDate" = NOW()
    WHERE id = v_request.detection_id;

    -- Update request
    UPDATE publish_requests
    SET
      status = 'approved',
      reviewed_by = p_admin_id,
      reviewer_id = p_admin_id,
      reviewed_at = NOW(),
      review_notes = p_notes,
      result_rule_id = v_target_detection_id,
      updated_at = NOW()
    WHERE id = p_request_id;

    v_notification_type := 'publish_approved';
    v_notification_title := CASE WHEN v_is_update THEN 'Production Update Approved' ELSE 'Promoted to Production' END;

  ELSIF p_action = 'approve_as_new' THEN
    v_target_detection_id := gen_random_uuid()::text;

    -- CREATE new Production Library rule (library_type='user')
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
      "references", tags, maturity, confidence,
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
      v_detection.maturity,
      v_detection.confidence,
      'user',
      'community',
      v_request.submitted_by
    );

    -- Update original detection
    UPDATE detections
    SET
      publish_status = 'published',
      published_to_id = v_target_detection_id,
      published_at = NOW(),
      "updatedDate" = NOW()
    WHERE id = v_request.detection_id;

    -- Update request
    UPDATE publish_requests
    SET
      status = 'approved',
      reviewed_by = p_admin_id,
      reviewer_id = p_admin_id,
      reviewed_at = NOW(),
      review_notes = p_notes,
      result_rule_id = v_target_detection_id,
      updated_at = NOW()
    WHERE id = p_request_id;

    v_notification_type := 'publish_approved_as_new';
    v_notification_title := 'Promoted as New Rule';
    v_notification_message := 'Your detection "' || v_detection.name || '" has been approved and added as a NEW rule in the Production Library.';

  ELSIF p_action = 'reject' THEN
    -- Update detection status
    UPDATE detections
    SET
      publish_status = 'rejected',
      "updatedDate" = NOW()
    WHERE id = v_request.detection_id;

    -- Update request
    UPDATE publish_requests
    SET
      status = 'rejected',
      reviewed_by = p_admin_id,
      reviewer_id = p_admin_id,
      reviewed_at = NOW(),
      review_notes = p_notes,
      updated_at = NOW()
    WHERE id = p_request_id;

    v_notification_type := 'publish_rejected';
    v_notification_title := 'Publish Request Rejected';
    v_notification_message := 'Your publish request for "' || v_detection.name || '" was rejected.' ||
                              CASE WHEN p_notes IS NOT NULL THEN ' Reason: ' || p_notes ELSE '' END;

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action: ' || p_action);
  END IF;

  -- Create notification for submitter
  INSERT INTO user_notifications (user_id, type, title, message, data)
  VALUES (
    v_request.submitted_by,
    v_notification_type,
    v_notification_title,
    v_notification_message,
    jsonb_build_object(
      'request_id', p_request_id,
      'detection_id', v_request.detection_id,
      'detection_name', v_detection.name,
      'action', p_action,
      'admin_id', p_admin_id,
      'result_rule_id', v_target_detection_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', p_action,
    'target_detection_id', v_target_detection_id,
    'is_update', v_is_update
  );
END;
$function$;


-- ============================================================
-- FIX 4: New fork_to_lab() function (Production → Lab)
-- Reverse of copy_to_user_library (Lab → Production)
-- ============================================================

CREATE OR REPLACE FUNCTION public.fork_to_lab(p_detection_id text, p_user_id uuid)
RETURNS text AS $$
DECLARE
  v_source_rule RECORD;
  v_new_id text;
  v_existing_id text;
BEGIN
  -- Source must be a Production Library rule (library_type = 'user')
  SELECT * INTO v_source_rule
  FROM detections
  WHERE id = p_detection_id AND library_type = 'user';

  IF v_source_rule IS NULL THEN
    RAISE EXCEPTION 'Detection not found or not in Production Library';
  END IF;

  -- Check if user already has a lab fork
  SELECT id INTO v_existing_id
  FROM detections
  WHERE source_rule_id = p_detection_id
    AND user_id = p_user_id
    AND library_type = 'universal';

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'You already have a lab copy of this detection (ID: %)', v_existing_id;
  END IF;

  v_new_id := gen_random_uuid()::text;

  INSERT INTO detections (
    id, user_id, version, library_type, source_rule_id, publish_status,
    name, description, author, status, severity, "detectionType",
    "logSource", "logSources", technology, "queryLanguage", "detectionQuery",
    queries, "queryExplanation", "mitreAttackIds", "mitreTactics", "mitreTechniques",
    "linkedGroups", "linkedSoftware", "linkedCampaigns",
    "threatActors", campaigns, software, "associatedCVEs",
    "dataSources", "dataComponents", platforms,
    "investigationSteps", "responseActions", "falsePositiveGuidance",
    prerequisites, caveats, "fineTuning",
    "testedAndValidated", "testCases", "qualityScore",
    "references", tags, maturity, confidence,
    "createdDate", "updatedDate"
  )
  SELECT
    v_new_id, p_user_id, 1, 'universal', p_detection_id, 'unpublished',
    name, description, author, 'Draft', severity, "detectionType",
    "logSource", "logSources", technology, "queryLanguage", "detectionQuery",
    queries, "queryExplanation", "mitreAttackIds", "mitreTactics", "mitreTechniques",
    "linkedGroups", "linkedSoftware", "linkedCampaigns",
    "threatActors", campaigns, software, "associatedCVEs",
    "dataSources", "dataComponents", platforms,
    "investigationSteps", "responseActions", "falsePositiveGuidance",
    prerequisites, caveats, "fineTuning",
    "testedAndValidated", "testCases", "qualityScore",
    "references", tags, maturity, confidence,
    now(), now()
  FROM detections WHERE id = p_detection_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- FIX 5: check_publish_eligibility() — no library_type check needed
-- The function already just checks by detection ID without filtering
-- by library_type, so it works for both. No change needed.
-- (Verified: line 761 does SELECT * WHERE id = p_detection_id only)
-- ============================================================
-- No changes needed for check_publish_eligibility.


-- ============================================================
-- FIX 12: get_defensive_posture scope — already correct
-- 'production' scope → library_type = 'user' (correct)
-- 'lab' scope → library_type = 'universal' (correct)
-- ============================================================
-- No changes needed for get_defensive_posture.
