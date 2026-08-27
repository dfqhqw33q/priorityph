-- Phase 10 permissions for reports and President finalization.
INSERT INTO public.role_permissions (role_code, permission_code) VALUES
  ('HR', 'reports.view'),
  ('PRESIDENT', 'evaluations.finalize')
ON CONFLICT DO NOTHING;