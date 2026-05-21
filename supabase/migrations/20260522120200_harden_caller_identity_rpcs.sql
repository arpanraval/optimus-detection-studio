-- Bind caller identity to auth.uid() in the RPCs that previously trusted a
-- caller-supplied p_admin_id / p_user_id.
--
-- Before: approve_promotion checked that p_admin_id is an admin but never that
-- p_admin_id = auth.uid() (a non-admin could approve their own promotion by
-- passing an admin's UUID). fork_to_development / submit_for_promotion accepted
-- an explicit p_user_id (identity spoof). rollback_bulk_import made its
-- permission decision from the caller-supplied p_user_id.
--
-- Signatures are unchanged. Verified (2026-05-22): no DB-internal, edge, or cron
-- callers exist -- these four are browser-RPC-only, so auth.uid() is always a
-- real user. Every client call site passes the caller's own id or omits it, so
-- the bind is non-breaking. SET search_path = public is added as hardening.

-- fork_to_development ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fork_to_development(p_detection_id text, p_user_id uuid DEFAULT auth.uid())
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_source_rule RECORD;
  v_new_id text;
  v_existing_id text;
BEGIN
  -- HARDENING: ignore caller-supplied p_user_id; bind to the JWT identity.
  p_user_id := auth.uid();
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_source_rule
  FROM detections
  WHERE id = p_detection_id AND library_type = 'production';

  IF v_source_rule IS NULL THEN
    RAISE EXCEPTION 'Detection not found or not in Production Library';
  END IF;

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
$function$;

-- submit_for_promotion (text overload) ---------------------------------------
CREATE OR REPLACE FUNCTION public.submit_for_promotion(p_detection_id text, p_user_id uuid DEFAULT auth.uid())
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_detection RECORD; v_request_id UUID; v_target_rule_id TEXT;
BEGIN
  -- HARDENING: bind to the JWT identity.
  p_user_id := auth.uid();
  IF p_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;

  SELECT * INTO v_detection FROM detections
  WHERE id = p_detection_id AND library_type = 'development' AND user_id = p_user_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Detection not found or not owned by user'); END IF;
  IF v_detection.promotion_status = 'pending' THEN RETURN json_build_object('success', false, 'error', 'Already pending approval'); END IF;
  IF COALESCE(v_detection."qualityScore", 0) < 60 THEN RETURN json_build_object('success', false, 'error', 'Quality score must be at least 60', 'current_score', v_detection."qualityScore"); END IF;
  IF v_detection.name IS NULL OR v_detection.name = '' THEN RETURN json_build_object('success', false, 'error', 'Name is required'); END IF;
  IF v_detection.description IS NULL OR LENGTH(v_detection.description) < 20 THEN RETURN json_build_object('success', false, 'error', 'Description must be at least 20 characters'); END IF;
  IF v_detection."mitreAttackIds" IS NULL OR array_length(v_detection."mitreAttackIds", 1) IS NULL THEN RETURN json_build_object('success', false, 'error', 'At least one MITRE technique is required'); END IF;
  IF v_detection."detectionQuery" IS NULL OR v_detection."detectionQuery" = '' THEN RETURN json_build_object('success', false, 'error', 'Detection query is required'); END IF;

  v_target_rule_id := v_detection.source_rule_id;
  INSERT INTO promotion_requests (detection_id, target_rule_id, submitted_by, status)
  VALUES (p_detection_id, v_target_rule_id, p_user_id, 'pending') RETURNING id INTO v_request_id;
  UPDATE detections SET promotion_status = 'pending', "updatedDate" = now() WHERE id = p_detection_id;

  RETURN json_build_object('success', true, 'request_id', v_request_id,
    'target_action', CASE WHEN v_target_rule_id IS NULL THEN 'create_new' ELSE 'update_existing' END,
    'target_rule_id', v_target_rule_id);
END;
$function$;

-- submit_for_promotion (uuid overload) ---------------------------------------
CREATE OR REPLACE FUNCTION public.submit_for_promotion(p_detection_id uuid, p_user_id uuid DEFAULT auth.uid())
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_detection RECORD; v_request_id UUID; v_target_rule_id TEXT;
BEGIN
  -- HARDENING: bind to the JWT identity.
  p_user_id := auth.uid();
  IF p_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;

  SELECT * INTO v_detection FROM detections
  WHERE id = p_detection_id AND library_type = 'development' AND user_id = p_user_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Detection not found or not owned by user'); END IF;
  IF v_detection.promotion_status = 'pending' THEN RETURN json_build_object('success', false, 'error', 'Already pending approval'); END IF;
  IF v_detection.promotion_status = 'promoted' AND v_detection.promoted_at IS NOT NULL AND v_detection."updatedDate" <= v_detection.promoted_at THEN
    RETURN json_build_object('success', false, 'error', 'Already promoted and unchanged'); END IF;
  IF COALESCE(v_detection."qualityScore", 0) < 60 THEN RETURN json_build_object('success', false, 'error', 'Quality score must be at least 60'); END IF;
  IF v_detection.name IS NULL OR v_detection.name = '' THEN RETURN json_build_object('success', false, 'error', 'Name is required'); END IF;
  IF v_detection.description IS NULL OR LENGTH(v_detection.description) < 20 THEN RETURN json_build_object('success', false, 'error', 'Description must be at least 20 characters'); END IF;
  IF v_detection."mitreAttackIds" IS NULL OR array_length(v_detection."mitreAttackIds", 1) IS NULL THEN RETURN json_build_object('success', false, 'error', 'At least one MITRE technique is required'); END IF;
  IF v_detection."detectionQuery" IS NULL OR v_detection."detectionQuery" = '' THEN RETURN json_build_object('success', false, 'error', 'Detection query is required'); END IF;

  v_target_rule_id := v_detection.source_rule_id;
  INSERT INTO promotion_requests (detection_id, target_rule_id, submitted_by, status)
  VALUES (p_detection_id, v_target_rule_id, p_user_id, 'pending') RETURNING id INTO v_request_id;
  UPDATE detections SET promotion_status = 'pending', "updatedDate" = now() WHERE id = p_detection_id;

  RETURN json_build_object('success', true, 'request_id', v_request_id,
    'target_action', CASE WHEN v_target_rule_id IS NULL THEN 'create_new' ELSE 'update_existing' END,
    'target_rule_id', v_target_rule_id);
END;
$function$;

-- rollback_bulk_import -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rollback_bulk_import(p_job_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
 SET statement_timeout TO '5min'
AS $function$
DECLARE
  v_job RECORD;
  v_deleted_count INTEGER;
  v_result JSONB;
BEGIN
  -- HARDENING: the permission check below must use the JWT identity, not a
  -- caller-supplied p_user_id (which previously let any caller pass the job
  -- owner's or an admin's UUID to satisfy the check).
  p_user_id := auth.uid();
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT * INTO v_job FROM bulk_import_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Import job not found');
  END IF;
  IF v_job.status = 'reverted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Import has already been reverted');
  END IF;
  IF v_job.status NOT IN ('completed', 'failed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only completed or failed imports can be rolled back');
  END IF;

  IF v_job.user_id != p_user_id THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND role IN ('owner', 'admin')) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Permission denied: you can only rollback your own imports');
    END IF;
  END IF;

  DELETE FROM detections WHERE bulk_import_id = p_job_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  UPDATE bulk_import_jobs
  SET status = 'reverted', reverted_at = now(), reverted_by = p_user_id, updated_at = now()
  WHERE id = p_job_id;

  v_result := jsonb_build_object('success', true, 'deleted_count', v_deleted_count,
                                 'job_id', p_job_id, 'reverted_at', now());
  RETURN v_result;
END;
$function$;

-- approve_promotion ----------------------------------------------------------
-- Body verbatim from the live definition (pg_get_functiondef, 2026-05-22) with
-- exactly two changes: SET search_path = public added to the header, and the
-- four-line HARDENING block inserted immediately after BEGIN.
CREATE OR REPLACE FUNCTION public.approve_promotion(p_request_id uuid, p_admin_id uuid DEFAULT auth.uid(), p_action text DEFAULT 'approve'::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
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
  -- HARDENING: ignore caller-supplied p_admin_id; bind to the JWT identity so
  -- the role check below validates the real caller, not a spoofed admin UUID.
  p_admin_id := auth.uid();
  IF p_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin_id AND role IN ('owner', 'admin', 'lead')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin or Lead access required');
  END IF;

  SELECT * INTO v_request FROM promotion_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  IF v_request.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request already processed');
  END IF;

  SELECT * INTO v_detection FROM detections WHERE id = v_request.detection_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Detection not found');
  END IF;

  IF p_action = 'approve' THEN
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
      SELECT COALESCE(version, 1) INTO v_current_version FROM detections WHERE id = v_target_detection_id;
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
        v_detection.name, v_detection.description, v_detection.status, v_detection.severity, v_detection.author,
        1, NOW(), NOW(),
        v_detection."detectionType", v_detection."logSource", v_detection."logSources", v_detection.technology,
        v_detection."queryLanguage", v_detection."detectionQuery", v_detection.queries, v_detection."queryExplanation",
        v_detection."mitreAttackIds", v_detection."mitreTactics", v_detection."mitreTechniques",
        v_detection."linkedGroups", v_detection."linkedSoftware", v_detection."linkedCampaigns",
        v_detection."threatActors", v_detection.campaigns, v_detection.software, v_detection."associatedCVEs",
        v_detection."dataSources", v_detection."dataComponents", v_detection.platforms,
        v_detection."investigationSteps", v_detection."responseActions", v_detection."falsePositiveGuidance",
        v_detection.prerequisites, v_detection.caveats, v_detection."fineTuning",
        v_detection."testedAndValidated", v_detection."testCases", v_detection."qualityScore",
        v_detection."references", v_detection.tags,
        'production', 'community', v_request.submitted_by
      );
      v_notification_message := 'Your detection "' || v_detection.name || '" has been approved and promoted to the Production Library.';
    END IF;

    UPDATE detections
    SET promotion_status = 'promoted', promoted_to_id = v_target_detection_id, promoted_at = NOW(), "updatedDate" = NOW()
    WHERE id = v_request.detection_id;

    UPDATE promotion_requests
    SET status = 'approved', reviewed_by = p_admin_id, reviewer_id = p_admin_id, reviewed_at = NOW(),
        review_notes = p_notes, result_rule_id = v_target_detection_id, updated_at = NOW()
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
      v_detection.name, v_detection.description, v_detection.status, v_detection.severity, v_detection.author,
      1, NOW(), NOW(),
      v_detection."detectionType", v_detection."logSource", v_detection."logSources", v_detection.technology,
      v_detection."queryLanguage", v_detection."detectionQuery", v_detection.queries, v_detection."queryExplanation",
      v_detection."mitreAttackIds", v_detection."mitreTactics", v_detection."mitreTechniques",
      v_detection."linkedGroups", v_detection."linkedSoftware", v_detection."linkedCampaigns",
      v_detection."threatActors", v_detection.campaigns, v_detection.software, v_detection."associatedCVEs",
      v_detection."dataSources", v_detection."dataComponents", v_detection.platforms,
      v_detection."investigationSteps", v_detection."responseActions", v_detection."falsePositiveGuidance",
      v_detection.prerequisites, v_detection.caveats, v_detection."fineTuning",
      v_detection."testedAndValidated", v_detection."testCases", v_detection."qualityScore",
      v_detection."references", v_detection.tags,
      'production', 'community', v_request.submitted_by
    );

    UPDATE detections
    SET promotion_status = 'promoted', promoted_to_id = v_target_detection_id, promoted_at = NOW(), "updatedDate" = NOW()
    WHERE id = v_request.detection_id;

    UPDATE promotion_requests
    SET status = 'approved', reviewed_by = p_admin_id, reviewer_id = p_admin_id, reviewed_at = NOW(),
        review_notes = p_notes, result_rule_id = v_target_detection_id, updated_at = NOW()
    WHERE id = p_request_id;

    v_notification_type := 'promotion_approved_as_new';
    v_notification_title := 'Promoted as New Rule';
    v_notification_message := 'Your detection "' || v_detection.name || '" has been approved and added as a NEW rule in the Production Library.';

  ELSIF p_action = 'reject' THEN
    UPDATE detections
    SET promotion_status = 'rejected', "updatedDate" = NOW()
    WHERE id = v_request.detection_id;

    UPDATE promotion_requests
    SET status = 'rejected', reviewed_by = p_admin_id, reviewer_id = p_admin_id, reviewed_at = NOW(),
        review_notes = p_notes, updated_at = NOW()
    WHERE id = p_request_id;

    v_notification_type := 'promotion_rejected';
    v_notification_title := 'Promotion Request Rejected';
    v_notification_message := 'Your detection "' || v_detection.name || '" was not approved.' ||
      CASE WHEN p_notes IS NOT NULL AND p_notes != '' THEN ' Reason: ' || p_notes ELSE '' END;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Use approve, approve_as_new, or reject.');
  END IF;

  INSERT INTO user_notifications (user_id, type, title, message, detection_id, is_read, created_at)
  VALUES (v_request.submitted_by, v_notification_type, v_notification_title, v_notification_message, v_request.detection_id, false, NOW());

  RETURN jsonb_build_object('success', true, 'action', p_action, 'is_update', v_is_update, 'production_id', v_target_detection_id);
END;
$function$;
