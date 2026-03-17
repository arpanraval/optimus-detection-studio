-- ============================================================
-- 09_seed_data.sql - Minimal seed data for scoring
-- Run after: 08_rls_policies.sql
-- ============================================================
-- These tactic weight profiles are required for the scoring
-- engine (materialized views and scoring functions).
-- MITRE ATT&CK data is NOT seeded here — use the app's
-- Settings → MITRE Data Sync page to import it.
-- ============================================================

-- Three tactic weight profiles for different scoring strategies
INSERT INTO mitre_tactic_weights (id, tactic, profile, weight) VALUES
  -- Balanced profile: equal emphasis across the kill chain
  (gen_random_uuid(), 'reconnaissance',       'balanced', 0.50),
  (gen_random_uuid(), 'resource-development',  'balanced', 0.50),
  (gen_random_uuid(), 'initial-access',        'balanced', 0.75),
  (gen_random_uuid(), 'execution',             'balanced', 1.00),
  (gen_random_uuid(), 'persistence',           'balanced', 0.95),
  (gen_random_uuid(), 'privilege-escalation',  'balanced', 0.90),
  (gen_random_uuid(), 'defense-evasion',       'balanced', 0.95),
  (gen_random_uuid(), 'credential-access',     'balanced', 0.80),
  (gen_random_uuid(), 'discovery',             'balanced', 0.70),
  (gen_random_uuid(), 'lateral-movement',      'balanced', 0.85),
  (gen_random_uuid(), 'collection',            'balanced', 0.75),
  (gen_random_uuid(), 'command-and-control',   'balanced', 0.70),
  (gen_random_uuid(), 'exfiltration',          'balanced', 0.80),
  (gen_random_uuid(), 'impact',                'balanced', 0.85),

  -- Left of Boom: emphasizes early kill chain (recon, initial access, discovery)
  (gen_random_uuid(), 'reconnaissance',       'left_of_boom', 0.90),
  (gen_random_uuid(), 'resource-development',  'left_of_boom', 0.85),
  (gen_random_uuid(), 'initial-access',        'left_of_boom', 1.00),
  (gen_random_uuid(), 'execution',             'left_of_boom', 0.80),
  (gen_random_uuid(), 'persistence',           'left_of_boom', 0.75),
  (gen_random_uuid(), 'privilege-escalation',  'left_of_boom', 0.80),
  (gen_random_uuid(), 'defense-evasion',       'left_of_boom', 0.70),
  (gen_random_uuid(), 'credential-access',     'left_of_boom', 0.85),
  (gen_random_uuid(), 'discovery',             'left_of_boom', 0.95),
  (gen_random_uuid(), 'lateral-movement',      'left_of_boom', 0.80),
  (gen_random_uuid(), 'collection',            'left_of_boom', 0.60),
  (gen_random_uuid(), 'command-and-control',   'left_of_boom', 0.70),
  (gen_random_uuid(), 'exfiltration',          'left_of_boom', 0.50),
  (gen_random_uuid(), 'impact',                'left_of_boom', 0.40),

  -- Impact Prevention: emphasizes late kill chain (exfiltration, impact, collection)
  (gen_random_uuid(), 'reconnaissance',       'impact_prevention', 0.30),
  (gen_random_uuid(), 'resource-development',  'impact_prevention', 0.30),
  (gen_random_uuid(), 'initial-access',        'impact_prevention', 0.60),
  (gen_random_uuid(), 'execution',             'impact_prevention', 1.00),
  (gen_random_uuid(), 'persistence',           'impact_prevention', 0.85),
  (gen_random_uuid(), 'privilege-escalation',  'impact_prevention', 0.90),
  (gen_random_uuid(), 'defense-evasion',       'impact_prevention', 0.85),
  (gen_random_uuid(), 'credential-access',     'impact_prevention', 0.75),
  (gen_random_uuid(), 'discovery',             'impact_prevention', 0.50),
  (gen_random_uuid(), 'lateral-movement',      'impact_prevention', 0.80),
  (gen_random_uuid(), 'collection',            'impact_prevention', 0.90),
  (gen_random_uuid(), 'command-and-control',   'impact_prevention', 0.75),
  (gen_random_uuid(), 'exfiltration',          'impact_prevention', 0.95),
  (gen_random_uuid(), 'impact',                'impact_prevention', 1.00)
ON CONFLICT DO NOTHING;
