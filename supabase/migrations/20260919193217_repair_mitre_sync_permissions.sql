-- Align installed projects with the existing canonical schema. Admin/owner only; no data reset.

DROP POLICY IF EXISTS "Admins can manage mitre_objects" ON public.mitre_objects;

CREATE POLICY "Admins can manage mitre_objects" ON public.mitre_objects AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS "Admins can manage mitre_relationships" ON public.mitre_relationships;

CREATE POLICY "Admins can manage mitre_relationships" ON public.mitre_relationships AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS "Admins can manage mitre_metadata" ON public.mitre_metadata;

CREATE POLICY "Admins can manage mitre_metadata" ON public.mitre_metadata AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS "Admins can manage mitre_technique_tactics" ON public.mitre_technique_tactics;

CREATE POLICY "Admins can manage mitre_technique_tactics" ON public.mitre_technique_tactics AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS "Admins can manage mitre_technique_platforms" ON public.mitre_technique_platforms;

CREATE POLICY "Admins can manage mitre_technique_platforms" ON public.mitre_technique_platforms AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS "Admins can manage mitre_technique_data_sources" ON public.mitre_technique_data_sources;

CREATE POLICY "Admins can manage mitre_technique_data_sources" ON public.mitre_technique_data_sources AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

ALTER TABLE public.mitre_metadata
  ADD COLUMN IF NOT EXISTS total_detection_strategies integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_analytics integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_data_components integer DEFAULT 0;
