-- ============================================================
-- Helper functions
-- ============================================================

-- Returns true if user has any role that is allowed to read/handle submission content.
-- Explicitly EXCLUDES 'admin' as a hard conflict-of-interest boundary.
CREATE OR REPLACE FUNCTION public.is_content_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('hr','exec','gm','gm_ea','director','group_manager')
  )
$$;

-- Returns true if user can write submissions/themes/classifications (editor tier).
CREATE OR REPLACE FUNCTION public.is_content_editor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('hr','gm','gm_ea','director')
  )
$$;

-- Returns true if user can approve responses / write decisions (approver tier).
CREATE OR REPLACE FUNCTION public.is_content_approver(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('gm','director','exec')
  )
$$;

-- ============================================================
-- submissions
-- ============================================================
DROP POLICY IF EXISTS "Admin/HR view submissions" ON public.submissions;
DROP POLICY IF EXISTS "Admin/HR insert submissions" ON public.submissions;
DROP POLICY IF EXISTS "Admin/HR update submissions" ON public.submissions;
DROP POLICY IF EXISTS "Admin delete submissions" ON public.submissions;

CREATE POLICY "Content staff view submissions" ON public.submissions
  FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

CREATE POLICY "Editors insert submissions" ON public.submissions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_content_editor(auth.uid()));

CREATE POLICY "Editors update submissions" ON public.submissions
  FOR UPDATE TO authenticated
  USING (public.is_content_editor(auth.uid()));

CREATE POLICY "Editors delete submissions" ON public.submissions
  FOR DELETE TO authenticated
  USING (public.is_content_editor(auth.uid()));

-- ============================================================
-- classifications
-- ============================================================
DROP POLICY IF EXISTS "Admin/HR view classifications" ON public.classifications;
DROP POLICY IF EXISTS "Admin/HR write classifications" ON public.classifications;

CREATE POLICY "Content staff view classifications" ON public.classifications
  FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

CREATE POLICY "Editors write classifications" ON public.classifications
  FOR ALL TO authenticated
  USING (public.is_content_editor(auth.uid()))
  WITH CHECK (public.is_content_editor(auth.uid()));

-- ============================================================
-- themes
-- ============================================================
DROP POLICY IF EXISTS "All staff view themes" ON public.themes;
DROP POLICY IF EXISTS "Admin/HR write themes" ON public.themes;

CREATE POLICY "Content staff view themes" ON public.themes
  FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

CREATE POLICY "Editors write themes" ON public.themes
  FOR ALL TO authenticated
  USING (public.is_content_editor(auth.uid()))
  WITH CHECK (public.is_content_editor(auth.uid()));

-- ============================================================
-- submission_themes
-- ============================================================
DROP POLICY IF EXISTS "All staff view submission_themes" ON public.submission_themes;
DROP POLICY IF EXISTS "Admin/HR write submission_themes" ON public.submission_themes;

CREATE POLICY "Content staff view submission_themes" ON public.submission_themes
  FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

CREATE POLICY "Editors write submission_themes" ON public.submission_themes
  FOR ALL TO authenticated
  USING (public.is_content_editor(auth.uid()))
  WITH CHECK (public.is_content_editor(auth.uid()));

-- ============================================================
-- responses
-- ============================================================
DROP POLICY IF EXISTS "Admin/HR/Exec view responses" ON public.responses;
DROP POLICY IF EXISTS "Admin/HR write responses" ON public.responses;
DROP POLICY IF EXISTS "Admin/HR/Exec update responses" ON public.responses;
DROP POLICY IF EXISTS "Admin delete responses" ON public.responses;

CREATE POLICY "Content staff view responses" ON public.responses
  FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

CREATE POLICY "Editors draft responses" ON public.responses
  FOR INSERT TO authenticated
  WITH CHECK (public.is_content_editor(auth.uid()));

CREATE POLICY "Editors and approvers update responses" ON public.responses
  FOR UPDATE TO authenticated
  USING (public.is_content_editor(auth.uid()) OR public.is_content_approver(auth.uid()));

CREATE POLICY "Editors delete responses" ON public.responses
  FOR DELETE TO authenticated
  USING (public.is_content_editor(auth.uid()));

-- ============================================================
-- decisions
-- ============================================================
DROP POLICY IF EXISTS "All staff view decisions" ON public.decisions;
DROP POLICY IF EXISTS "Admin/Exec write decisions" ON public.decisions;

CREATE POLICY "Content staff view decisions" ON public.decisions
  FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

CREATE POLICY "Approvers write decisions" ON public.decisions
  FOR ALL TO authenticated
  USING (public.is_content_approver(auth.uid()))
  WITH CHECK (public.is_content_approver(auth.uid()));

-- ============================================================
-- exec_redactions: keep admin out (it references content-related decisions)
-- ============================================================
DROP POLICY IF EXISTS "All staff view exec_redactions" ON public.exec_redactions;
DROP POLICY IF EXISTS "Admin manage exec_redactions" ON public.exec_redactions;

CREATE POLICY "Content staff view exec_redactions" ON public.exec_redactions
  FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

CREATE POLICY "Editors manage exec_redactions" ON public.exec_redactions
  FOR ALL TO authenticated
  USING (public.is_content_editor(auth.uid()))
  WITH CHECK (public.is_content_editor(auth.uid()));

-- ============================================================
-- Update existing RPCs to use the new helpers
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_submissions(_ids uuid[], _assignee uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _prev_rows jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_content_editor(_uid) THEN
    RAISE EXCEPTION 'Not authorised to assign submissions';
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'assigned_to', assigned_to))
    INTO _prev_rows
    FROM public.submissions
   WHERE id = ANY(_ids);

  UPDATE public.submissions
     SET assigned_to = _assignee,
         assigned_at = CASE WHEN _assignee IS NULL THEN NULL ELSE now() END,
         assigned_by = CASE WHEN _assignee IS NULL THEN NULL ELSE _uid END
   WHERE id = ANY(_ids);

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details)
  SELECT _uid,
         'submission.assignment_changed',
         'submission',
         (e->>'id')::uuid,
         jsonb_build_object(
           'before', e->'assigned_to',
           'after', to_jsonb(_assignee)
         )
    FROM jsonb_array_elements(COALESCE(_prev_rows, '[]'::jsonb)) e;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_themes(_source_id uuid, _target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_content_editor(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised to merge themes';
  END IF;
  IF _source_id = _target_id THEN
    RAISE EXCEPTION 'Source and target themes must differ';
  END IF;
  UPDATE public.submission_themes st
     SET theme_id = _target_id
   WHERE st.theme_id = _source_id
     AND NOT EXISTS (
       SELECT 1 FROM public.submission_themes x
        WHERE x.submission_id = st.submission_id
          AND x.theme_id = _target_id
     );
  DELETE FROM public.submission_themes WHERE theme_id = _source_id;
  DELETE FROM public.themes WHERE id = _source_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_theme_submission_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_content_editor(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised to refresh theme counts';
  END IF;
  UPDATE public.themes t
     SET submission_count = COALESCE(c.cnt, 0)
    FROM (
      SELECT th.id, COUNT(st.submission_id) AS cnt
        FROM public.themes th
        LEFT JOIN public.submission_themes st ON st.theme_id = th.id
        LEFT JOIN public.submissions s ON s.id = st.submission_id AND s.archived_at IS NULL
       GROUP BY th.id
    ) c
   WHERE t.id = c.id;
END;
$$;

-- ============================================================
-- app_settings: developer_mode key
-- ============================================================
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('developer_mode_enabled', 'false', now())
ON CONFLICT (key) DO NOTHING;