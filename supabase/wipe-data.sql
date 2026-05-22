-- Wipe all content data from the Chorus database.
--
-- Removes every row from the content tables (submissions and everything
-- derived from them) while leaving accounts and configuration intact:
--   KEPT:    auth.users, profiles, user_roles, app_settings
--   CLEARED: submissions, classifications, themes, submission_themes,
--            responses, decisions, exec_redactions, audit_log
--
-- This is destructive and irreversible. Take a database backup first.
--
-- Run via the Supabase SQL editor, or:
--   supabase db execute --file supabase/wipe-data.sql
--
-- All eight tables are truncated in a single statement so foreign-key
-- dependencies between them are satisfied regardless of order. CASCADE
-- covers any inter-table reference; RESTART IDENTITY resets sequences.

BEGIN;

TRUNCATE TABLE
  public.classifications,
  public.submission_themes,
  public.responses,
  public.decisions,
  public.exec_redactions,
  public.audit_log,
  public.themes,
  public.submissions
RESTART IDENTITY CASCADE;

COMMIT;
