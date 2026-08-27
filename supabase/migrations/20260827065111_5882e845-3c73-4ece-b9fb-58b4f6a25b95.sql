-- Employee profiles/records belong to the President (and Administrator) only.
DELETE FROM public.role_permissions
WHERE permission_code = 'employees.view'
  AND role_code IN ('HR', 'SUPERVISOR');

INSERT INTO public.role_permissions (role_code, permission_code)
VALUES ('PRESIDENT', 'employees.view')
ON CONFLICT DO NOTHING;