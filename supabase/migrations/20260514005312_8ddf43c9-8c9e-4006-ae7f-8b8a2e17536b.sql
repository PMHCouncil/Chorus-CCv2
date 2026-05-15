
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
