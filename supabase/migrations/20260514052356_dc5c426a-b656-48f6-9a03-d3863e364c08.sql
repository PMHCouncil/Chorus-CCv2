
-- Add assignment metadata columns to submissions.
-- Note: project already has `assigned_to` for the assignee; we keep that and
-- add `assigned_at` / `assigned_by` for full assignment tracking.
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS submissions_assigned_to_idx ON public.submissions (assigned_to);

-- SECURITY DEFINER assignment helper. Allows admin/hr/exec to (re)assign
-- without granting exec broader update rights via RLS.
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
  IF NOT (
    public.has_role(_uid, 'admin'::app_role)
    OR public.has_role(_uid, 'hr'::app_role)
    OR public.has_role(_uid, 'exec'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorised to assign submissions';
  END IF;

  -- Capture before-state for audit
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
