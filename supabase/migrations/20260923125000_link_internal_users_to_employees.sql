ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.internal_users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_user_id
  ON public.employees(user_id)
  WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_internal_user_employee(_user_id uuid)
RETURNS public.employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_row public.internal_users;
  employee_row public.employees;
  matching_count integer;
BEGIN
  SELECT * INTO user_row FROM public.internal_users WHERE id = _user_id;
  IF user_row.id IS NULL THEN RAISE EXCEPTION 'Internal user does not exist'; END IF;

  SELECT * INTO employee_row
  FROM public.employees
  WHERE user_id = _user_id
  FOR UPDATE;
  IF employee_row.id IS NOT NULL THEN RETURN employee_row; END IF;

  SELECT COUNT(*) INTO matching_count
  FROM public.employees
  WHERE user_id IS NULL
    AND lower(btrim(full_name)) = lower(btrim(user_row.full_name));

  IF matching_count = 1 THEN
    UPDATE public.employees
    SET user_id = _user_id
    WHERE user_id IS NULL
      AND lower(btrim(full_name)) = lower(btrim(user_row.full_name))
    RETURNING * INTO employee_row;
    RETURN employee_row;
  END IF;

  INSERT INTO public.employees(
    user_id, full_name, first_name, middle_name, last_name, job_title, division, section
  )
  VALUES (
    _user_id,
    user_row.full_name,
    split_part(btrim(user_row.full_name), ' ', 1),
    '',
    CASE
      WHEN position(' ' IN btrim(user_row.full_name)) > 0
      THEN reverse(split_part(reverse(btrim(user_row.full_name)), ' ', 1))
      ELSE btrim(user_row.full_name)
    END,
    COALESCE(user_row.job_title, ''),
    '',
    ''
  )
  RETURNING * INTO employee_row;
  RETURN employee_row;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_internal_user_employee(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_internal_user_employee(uuid) TO service_role;

DO $$
DECLARE
  user_row record;
BEGIN
  FOR user_row IN SELECT id FROM public.internal_users ORDER BY created_at, id LOOP
    PERFORM public.ensure_internal_user_employee(user_row.id);
  END LOOP;
END $$;

INSERT INTO public.audit_logs(action, module, entity_type, entity_id, employee_id, new_value, result)
SELECT
  'INTERNAL_USER_EMPLOYEE_LINKED',
  'User Management',
  'internal_user',
  u.id,
  e.id,
  jsonb_build_object('employee_number', e.employee_number),
  'SUCCESS'
FROM public.internal_users u
JOIN public.employees e ON e.user_id = u.id
WHERE e.created_at >= (SELECT COALESCE(MIN(created_at), now()) FROM public.internal_users);
