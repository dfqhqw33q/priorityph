-- Phase 1: employee master profiles, public verification, signatures, and submission safeguards.
-- Forward-only migration. Do not edit previously applied migrations.

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
