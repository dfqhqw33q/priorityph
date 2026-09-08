-- Social Recognition is a reviewable support subsystem based on finalized evaluations.
CREATE TABLE IF NOT EXISTS public.recognition_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  source_evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE RESTRICT,
  recognition_type text NOT NULL CHECK (recognition_type IN ('Highest Rated Employee', 'Most Improved Employee', 'Outstanding Performance', 'Other Recognition')),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by uuid REFERENCES public.internal_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text NOT NULL DEFAULT '',
  source_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_evaluation_id, source_key)
);

CREATE TABLE IF NOT EXISTS public.recognition_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL UNIQUE REFERENCES public.recognition_candidates(id) ON DELETE RESTRICT,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  source_evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE RESTRICT,
  recognition_type text NOT NULL CHECK (recognition_type IN ('Highest Rated Employee', 'Most Improved Employee', 'Outstanding Performance', 'Other Recognition')),
  reason text NOT NULL,
  recognition_date date NOT NULL DEFAULT CURRENT_DATE,
  approved_by uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'APPROVED' CHECK (status = 'APPROVED'),
  certificate_generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recognition_candidates_employee ON public.recognition_candidates(employee_id);
CREATE INDEX IF NOT EXISTS idx_recognition_candidates_status ON public.recognition_candidates(status);
CREATE INDEX IF NOT EXISTS idx_recognition_records_employee ON public.recognition_records(employee_id);

DROP TRIGGER IF EXISTS trg_recognition_candidates_updated ON public.recognition_candidates;
CREATE TRIGGER trg_recognition_candidates_updated BEFORE UPDATE ON public.recognition_candidates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_recognition_records_updated ON public.recognition_records;
CREATE TRIGGER trg_recognition_records_updated BEFORE UPDATE ON public.recognition_records
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.permissions(code, module, description)
VALUES
  ('recognition.view', 'Social Recognition', 'View recognition candidates and history'),
  ('recognition.manage', 'Social Recognition', 'Review and approve recognition candidates')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions(role_code, permission_code)
VALUES
  ('HR', 'recognition.view'), ('HR', 'recognition.manage'),
  ('PRESIDENT', 'recognition.view'), ('PRESIDENT', 'recognition.manage'),
  ('ADMINISTRATOR', 'recognition.view'), ('ADMINISTRATOR', 'recognition.manage')
ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.recognition_candidates, public.recognition_records TO authenticated;
ALTER TABLE public.recognition_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recognition_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Management can view recognition candidates" ON public.recognition_candidates
FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'recognition.view'));
CREATE POLICY "Management can review recognition candidates" ON public.recognition_candidates
FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), 'recognition.manage'));
CREATE POLICY "Management can update recognition candidates" ON public.recognition_candidates
FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'recognition.manage'))
WITH CHECK (public.has_permission(auth.uid(), 'recognition.manage'));
CREATE POLICY "Management can view recognition records" ON public.recognition_records
FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'recognition.view'));
CREATE POLICY "Management can create recognition records" ON public.recognition_records
FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), 'recognition.manage'));
CREATE POLICY "Management can update recognition records" ON public.recognition_records
FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'recognition.manage'))
WITH CHECK (public.has_permission(auth.uid(), 'recognition.manage'));