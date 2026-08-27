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

DROP POLICY IF EXISTS "employee files readable with employee access" ON storage.objects;
CREATE POLICY "employee files readable with employee access" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'employee-files' AND (public.has_permission(auth.uid(), 'employees.view') OR public.has_permission(auth.uid(), 'evaluations.view_history')));