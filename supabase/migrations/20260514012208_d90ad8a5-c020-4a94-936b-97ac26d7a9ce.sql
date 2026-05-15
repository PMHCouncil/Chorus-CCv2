
-- Trigger to keep themes.submission_count accurate
CREATE OR REPLACE FUNCTION public.update_theme_submission_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.themes
       SET submission_count = submission_count + 1
     WHERE id = NEW.theme_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.themes
       SET submission_count = GREATEST(submission_count - 1, 0)
     WHERE id = OLD.theme_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND NEW.theme_id IS DISTINCT FROM OLD.theme_id THEN
    UPDATE public.themes
       SET submission_count = GREATEST(submission_count - 1, 0)
     WHERE id = OLD.theme_id;
    UPDATE public.themes
       SET submission_count = submission_count + 1
     WHERE id = NEW.theme_id;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_submission_themes_count ON public.submission_themes;
CREATE TRIGGER trg_submission_themes_count
AFTER INSERT OR UPDATE OR DELETE ON public.submission_themes
FOR EACH ROW EXECUTE FUNCTION public.update_theme_submission_count();

-- Backfill current counts
UPDATE public.themes t
   SET submission_count = COALESCE(c.cnt, 0)
  FROM (
    SELECT theme_id, COUNT(*)::int AS cnt
      FROM public.submission_themes
     GROUP BY theme_id
  ) c
 WHERE c.theme_id = t.id;

UPDATE public.themes
   SET submission_count = 0
 WHERE id NOT IN (SELECT theme_id FROM public.submission_themes);

-- Merge themes: move all submission_themes from source -> target, then delete source
CREATE OR REPLACE FUNCTION public.merge_themes(_source_id uuid, _target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'hr'::app_role)) THEN
    RAISE EXCEPTION 'Not authorised to merge themes';
  END IF;

  IF _source_id = _target_id THEN
    RAISE EXCEPTION 'Source and target themes must differ';
  END IF;

  -- Move links, skipping ones already linked to target
  UPDATE public.submission_themes st
     SET theme_id = _target_id
   WHERE st.theme_id = _source_id
     AND NOT EXISTS (
       SELECT 1 FROM public.submission_themes x
        WHERE x.submission_id = st.submission_id
          AND x.theme_id = _target_id
     );

  -- Drop any leftover duplicates
  DELETE FROM public.submission_themes
   WHERE theme_id = _source_id;

  DELETE FROM public.themes WHERE id = _source_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_themes(uuid, uuid) TO authenticated;
