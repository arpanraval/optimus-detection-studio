ALTER TABLE public.auto_digest_settings
  ALTER COLUMN ai_model SET DEFAULT 'gemini-3.6-flash',
  ALTER COLUMN classification_model SET DEFAULT 'gemini-3.6-flash',
  ALTER COLUMN digest_model SET DEFAULT 'gemini-3.6-flash';

-- Remap saved selections so a deployment cannot keep calling retired models.
-- The image model maps to the text default here because Auto Digest requires
-- structured JSON and is not an image-generation workflow.
WITH model_map(old_id, new_id) AS (
  VALUES
    ('gemini-3.1-pro-preview', 'gemini-3.6-flash'),
    ('gemini-3-flash-preview', 'gemini-3.6-flash'),
    ('gemini-3.1-flash-lite-preview', 'gemini-3.5-flash-lite'),
    ('gemini-3-pro-image-preview', 'gemini-3.6-flash'),
    ('gemini-2.0-flash', 'gemini-3.5-flash-lite'),
    ('gpt-5.4', 'gpt-5.6-sol'),
    ('gpt-5.4-mini', 'gpt-5.6-terra'),
    ('gpt-5.4-nano', 'gpt-5.6-luna'),
    ('claude-opus-4-6', 'claude-opus-5'),
    ('claude-opus-4-7', 'claude-opus-5'),
    ('claude-sonnet-4-6', 'claude-sonnet-5'),
    ('claude-haiku-4-5', 'claude-sonnet-5'),
    ('claude-haiku-4-5-20251001', 'claude-sonnet-5')
)
UPDATE public.auto_digest_settings AS settings
SET
  ai_model = COALESCE(
    (SELECT new_id FROM model_map WHERE old_id = settings.ai_model),
    settings.ai_model
  ),
  classification_model = COALESCE(
    (SELECT new_id FROM model_map WHERE old_id = settings.classification_model),
    settings.classification_model
  ),
  digest_model = COALESCE(
    (SELECT new_id FROM model_map WHERE old_id = settings.digest_model),
    settings.digest_model
  )
WHERE
  settings.ai_model IN (SELECT old_id FROM model_map)
  OR settings.classification_model IN (SELECT old_id FROM model_map)
  OR settings.digest_model IN (SELECT old_id FROM model_map);
