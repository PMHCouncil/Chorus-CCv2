
-- Trigger to keep themes.submission_count in sync with submission_themes
DROP TRIGGER IF EXISTS trg_submission_themes_count ON public.submission_themes;
CREATE TRIGGER trg_submission_themes_count
AFTER INSERT OR UPDATE OR DELETE ON public.submission_themes
FOR EACH ROW EXECUTE FUNCTION public.update_theme_submission_count();

-- Full recalc helper (admin/HR only) for repair / on-demand refresh
CREATE OR REPLACE FUNCTION public.refresh_theme_submission_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'hr'::app_role)) THEN
    RAISE EXCEPTION 'Not authorised to refresh theme counts';
  END IF;

  UPDATE public.themes t
     SET submission_count = COALESCE(c.cnt, 0)
    FROM (
      SELECT th.id, COUNT(st.submission_id) AS cnt
        FROM public.themes th
        LEFT JOIN public.submission_themes st ON st.theme_id = th.id
        LEFT JOIN public.submissions s
               ON s.id = st.submission_id AND s.archived_at IS NULL
       GROUP BY th.id
    ) c
   WHERE t.id = c.id;
END;
$$;

-- One-off recalc to correct any existing drift (runs as migration role, bypasses auth check)
UPDATE public.themes t
   SET submission_count = COALESCE(c.cnt, 0)
  FROM (
    SELECT th.id, COUNT(st.submission_id) AS cnt
      FROM public.themes th
      LEFT JOIN public.submission_themes st ON st.theme_id = th.id
      LEFT JOIN public.submissions s
             ON s.id = st.submission_id AND s.archived_at IS NULL
     GROUP BY th.id
  ) c
 WHERE t.id = c.id;
