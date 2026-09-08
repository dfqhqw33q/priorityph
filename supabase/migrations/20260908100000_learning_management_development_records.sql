-- Learning Management stores only relevant development information from finalized evaluations.
CREATE TABLE IF NOT EXISTS public.development_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  source_evaluation_id uuid REFERENCES public.evaluations(id) ON DELETE SET NULL,
  source_key text NOT NULL DEFAULT gen_random_uuid()::text,
  development_need text NOT NULL CHECK (length(btrim(development_need)) > 0),
  development_activity text NOT NULL CHECK (development_activity IN ('Coaching', 'Mentoring', 'Self-Development', 'External Learning', 'External Training')),
  status text NOT NULL DEFAULT 'Recommended' CHECK (status IN ('Recommended', 'Ongoing', 'Completed')),
  record_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text NOT NULL DEFAULT '',
  is_system_generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_evaluation_id, source_key)
);

CREATE INDEX IF NOT EXISTS idx_development_records_employee ON public.development_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_development_records_status ON public.development_records(status);
CREATE INDEX IF NOT EXISTS idx_development_records_activity ON public.development_records(development_activity);

DROP TRIGGER IF EXISTS trg_development_records_updated ON public.development_records;
CREATE TRIGGER trg_development_records_updated BEFORE UPDATE ON public.development_records
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.permissions(code, module, description)
VALUES
  ('learning.view', 'Learning Management', 'View development records'),
  ('learning.manage', 'Learning Management', 'Create and maintain development records')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions(role_code, permission_code)
VALUES ('HR', 'learning.view'), ('HR', 'learning.manage')
ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.development_records TO authenticated;
ALTER TABLE public.development_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HR can view development records" ON public.development_records;
CREATE POLICY "HR can view development records" ON public.development_records
FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'learning.view'));

DROP POLICY IF EXISTS "HR can create development records" ON public.development_records;
CREATE POLICY "HR can create development records" ON public.development_records
FOR INSERT TO authenticated
WITH CHECK (public.has_permission(auth.uid(), 'learning.manage'));

DROP POLICY IF EXISTS "HR can update development records" ON public.development_records;
CREATE POLICY "HR can update development records" ON public.development_records
FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'learning.manage'))
WITH CHECK (public.has_permission(auth.uid(), 'learning.manage'));