ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS assigned_supervisor_user_id uuid
    REFERENCES public.internal_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hire_date date;

CREATE INDEX IF NOT EXISTS idx_employees_assigned_supervisor
  ON public.employees(assigned_supervisor_user_id, employment_status);

INSERT INTO public.roles(code, name, description)
VALUES ('EMPLOYEE', 'Employee', 'Accesses personal performance information')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.permissions(code, module, description)
VALUES
  ('employees.view_self', 'Employees', 'View own employee profile'),
  ('employees.view_team', 'Employees', 'View employees assigned to the signed-in supervisor')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions(role_code, permission_code)
VALUES
  ('EMPLOYEE', 'employees.view_self'),
  ('SUPERVISOR', 'employees.view_team')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_portal_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _role IN ('EMPLOYEE', 'SUPERVISOR')
    AND public.is_account_usable(_user_id)
    AND (
      SELECT COUNT(*)
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
    ) = 1
    AND public.has_role(_user_id, _role);
$$;

REVOKE ALL ON FUNCTION public.has_portal_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_portal_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.validate_employee_supervisor_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_supervisor_user_id IS NOT NULL
     AND (
       NOT public.has_portal_role(NEW.assigned_supervisor_user_id, 'SUPERVISOR')
       OR NOT public.is_account_usable(NEW.assigned_supervisor_user_id)
     ) THEN
    RAISE EXCEPTION 'Assigned employee supervisor must have an active Supervisor role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_employee_supervisor_assignment ON public.employees;
CREATE TRIGGER trg_validate_employee_supervisor_assignment
  BEFORE INSERT OR UPDATE OF assigned_supervisor_user_id ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_employee_supervisor_assignment();

DROP POLICY IF EXISTS "employees viewable with permission" ON public.employees;
CREATE POLICY "employees viewable by self or assigned supervisor"
  ON public.employees
  FOR SELECT
  TO authenticated
  USING (
    (
      user_id = auth.uid()
      AND employment_status = 'ACTIVE'
      AND assigned_supervisor_user_id IS NOT NULL
      AND public.is_account_usable(auth.uid())
      AND public.has_portal_role(assigned_supervisor_user_id, 'SUPERVISOR')
      AND public.is_account_usable(assigned_supervisor_user_id)
      AND (
        public.has_portal_role(auth.uid(), 'EMPLOYEE')
        OR public.has_portal_role(auth.uid(), 'SUPERVISOR')
      )
    )
    OR (
      assigned_supervisor_user_id = auth.uid()
      AND employment_status = 'ACTIVE'
      AND public.is_account_usable(auth.uid())
      AND public.has_portal_role(auth.uid(), 'SUPERVISOR')
    )
  );
