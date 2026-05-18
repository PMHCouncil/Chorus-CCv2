-- ============================================================
-- PSP routing: a side queue for logistical / "answer-only"
-- submissions that PSP (People Services / partnership team) can
-- close out without putting through the full classify -> theme
-- -> response -> decision workflow.
--
-- A submission is "routed to PSP" when psp_routed_at IS NOT NULL.
-- It is "completed by PSP" when psp_completed_at IS NOT NULL.
-- The inbox query default-excludes (routed AND not completed)
-- rows so they don't clutter the main triage view. The PSP queue
-- page shows them, and "Return to workflow" clears psp_routed_at
-- so the item reappears in the inbox.
-- ============================================================

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS psp_routed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS psp_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS psp_completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS psp_reason TEXT,
  ADD COLUMN IF NOT EXISTS psp_note TEXT;

-- Active PSP queue lookup: open routed items, newest first.
CREATE INDEX IF NOT EXISTS idx_submissions_psp_open
  ON public.submissions (psp_routed_at DESC)
  WHERE psp_routed_at IS NOT NULL AND psp_completed_at IS NULL;

-- Inbox exclusion lookup: skip rows still parked in the PSP queue.
CREATE INDEX IF NOT EXISTS idx_submissions_psp_routed_at
  ON public.submissions (psp_routed_at)
  WHERE psp_routed_at IS NOT NULL;
