-- Tighten exec_redactions so each viewer can only ever see / write / delete
-- their own redaction keywords. Previously the "Content staff view" /
-- "Editors manage" policies were broader than they needed to be — a user
-- could in theory query another user's keyword list. The per-user scope is
-- both the security boundary and what every consumer of the table actually
-- wants.

DROP POLICY IF EXISTS "Content staff view exec_redactions" ON public.exec_redactions;
DROP POLICY IF EXISTS "Editors manage exec_redactions" ON public.exec_redactions;
DROP POLICY IF EXISTS "All staff view exec_redactions" ON public.exec_redactions;
DROP POLICY IF EXISTS "Admin manage exec_redactions" ON public.exec_redactions;

-- A viewer can only see and modify their own redactions. Admins are
-- intentionally excluded (they don't read content, so they have no use for
-- a per-user mask list either).
CREATE POLICY "Owners view own redactions" ON public.exec_redactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_content_staff(auth.uid()));

CREATE POLICY "Owners insert own redactions" ON public.exec_redactions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_content_staff(auth.uid()));

CREATE POLICY "Owners update own redactions" ON public.exec_redactions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_content_staff(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_content_staff(auth.uid()));

CREATE POLICY "Owners delete own redactions" ON public.exec_redactions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.is_content_staff(auth.uid()));
