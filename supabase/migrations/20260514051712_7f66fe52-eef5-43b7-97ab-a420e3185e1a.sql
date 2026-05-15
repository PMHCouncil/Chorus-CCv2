
-- Remove any existing orphans before adding FKs
DELETE FROM public.submission_themes st
 WHERE NOT EXISTS (SELECT 1 FROM public.themes t WHERE t.id = st.theme_id)
    OR NOT EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = st.submission_id);

-- Drop pre-existing FKs (if any) to recreate with cascade
ALTER TABLE public.submission_themes
  DROP CONSTRAINT IF EXISTS submission_themes_theme_id_fkey,
  DROP CONSTRAINT IF EXISTS submission_themes_submission_id_fkey;

ALTER TABLE public.submission_themes
  ADD CONSTRAINT submission_themes_theme_id_fkey
    FOREIGN KEY (theme_id) REFERENCES public.themes(id) ON DELETE CASCADE,
  ADD CONSTRAINT submission_themes_submission_id_fkey
    FOREIGN KEY (submission_id) REFERENCES public.submissions(id) ON DELETE CASCADE;
