-- Succession Planning organizes career and transfer information from finalized evaluations.
CREATE TABLE IF NOT EXISTS public.succession_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE RESTRICT,
  source_evaluation_id uuid NOT NULL UNIQUE REFERENCES public.evaluations(id) ON DELETE RESTRICT,
  development_potential text NOT NULL DEFAULT '',
  advancement_outlook text NOT NULL DEFAULT '',
  career_interest text NOT NULL DEFAULT '',
  transfer_interest text NOT NULL DEFAULT '',
  desired_job text NOT NULL DEFAULT '',
  desired_location text NOT NULL DEFAULT '',
  qualification text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_succession_profiles_employee ON public.succession_profiles(employee_id);

DROP TRIGGER IF EXISTS trg_succession_profiles_updated ON public.succession_profiles;
CREATE TRIGGER trg_succession_profiles_updated BEFORE UPDATE ON public.succession_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.permissions(code, module, description)
VALUES
  ('succession.view', 'Succession Planning', 'View Career and Succession Profiles'),
  ('succession.manage', 'Succession Planning', 'Maintain Career and Succession Profile notes')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions(role_code, permission_code)
VALUES
  ('HR', 'succession.view'),
  ('HR', 'succession.manage'),
  ('PRESIDENT', 'succession.view'),
  ('ADMINISTRATOR', 'succession.view')
ON CONFLICT DO NOTHING;

GRANT SELECT, UPDATE ON public.succession_profiles TO authenticated;
ALTER TABLE public.succession_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized management can view succession profiles" ON public.succession_profiles
FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'succession.view'));

CREATE POLICY "Authorized HR can update succession profiles" ON public.succession_profiles
FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'succession.manage'))
WITH CHECK (public.has_permission(auth.uid(), 'succession.manage'));