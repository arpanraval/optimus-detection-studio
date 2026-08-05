ALTER TABLE public.auto_digest_campaigns
  ADD COLUMN IF NOT EXISTS ai_link_rationale text,
  ADD COLUMN IF NOT EXISTS ai_link_confidence text,
  ADD COLUMN IF NOT EXISTS story_decision_version text;

ALTER TABLE public.auto_digest_campaigns
  DROP CONSTRAINT IF EXISTS auto_digest_campaigns_ai_link_confidence_check;
ALTER TABLE public.auto_digest_campaigns
  ADD CONSTRAINT auto_digest_campaigns_ai_link_confidence_check
  CHECK (ai_link_confidence IS NULL OR ai_link_confidence IN ('high', 'medium', 'low'));
