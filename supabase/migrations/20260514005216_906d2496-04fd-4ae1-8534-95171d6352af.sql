
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
