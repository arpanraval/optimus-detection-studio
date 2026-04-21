-- Split "Admins manage" FOR ALL policies into INSERT/UPDATE/DELETE so they
-- don't overlap with the "readable by authenticated" SELECT policies.
-- Eliminates the multiple_permissive_policies warning without changing access semantics.

-- detection_packs
DROP POLICY IF EXISTS "Admins manage packs" ON public.detection_packs;
CREATE POLICY "Admins insert packs" ON public.detection_packs
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text])));
CREATE POLICY "Admins update packs" ON public.detection_packs
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text])))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text])));
CREATE POLICY "Admins delete packs" ON public.detection_packs
  FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text])));

-- pack_detections
DROP POLICY IF EXISTS "Admins manage pack detections" ON public.pack_detections;
CREATE POLICY "Admins insert pack detections" ON public.pack_detections
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text])));
CREATE POLICY "Admins update pack detections" ON public.pack_detections
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text])))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text])));
CREATE POLICY "Admins delete pack detections" ON public.pack_detections
  FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text])));
