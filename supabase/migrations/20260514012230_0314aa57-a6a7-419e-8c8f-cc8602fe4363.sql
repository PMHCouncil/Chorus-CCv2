
REVOKE EXECUTE ON FUNCTION public.update_theme_submission_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_themes(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_themes(uuid, uuid) TO authenticated;
