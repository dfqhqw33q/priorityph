INSERT INTO public.role_permissions(role_code, permission_code)
VALUES ('HR', 'performance.hr_validation.finalize')
ON CONFLICT DO NOTHING;
