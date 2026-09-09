-- Documents, access, and signatures.
-- Consolidated from reviewed repository SQL modules; preserve dependency order.

-- BEGIN 20260827140000_employee_file_documents_and_storage.sql
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
-- END 20260827140000_employee_file_documents_and_storage.sql

-- BEGIN 20260828100000_phase1_profile_verification_signatures.sql
-- Phase 1: employee master profiles, public verification, signatures, and submission safeguards.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS first_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS middle_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_name text NOT NULL DEFAULT '';

UPDATE public.employees
SET first_name = CASE
  WHEN position(' ' in btrim(full_name)) > 0 THEN split_part(btrim(full_name), ' ', 1)
  ELSE btrim(full_name)
END,
last_name = CASE
  WHEN position(' ' in btrim(full_name)) > 0 THEN reverse(split_part(reverse(btrim(full_name)), ' ', 1))
  ELSE btrim(full_name)
END
WHERE first_name = '' OR last_name = '';

CREATE INDEX IF NOT EXISTS idx_employees_identity
  ON public.employees(employee_number, lower(first_name), lower(last_name));

CREATE TABLE IF NOT EXISTS public.employee_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL UNIQUE REFERENCES public.evaluations(id) ON DELETE RESTRICT,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  method text NOT NULL CHECK (method IN ('UPLOAD', 'DRAWN')),
  storage_path text,
  signature_data text,
  content_type text,
  file_size integer,
  signed_at timestamptz NOT NULL DEFAULT now(),
  source_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((method = 'UPLOAD' AND storage_path IS NOT NULL AND signature_data IS NULL)
      OR (method = 'DRAWN' AND signature_data IS NOT NULL AND storage_path IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_employee_signatures_employee ON public.employee_signatures(employee_id);

CREATE TABLE IF NOT EXISTS public.public_submission_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid REFERENCES public.evaluation_cycles(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  submission_id uuid,
  device_session_id text,
  attempt_type text NOT NULL CHECK (attempt_type IN ('VERIFICATION', 'SUBMISSION')),
  outcome text NOT NULL CHECK (outcome IN ('SUCCESS', 'DENIED', 'DUPLICATE', 'FAILURE')),
  ip_address text,
  user_agent text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_public_submission_attempts_lookup
  ON public.public_submission_attempts(cycle_id, employee_id, attempt_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_submission_attempts_ip
  ON public.public_submission_attempts(ip_address, occurred_at DESC);

INSERT INTO public.permissions(code, module, description)
VALUES ('employees.manage', 'Employees', 'Create and maintain employee master profiles')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions(role_code, permission_code)
VALUES ('ADMINISTRATOR', 'employees.manage')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role_code, permission_code)
VALUES ('ADMINISTRATOR', 'employees.view')
ON CONFLICT DO NOTHING;

GRANT SELECT ON public.employee_signatures, public.public_submission_attempts TO authenticated;
GRANT ALL ON public.employee_signatures, public.public_submission_attempts TO service_role;

ALTER TABLE public.employee_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_submission_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signatures viewable with employee access" ON public.employee_signatures;
CREATE POLICY "signatures viewable with employee access" ON public.employee_signatures FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'employees.view'));

DROP POLICY IF EXISTS "submission attempts viewable by administrators" ON public.public_submission_attempts;
CREATE POLICY "submission attempts viewable by administrators" ON public.public_submission_attempts FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'audit.view'));

-- Keep the existing cycle/employee uniqueness constraint as the database race-safety boundary.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.evaluations'::regclass AND conname = 'evaluations_cycle_id_employee_id_key'
  ) THEN
    ALTER TABLE public.evaluations ADD CONSTRAINT evaluations_cycle_id_employee_id_key UNIQUE (cycle_id, employee_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.protect_finalized_evaluation_phase1()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.is_finalized THEN
    RAISE EXCEPTION 'Finalized evaluations cannot be modified';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.version = OLD.version + 1;
    RETURN NEW;
  END IF;
  RETURN OLD;
END; $$;
DROP TRIGGER IF EXISTS trg_protect_finalized_phase1 ON public.evaluations;
CREATE TRIGGER trg_protect_finalized_phase1 BEFORE UPDATE OR DELETE ON public.evaluations
FOR EACH ROW EXECUTE FUNCTION public.protect_finalized_evaluation_phase1();

CREATE OR REPLACE FUNCTION public.protect_finalized_signature()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.evaluations e WHERE e.id = OLD.evaluation_id AND e.is_finalized) THEN
    RAISE EXCEPTION 'Finalized signatures cannot be modified';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_protect_finalized_signature ON public.employee_signatures;
CREATE TRIGGER trg_protect_finalized_signature BEFORE UPDATE OR DELETE ON public.employee_signatures
FOR EACH ROW EXECUTE FUNCTION public.protect_finalized_signature();

INSERT INTO public.role_permissions (role_code, permission_code)
VALUES ('ADMINISTRATOR', 'employees.view')
ON CONFLICT DO NOTHING;

DELETE FROM public.role_permissions
WHERE permission_code = 'employees.view'
  AND role_code IN ('HR', 'SUPERVISOR');

INSERT INTO public.role_permissions (role_code, permission_code)
VALUES ('PRESIDENT', 'employees.view')
ON CONFLICT DO NOTHING;
-- END 20260828100000_phase1_profile_verification_signatures.sql

-- BEGIN 20260831120000_google_access_gate_and_employee_email_tracking.sql
CREATE TABLE IF NOT EXISTS public.public_evaluation_access_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.evaluation_cycles(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (position('@' in email) > 1),
  auth_user_id text,
  auth_provider text NOT NULL DEFAULT 'google',
  session_status text NOT NULL DEFAULT 'VERIFIED' CHECK (session_status IN ('VERIFIED', 'EXPIRED', 'DENIED')),
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_public_evaluation_access_sessions_employee ON public.public_evaluation_access_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_public_evaluation_access_sessions_email ON public.public_evaluation_access_sessions(lower(email));

DROP TRIGGER IF EXISTS trg_public_evaluation_access_sessions_updated ON public.public_evaluation_access_sessions;
CREATE TRIGGER trg_public_evaluation_access_sessions_updated
BEFORE UPDATE ON public.public_evaluation_access_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.employee_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid REFERENCES public.evaluations(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  recipient_email text NOT NULL CHECK (position('@' in recipient_email) > 1),
  document_type text NOT NULL DEFAULT 'STEP1_FINALIZED' CHECK (document_type IN ('STEP1_FINALIZED', 'EVALUATION_FINALIZED')),
  mail_status text NOT NULL DEFAULT 'PENDING' CHECK (mail_status IN ('PENDING', 'QUEUED', 'SENT', 'FAILED', 'SKIPPED')),
  idempotency_key text NOT NULL UNIQUE,
  provider_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_email_deliveries_employee ON public.employee_email_deliveries(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_email_deliveries_evaluation ON public.employee_email_deliveries(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_employee_email_deliveries_status ON public.employee_email_deliveries(mail_status);

DROP TRIGGER IF EXISTS trg_employee_email_deliveries_updated ON public.employee_email_deliveries;
CREATE TRIGGER trg_employee_email_deliveries_updated
BEFORE UPDATE ON public.employee_email_deliveries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- END 20260831120000_google_access_gate_and_employee_email_tracking.sql

-- BEGIN 20260901100000_internal_user_signatures.sql
-- Add signature support for all internal users (Supervisor, Reviewing Supervisor, HR, Committee, President)
CREATE TABLE IF NOT EXISTS public.internal_user_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('RATER_STEP2', 'REVIEWING_SUPERVISOR_STEP3', 'HR_REVIEW', 'COMMITTEE_REVIEW', 'PRESIDENT_STEP2', 'PRESIDENT_STEP3')),
  method text NOT NULL CHECK (method IN ('UPLOAD', 'DRAWN')),
  storage_path text,
  signature_data text,
  content_type text,
  file_size integer,
  signed_at timestamptz NOT NULL DEFAULT now(),
  source_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((method = 'UPLOAD' AND storage_path IS NOT NULL AND signature_data IS NULL)
      OR (method = 'DRAWN' AND signature_data IS NOT NULL AND storage_path IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_internal_user_signatures_evaluation 
  ON public.internal_user_signatures(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_internal_user_signatures_user 
  ON public.internal_user_signatures(user_id);
CREATE INDEX IF NOT EXISTS idx_internal_user_signatures_stage 
  ON public.internal_user_signatures(evaluation_id, stage);
CREATE UNIQUE INDEX IF NOT EXISTS uq_internal_user_signatures_eval_user_stage
  ON public.internal_user_signatures(evaluation_id, user_id, stage);

-- Add RLS policies for internal user signatures
ALTER TABLE public.internal_user_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view signatures for evaluations they have access to"
  ON public.internal_user_signatures
  FOR SELECT
  USING (
    public.has_permission(auth.uid(), 'evaluations.view_history') OR
    public.has_permission(auth.uid(), 'president.view') OR
    (user_id = auth.uid())
  );

CREATE POLICY "Users can insert their own signatures"
  ON public.internal_user_signatures
  FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.has_permission(auth.uid(), 'evaluations.step2'));

CREATE POLICY "Users can update their own signatures"
  ON public.internal_user_signatures
  FOR UPDATE
  USING (user_id = auth.uid() AND public.has_permission(auth.uid(), 'evaluations.step2'))
  WITH CHECK (user_id = auth.uid() AND public.has_permission(auth.uid(), 'evaluations.step2'));
-- END 20260901100000_internal_user_signatures.sql

-- BEGIN 20260906120000_digital_201_file_access.sql
-- Digital 201 File access and history query indexes.
INSERT INTO public.permissions(code, module, description)
VALUES ('evaluations.view_201', 'Digital 201 File', 'View authorized employee Digital 201 Files')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions(role_code, permission_code)
VALUES ('HR', 'evaluations.view_201'), ('PRESIDENT', 'evaluations.view_201')
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_evaluations_employee_created
  ON public.evaluations(employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ratings_evaluation_criterion_type
  ON public.evaluation_ratings(evaluation_id, criterion_id, evaluator_type);

CREATE INDEX IF NOT EXISTS idx_audit_employee_occurred
  ON public.audit_logs(employee_id, occurred_at DESC)
  WHERE employee_id IS NOT NULL;
-- END 20260906120000_digital_201_file_access.sql

-- BEGIN 20260906140000_ai_action_idempotency.sql
-- Correlation IDs supplied by retry-safe AI actions must be unique.
-- Existing audit rows use generated UUID correlation IDs, so this partial
-- index preserves nullable legacy rows while protecting action retries.
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_logs_correlation_id_unique
  ON public.audit_logs (correlation_id)
  WHERE correlation_id IS NOT NULL;
-- END 20260906140000_ai_action_idempotency.sql
