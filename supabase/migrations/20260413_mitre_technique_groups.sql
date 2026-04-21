-- MITRE Technique Groups
--
-- Stores named sets of MITRE technique IDs for use by the pack generator
-- (replaces hardcoded RANSOMWARE_TECHNIQUE_IDS, INSIDER_THREAT_TECHNIQUES, etc.
-- in packGeneratorService.ts).
--
-- Allows adding new groups or updating existing ones without a code deploy,
-- which is important as MITRE ATT&CK evolves.

CREATE TABLE IF NOT EXISTS mitre_technique_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,       -- e.g., 'ransomware', 'insider_threat', 'cloud_security'
  name text NOT NULL,             -- Display name
  description text,
  technique_ids text[] NOT NULL DEFAULT '{}'::text[],
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mitre_technique_groups_key ON mitre_technique_groups(key);

ALTER TABLE mitre_technique_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "MITRE technique groups readable by authenticated" ON mitre_technique_groups;
CREATE POLICY "MITRE technique groups readable by authenticated"
  ON mitre_technique_groups FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage MITRE technique groups" ON mitre_technique_groups;
CREATE POLICY "Admins manage MITRE technique groups"
  ON mitre_technique_groups FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('owner','admin')
    )
  );

GRANT ALL ON mitre_technique_groups TO service_role;

-- Seed with current hardcoded groups
INSERT INTO mitre_technique_groups (key, name, description, technique_ids) VALUES
  (
    'ransomware',
    'Ransomware',
    'MITRE ATT&CK techniques commonly associated with ransomware operations',
    ARRAY['T1486','T1490','T1489','T1491','T1485','T1561','T1529','T1021','T1570','T1059','T1053','T1047','T1569','T1078','T1566','T1189','T1190','T1133','T1027','T1562','T1112','T1003','T1082','T1083','T1135','T1071','T1105','T1041','T1048']
  ),
  (
    'insider_threat',
    'Insider Threat',
    'Techniques targeting insider threat indicators — credential abuse, data collection, and exfiltration',
    ARRAY['T1078','T1098','T1136','T1087','T1069','T1003','T1552','T1530','T1537','T1567','T1048','T1041','T1020','T1074','T1119','T1213','T1005','T1039','T1114','T1565']
  ),
  (
    'cloud_security',
    'Cloud Security',
    'Cloud-focused MITRE techniques across AWS, Azure, GCP, and identity providers',
    ARRAY['T1078','T1098','T1136','T1190','T1133','T1530','T1537','T1578','T1580','T1538','T1526','T1613','T1610','T1552','T1550','T1087','T1069','T1562','T1535','T1496']
  )
ON CONFLICT (key) DO NOTHING;
