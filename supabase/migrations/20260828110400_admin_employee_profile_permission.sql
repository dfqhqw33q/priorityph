-- Employee profile management reads the employee directory while managing profiles.
INSERT INTO public.role_permissions (role_code, permission_code)
VALUES ('ADMINISTRATOR', 'employees.view')
ON CONFLICT DO NOTHING;