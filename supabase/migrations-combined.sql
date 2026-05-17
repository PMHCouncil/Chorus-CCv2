-- Chorus Insights: combined migration bundle
-- Generated from supabase/migrations/ (17 files, in order)


-- ========================================================
-- 20260514005216_906d2496-04fd-4ae1-8534-95171d6352af.sql
-- ========================================================

-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'hr', 'exec');
CREATE TYPE public.submission_source AS ENUM ('form', 'email', 'cc', 'other');
CREATE TYPE public.submission_status AS ENUM ('new', 'classified', 'themed', 'responded', 'sent');
CREATE TYPE public.division AS ENUM (
  'Corporate Services',
  'Community Planning & Environment',
  'Community Infrastructure',
  'Community Utilities',
  'Multiple',
  'N/A'
);
CREATE TYPE public.principle_tag AS ENUM (
  'Customer focus',
  'Business sustainability',
  'Alignment with strategy',
  'Flexibility agility and balance',
  'Improving efficiency and reducing duplication',
  'Reducing risk',
  'Maintaining workforce engagement'
);
CREATE TYPE public.sentiment AS ENUM ('Supportive', 'Neutral', 'Concerned', 'Opposing');
CREATE TYPE public.feedback_type AS ENUM ('Placement', 'Role design', 'Transition concern', 'Principles', 'FAQ-able question', 'Other');
CREATE TYPE public.response_status AS ENUM ('draft', 'hr_reviewed', 'exec_approved', 'sent');
CREATE TYPE public.decision_status AS ENUM ('Acknowledged', 'Under consideration', 'Change agreed', 'No change');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role helper
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Submissions
CREATE TABLE public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source public.submission_source NOT NULL DEFAULT 'form',
  submitter_name TEXT,
  submitter_email TEXT,
  submitter_role TEXT,
  content TEXT NOT NULL,
  raw_data JSONB,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status public.submission_status NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- Classifications
CREATE TABLE public.classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  division public.division,
  role_affected TEXT,
  principle_tag public.principle_tag,
  sentiment public.sentiment,
  feedback_type public.feedback_type,
  ai_confidence REAL,
  human_verified BOOLEAN NOT NULL DEFAULT false,
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.classifications ENABLE ROW LEVEL SECURITY;

-- Themes
CREATE TABLE public.themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  summary TEXT,
  submission_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;

-- Submission <-> theme join
CREATE TABLE public.submission_themes (
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  confidence REAL,
  PRIMARY KEY (submission_id, theme_id)
);
ALTER TABLE public.submission_themes ENABLE ROW LEVEL SECURITY;

-- Responses
CREATE TABLE public.responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  draft_text TEXT NOT NULL,
  status public.response_status NOT NULL DEFAULT 'draft',
  reviewer UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  sent_at TIMESTAMPTZ,
  change_made BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

-- Decisions
CREATE TABLE public.decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  status public.decision_status NOT NULL,
  notes TEXT,
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;

-- Audit log
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Exec redactions
CREATE TABLE public.exec_redactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redacted_keyword TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.exec_redactions ENABLE ROW LEVEL SECURITY;

-- ============ RLS POLICIES ============

-- Profiles: users see own, admins see all
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

-- User roles: users see own roles, admins manage all
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Submissions: admin + hr full read/write; exec no direct submission access (sees themes only)
CREATE POLICY "Admin/HR view submissions" ON public.submissions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));
CREATE POLICY "Admin/HR insert submissions" ON public.submissions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));
CREATE POLICY "Admin/HR update submissions" ON public.submissions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));
CREATE POLICY "Admin delete submissions" ON public.submissions
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Classifications: admin + hr full
CREATE POLICY "Admin/HR view classifications" ON public.classifications
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));
CREATE POLICY "Admin/HR write classifications" ON public.classifications
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

-- Themes: all roles can read; admin/hr write
CREATE POLICY "All staff view themes" ON public.themes
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'exec')
  );
CREATE POLICY "Admin/HR write themes" ON public.themes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

-- Submission_themes: same as themes
CREATE POLICY "All staff view submission_themes" ON public.submission_themes
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'exec')
  );
CREATE POLICY "Admin/HR write submission_themes" ON public.submission_themes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

-- Responses: admin/hr full; exec can view + approve
CREATE POLICY "Admin/HR/Exec view responses" ON public.responses
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'exec')
  );
CREATE POLICY "Admin/HR write responses" ON public.responses
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));
CREATE POLICY "Admin/HR/Exec update responses" ON public.responses
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'exec')
  );
CREATE POLICY "Admin delete responses" ON public.responses
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Decisions: all roles read; exec/admin write
CREATE POLICY "All staff view decisions" ON public.decisions
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'exec')
  );
CREATE POLICY "Admin/Exec write decisions" ON public.decisions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'exec'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'exec'));

-- Audit log: admin full; hr/exec read only
CREATE POLICY "All staff view audit_log" ON public.audit_log
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'exec')
  );
CREATE POLICY "Authenticated insert audit_log" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Exec redactions: admin manages
CREATE POLICY "All staff view exec_redactions" ON public.exec_redactions
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'exec')
  );
CREATE POLICY "Admin manage exec_redactions" ON public.exec_redactions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));


-- ========================================================
-- 20260514005242_ce3ecfab-ca00-4c1f-a509-fecdc6ef204f.sql
-- ========================================================

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;


-- ========================================================
-- 20260514005312_8ddf43c9-8c9e-4006-ae7f-8b8a2e17536b.sql
-- ========================================================

CREATE OR REPLACE FUNCTION public.bootstrap_test_role(_role public.app_role)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email TEXT;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  IF _email IS NULL OR _email NOT LIKE '%@pmhc.test' THEN
    RAISE EXCEPTION 'Bootstrap only allowed for @pmhc.test test accounts';
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), _role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bootstrap_test_role(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_test_role(public.app_role) TO authenticated;


-- ========================================================
-- 20260514010612_cd38dd28-7464-40f4-9b87-76215fba908b.sql
-- ========================================================
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;

-- ========================================================
-- 20260514010919_88eb3f48-b898-4b3b-a168-4692a804fe54.sql
-- ========================================================

CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/HR view settings" ON public.app_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

CREATE POLICY "Admin manage settings" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.app_settings (key, value) VALUES
('classifier_model', 'claude-sonnet-4-6'),
('classifier_system_prompt', 'You are an analyst supporting Port Macquarie-Hastings Council during a Clause 42 organisational restructure consultation (12 May to 12 June 2026).

Your job: read a single staff feedback submission and classify it.

Return ONLY valid JSON matching this schema (no commentary, no markdown):
{
  "sentiment": "Supportive" | "Neutral" | "Concerned" | "Opposing",
  "division": "Corporate Services" | "Community Planning & Environment" | "Community Infrastructure" | "Community Utilities" | "Multiple" | "N/A",
  "feedback_type": "Placement" | "Role design" | "Transition concern" | "Principles" | "FAQ-able question" | "Other",
  "principle_tag": "Customer focus" | "Business sustainability" | "Alignment with strategy" | "Flexibility agility and balance" | "Improving efficiency and reducing duplication" | "Reducing risk" | "Maintaining workforce engagement" | null,
  "role_affected": string | null,
  "themes": [short string, ...],
  "summary": "one-sentence neutral summary",
  "confidence": 0.0 to 1.0
}

Guidance:
- "themes" should be 1-3 short noun phrases (e.g. "redundancy fears", "manager span of control").
- Be cautious; choose Neutral and lower confidence when unclear.
- Stay factual and non-judgmental.');


-- ========================================================
-- 20260514012208_d90ad8a5-c020-4a94-936b-97ac26d7a9ce.sql
-- ========================================================

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


-- ========================================================
-- 20260514012230_0314aa57-a6a7-419e-8c8f-cc8602fe4363.sql
-- ========================================================

REVOKE EXECUTE ON FUNCTION public.update_theme_submission_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_themes(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_themes(uuid, uuid) TO authenticated;


-- ========================================================
-- 20260514031414_d37598dc-9ac7-435d-932c-a2095f98ad73.sql
-- ========================================================

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


-- ========================================================
-- 20260514040757_722c58ea-bf8a-4770-b516-2e30754fd09e.sql
-- ========================================================
-- Add assignment + archive fields for bulk inbox actions
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_submissions_assigned_to ON public.submissions(assigned_to);
CREATE INDEX IF NOT EXISTS idx_submissions_archived_at ON public.submissions(archived_at);

-- ========================================================
-- 20260514040831_4ff30a86-b3e8-4467-9350-36a93479e552.sql
-- ========================================================
-- Let staff (admin/hr/exec) view all profiles for assignment UI
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users and staff view profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'exec'::app_role)
  );

-- Same for user_roles so we can identify staff
DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users and staff view roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'exec'::app_role)
  );

-- ========================================================
-- 20260514051612_3165891e-c638-4954-b7f1-e98f1024ae7d.sql
-- ========================================================

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


-- ========================================================
-- 20260514051629_cb52d3ec-9bae-46c1-ae64-ea1f64f094a7.sql
-- ========================================================

REVOKE EXECUTE ON FUNCTION public.refresh_theme_submission_counts() FROM PUBLIC, anon, authenticated;


-- ========================================================
-- 20260514051712_7f66fe52-eef5-43b7-97ab-a420e3185e1a.sql
-- ========================================================

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


-- ========================================================
-- 20260514052356_dc5c426a-b656-48f6-9a03-d3863e364c08.sql
-- ========================================================

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


-- ========================================================
-- 20260514053837_4b049a78-fbd7-4747-aaac-c2f7f6ca5916.sql
-- ========================================================
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gm';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gm_ea';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'director';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'group_manager';

-- ========================================================
-- 20260514053931_0eb6a038-3ace-4ab1-ae7b-ff9da55dc456.sql
-- ========================================================
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

-- ========================================================
-- 20260514055348_ceba10a7-7437-41de-8cdc-54322247557e.sql
-- ========================================================
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
