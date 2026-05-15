-- Fix: RLS helper functions need EXECUTE granted to `authenticated`.
--
-- Migration 20260514055348 revoked EXECUTE on these from authenticated as part
-- of locking down the API surface. That intent is correct for pure trigger
-- functions (handle_new_user, update_theme_submission_count), but the
-- has_role / is_content_* helpers are called inside RLS policy predicates,
-- and PostgreSQL evaluates those predicates as the calling role. Without
-- EXECUTE the calling role hits SQLSTATE 42501 ("permission denied for
-- function ...") on every query against an RLS-protected table.
--
-- SECURITY DEFINER on the function bodies still protects the inner
-- user_roles read; this grant only allows the policy evaluator to call them.

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_content_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_content_editor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_content_approver(uuid) TO authenticated;
