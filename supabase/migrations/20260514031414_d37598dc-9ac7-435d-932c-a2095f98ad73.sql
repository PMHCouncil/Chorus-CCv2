
-- Drop old single-value columns (and their enum types if no longer used)
ALTER TABLE public.classifications
  DROP COLUMN IF EXISTS division,
  DROP COLUMN IF EXISTS role_affected,
  DROP COLUMN IF EXISTS principle_tag,
  DROP COLUMN IF EXISTS feedback_type;

-- Add new array columns
ALTER TABLE public.classifications
  ADD COLUMN IF NOT EXISTS divisions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS roles_affected TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS principle_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS feedback_types TEXT[] NOT NULL DEFAULT '{}';

-- GIN indexes for array containment filtering
CREATE INDEX IF NOT EXISTS idx_classifications_divisions
  ON public.classifications USING GIN (divisions);
CREATE INDEX IF NOT EXISTS idx_classifications_principle_tags
  ON public.classifications USING GIN (principle_tags);
CREATE INDEX IF NOT EXISTS idx_classifications_feedback_types
  ON public.classifications USING GIN (feedback_types);
CREATE INDEX IF NOT EXISTS idx_classifications_roles_affected
  ON public.classifications USING GIN (roles_affected);

-- Drop legacy enum types if they exist and are no longer referenced
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'division') THEN
    DROP TYPE IF EXISTS public.division CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_type') THEN
    DROP TYPE IF EXISTS public.feedback_type CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'principle_tag') THEN
    DROP TYPE IF EXISTS public.principle_tag CASCADE;
  END IF;
END $$;

-- Update classifier system prompt: append the multi-value addendum (only if not already present)
UPDATE public.app_settings
SET value = value || E'\n\nFields ending in plural (divisions, roles_affected, principle_tags, feedback_types) are arrays. Include every value that genuinely applies based on the content. If a submission discusses concerns across multiple divisions or principles, list all of them. If only one applies, return a single-element array. If none apply, return an empty array. The sentiment field remains a single overall value reflecting the submission''s predominant tone.',
    updated_at = now()
WHERE key = 'classifier_system_prompt'
  AND value NOT LIKE '%Fields ending in plural%';
