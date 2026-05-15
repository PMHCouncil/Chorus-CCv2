-- 1) Remove privilege-escalation RPC
DROP FUNCTION IF EXISTS public.bootstrap_test_role(public.app_role);

-- 2) Lock down EXECUTE on SECURITY DEFINER functions
-- RLS-helper and trigger functions: not callable from the API at all
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_content_staff(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_content_editor(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_content_approver(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_theme_submission_count() FROM PUBLIC, anon, authenticated;

-- App-callable RPCs: signed-in users only
REVOKE ALL ON FUNCTION public.assign_submissions(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_submissions(uuid[], uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.merge_themes(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_themes(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.refresh_theme_submission_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_theme_submission_counts() TO authenticated;