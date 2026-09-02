-- Minimal Digital Employee File metadata and private document storage.
CREATE TABLE IF NOT EXISTS public.employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  evaluation_id uuid REFERENCES public.evaluations(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('PERFORMANCE_EVALUATIONS','AWARDS_RECOGNITION','TRAINING_CERTIFICATES','SUPPORTING_DOCUMENTS','OTHER_DOCUMENTS')),
  file_name text NOT NULL CHECK (length(btrim(file_name)) > 0),
  storage_path text NOT NULL UNIQUE,
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  file_size integer NOT NULL DEFAULT 0 CHECK (file_size >= 0),
  created_by uuid REFERENCES public.internal_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_documents_employee ON public.employee_documents(employee_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_documents_evaluation ON public.employee_documents(evaluation_id);

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.employee_documents TO authenticated;
GRANT ALL ON public.employee_documents TO service_role;

DROP POLICY IF EXISTS "employee documents viewable with employee access" ON public.employee_documents;
CREATE POLICY "employee documents viewable with employee access" ON public.employee_documents FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'employees.view') OR public.has_permission(auth.uid(), 'evaluations.view_history'));

INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-files', 'employee-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "employee files readable with employee access" ON storage.objects;
CREATE POLICY "employee files readable with employee access" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'employee-files' AND (public.has_permission(auth.uid(), 'employees.view') OR public.has_permission(auth.uid(), 'evaluations.view_history')));

ALTER TABLE public.employee_documents
  ADD COLUMN IF NOT EXISTS evaluation_version integer;

CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_documents_finalized_evaluation
  ON public.employee_documents (evaluation_id)
  WHERE evaluation_id IS NOT NULL AND category = 'PERFORMANCE_EVALUATIONS';

CREATE INDEX IF NOT EXISTS idx_employee_documents_finalized_version
  ON public.employee_documents (evaluation_id, evaluation_version);

ALTER TABLE public.employee_documents
  ALTER COLUMN evaluation_version SET DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.ensure_finalized_evaluation_document()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.category = 'PERFORMANCE_EVALUATIONS' AND NEW.evaluation_id IS NOT NULL THEN
    NEW.evaluation_version = COALESCE(NEW.evaluation_version, (
      SELECT version
      FROM public.evaluations
      WHERE id = NEW.evaluation_id
      LIMIT 1
    ));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_documents_evaluation_version ON public.employee_documents;
CREATE TRIGGER trg_employee_documents_evaluation_version
BEFORE INSERT OR UPDATE OF category, evaluation_id, evaluation_version
ON public.employee_documents
FOR EACH ROW
EXECUTE FUNCTION public.ensure_finalized_evaluation_document();
