-- Secure the embedding tables (advisor ERROR: rls_disabled_in_public).
--
-- detection_embeddings and mitre_embeddings have RLS disabled and anon holds
-- table grants, so the public anon key can read every row (incl.
-- detection_embeddings.embedded_text plaintext) and any caller can
-- poison/delete the semantic-search index.
--
-- Access model after this migration:
--   service_role  -> full access (edge functions). Bypasses RLS.
--   authenticated -> SELECT only, admins only (admin Sync page reads counts).
--   anon          -> no access (grants revoked; no policy applies).
--
-- Verified safe (2026-05-22): no triggers / views / realtime depend on these
-- tables. find_similar_detections is SECURITY DEFINER owned by postgres ->
-- bypasses RLS. search_detections_by_embedding / hybrid_search_detections are
-- SECURITY INVOKER but only ever called by service_role edge functions ->
-- bypass RLS. The only client-side direct readers are in embeddingService.ts,
-- used solely by the admin-gated Sync page -> covered by the admin SELECT policy.

ALTER TABLE public.detection_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_embeddings     ENABLE ROW LEVEL SECURITY;

-- Defense in depth: remove the auto-granted privileges.
REVOKE ALL ON public.detection_embeddings FROM anon;
REVOKE ALL ON public.mitre_embeddings     FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.detection_embeddings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.mitre_embeddings     FROM authenticated;
-- authenticated keeps its SELECT grant; the policy below restricts rows to admins.

CREATE POLICY detection_embeddings_admin_select ON public.detection_embeddings
  FOR SELECT TO authenticated
  USING (public.is_global_admin(auth.uid()));

CREATE POLICY mitre_embeddings_admin_select ON public.mitre_embeddings
  FOR SELECT TO authenticated
  USING (public.is_global_admin(auth.uid()));
