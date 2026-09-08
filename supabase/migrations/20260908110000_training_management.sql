-- Training Management tracks third-party training recommendations and requirements only.
CREATE TABLE IF NOT EXISTS public.training_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  source_evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE RESTRICT,
  training_title text NOT NULL CHECK (length(btrim(training_title)) > 0),
  related_competency text NOT NULL DEFAULT '',
  source text NOT NULL CHECK (source IN ('Gemini recommendation', 'Performance Evaluation', 'Competency Gap')),
  recommendation text NOT NULL CHECK (length(btrim(recommendation)) > 0),
  status text NOT NULL DEFAULT 'Recommended' CHECK (status = 'Recommended'),
  source_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_evaluation_id, source_key)
);

CREATE TABLE IF NOT EXISTS public.training_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  source_evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE RESTRICT,
  training_title text NOT NULL CHECK (length(btrim(training_title)) > 0),
  provider text NOT NULL DEFAULT '',
  training_date date,
  status text NOT NULL DEFAULT 'Required' CHECK (status IN ('Required', 'Approved', 'Completed')),
  related_competency text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  source_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_evaluation_id, source_key)
);

CREATE INDEX IF NOT EXISTS idx_training_recommendations_employee ON public.training_recommendations(employee_id);
CREATE INDEX IF NOT EXISTS idx_training_records_employee ON public.training_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_training_records_status ON public.training_records(status);

DROP TRIGGER IF EXISTS trg_training_recommendations_updated ON public.training_recommendations;
CREATE TRIGGER trg_training_recommendations_updated BEFORE UPDATE ON public.training_recommendations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_training_records_updated ON public.training_records;
CREATE TRIGGER trg_training_records_updated BEFORE UPDATE ON public.training_records
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.permissions(code, module, description)
VALUES
  ('training.view', 'Training Management', 'View training recommendations and records'),
  ('training.manage', 'Training Management', 'Maintain third-party training records')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions(role_code, permission_code)
VALUES ('HR', 'training.view'), ('HR', 'training.manage')
ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.training_recommendations, public.training_records TO authenticated;
ALTER TABLE public.training_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR can view training recommendations" ON public.training_recommendations
FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'training.view'));
CREATE POLICY "HR can view training records" ON public.training_records
FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'training.view'));
CREATE POLICY "HR can manage training records" ON public.training_records
FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), 'training.manage'));
CREATE POLICY "HR can update training records" ON public.training_records
FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'training.manage'))
WITH CHECK (public.has_permission(auth.uid(), 'training.manage'));