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

GRANT SELECT ON public.employee_documents TO authenticated;
GRANT ALL ON public.employee_documents TO service_role;
