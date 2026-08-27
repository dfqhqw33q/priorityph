-- Advisory AI output belongs to the existing annual evaluation record.
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS ai_analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_source_version integer;

GRANT SELECT ON public.evaluations TO authenticated;

INSERT INTO public.role_permissions (role_code, permission_code) VALUES
  ('PRESIDENT', 'evaluations.finalize')
ON CONFLICT DO NOTHING;