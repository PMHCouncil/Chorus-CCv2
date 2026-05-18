-- ============================================================
-- Security hardening: audit-log immutability, narrower reads,
-- and profile/role visibility for newer content roles.
--
-- Background: a security review on 2026-05-18 found:
--   * audit_log INSERT was open to any authenticated user with a
--     WITH CHECK that only required `auth.uid() = user_id`, so the
--     audit trail could be forged by any signed-in user.
--   * audit_log SELECT was readable by `exec`, even though `exec`
--     is excluded from reading raw submission content. Details
--     JSONB leaked submission ids and assignment metadata.
--   * profiles / user_roles SELECT policies still referenced the
--     legacy role literals (admin/hr/exec). New roles introduced
--     in 20260514053837 (gm, gm_ea, director, group_manager)
--     could not view profiles — driving callers to fall back on
--     the service-role key.
--
-- This migration:
--   1. Drops the client-writable audit_log INSERT policy and
--      revokes INSERT from the `authenticated` role outright.
--   2. Adds a SECURITY DEFINER RPC `log_audit_event` that derives
--      `user_id` from `auth.uid()` server-side — the only path
--      callers can use to write an audit row.
--   3. Narrows audit_log SELECT to the content-editor tier
--      (hr, gm, gm_ea, director). Approvers/execs lose access.
--   4. Rewrites profiles + user_roles SELECT to use the
--      `is_content_staff` helper, restoring visibility for newer
--      roles.
--   5. Backfills SECURITY DEFINER INSERTs in `assign_submissions`
--      / `merge_themes` etc. — they already insert audit rows
--      under the function owner's privileges, so the INSERT
--      revoke doesn't affect them.
-- ============================================================

-- ----- 1. audit_log INSERT lockdown --------------------------
DROP POLICY IF EXISTS "Authenticated insert audit_log" ON public.audit_log;
REVOKE INSERT ON public.audit_log FROM authenticated;
REVOKE INSERT ON public.audit_log FROM anon;

-- ----- 2. log_audit_event RPC --------------------------------
-- Single auth-aware entry point for inserting audit rows. The
-- function ignores any caller-supplied user_id and stamps the
-- row with the verified auth.uid(). Returns the new row id so
-- callers can correlate.
CREATE OR REPLACE FUNCTION public.log_audit_event(
  _action text,
  _entity_type text,
  _entity_id uuid,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Input sanity. Keep action / entity_type short and non-empty
  -- so a misbehaving client can't write giant strings into the
  -- log table.
  IF _action IS NULL OR length(_action) = 0 OR length(_action) > 120 THEN
    RAISE EXCEPTION 'log_audit_event: invalid action';
  END IF;
  IF _entity_type IS NULL OR length(_entity_type) = 0 OR length(_entity_type) > 60 THEN
    RAISE EXCEPTION 'log_audit_event: invalid entity_type';
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, _action, _entity_type, _entity_id, COALESCE(_details, '{}'::jsonb))
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_event(text, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, uuid, jsonb) TO authenticated;

-- ----- 3. audit_log SELECT narrow ----------------------------
-- Editors (hr, gm, gm_ea, director) can read; approvers / exec
-- lose direct access to the audit_log details. Admin can read
-- via the service-role client (used by getAdminAuditLog).
DROP POLICY IF EXISTS "All staff view audit_log" ON public.audit_log;
CREATE POLICY "Editors view audit_log" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_content_editor(auth.uid()));

-- ----- 4. profiles / user_roles visibility -------------------
-- Allow content-staff roles (the full hr/exec/gm/gm_ea/director/
-- group_manager set) to view profiles + role assignments, so
-- assignment dropdowns work without falling back to the service-
-- role key. Admins keep access via has_role.
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.is_content_staff(auth.uid())
  );

DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.is_content_staff(auth.uid())
  );
