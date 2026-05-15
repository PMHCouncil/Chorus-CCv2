-- Add assignment + archive fields for bulk inbox actions
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_submissions_assigned_to ON public.submissions(assigned_to);
CREATE INDEX IF NOT EXISTS idx_submissions_archived_at ON public.submissions(archived_at);