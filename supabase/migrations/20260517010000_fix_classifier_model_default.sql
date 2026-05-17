-- The original seed in 20260514010919 set classifier_model to
-- 'google/gemini-2.5-flash' (a leftover from before the port to this stack).
-- The classify/draft server actions only call the Anthropic API, so sending
-- a Google model id makes Anthropic reject the request and the server
-- action throws. Replace any non-Anthropic value with the documented
-- default. New Anthropic values picked from the Settings UI are preserved.

UPDATE public.app_settings
SET value = 'claude-sonnet-4-6',
    updated_at = now()
WHERE key = 'classifier_model'
  AND value NOT LIKE 'claude-%';
