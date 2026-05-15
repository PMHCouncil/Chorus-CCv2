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