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
