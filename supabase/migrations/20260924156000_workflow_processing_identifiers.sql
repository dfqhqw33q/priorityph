CREATE TABLE IF NOT EXISTS public.evaluation_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (job_type IN ('DEVELOPMENT','TRAINING','SUCCESSION','RECOGNITION','FINALIZED_EMAIL')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  available_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_id, job_type)
);

CREATE INDEX IF NOT EXISTS idx_evaluation_processing_jobs_claim
  ON public.evaluation_processing_jobs(status, available_at);

ALTER TABLE public.evaluation_processing_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.evaluation_processing_jobs FROM anon, authenticated;
GRANT ALL ON public.evaluation_processing_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.atomic_evaluation_transition(
  _evaluation_id uuid,
  _expected_version integer,
  _next_status public.evaluation_status,
  _actor_user_id uuid,
  _action text,
  _reason text DEFAULT '',
  _correction_stage text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_row public.evaluations%ROWTYPE;
  actor_roles text;
  audience text;
  title text;
  body text;
BEGIN
  SELECT * INTO current_row
  FROM public.evaluations
  WHERE id = _evaluation_id
  FOR UPDATE;

  IF current_row.id IS NULL THEN RAISE EXCEPTION 'Evaluation not found'; END IF;
  IF current_row.version <> _expected_version THEN RAISE EXCEPTION 'Evaluation version is stale'; END IF;
  IF current_row.is_finalized THEN RAISE EXCEPTION 'Finalized evaluations cannot be modified'; END IF;

  IF NOT (
    (current_row.status = 'SUBMITTED' AND _next_status = 'DRAFT') OR
    (current_row.status = 'DRAFT' AND _next_status IN ('DRAFT','FOR_REVIEW')) OR
    (current_row.status = 'FOR_REVIEW' AND _next_status IN ('FOR_REVIEW','FOR_PROCESSING','FOR_APPROVAL')) OR
    (current_row.status = 'FOR_PROCESSING' AND _next_status IN ('FOR_PROCESSING','FOR_REVIEW')) OR
    (current_row.status = 'FOR_APPROVAL' AND _next_status IN ('FINALIZED','RETURNED')) OR
    (current_row.status = 'RETURNED' AND _next_status IN ('DRAFT','FOR_REVIEW','FOR_PROCESSING'))
  ) THEN
    RAISE EXCEPTION 'Invalid workflow transition from % to %', current_row.status, _next_status;
  END IF;

  UPDATE public.evaluations
  SET status = _next_status,
      version = _expected_version + 1,
      correction_reason = CASE WHEN _next_status = 'RETURNED' THEN _reason ELSE correction_reason END,
      correction_stage = CASE WHEN _next_status = 'RETURNED' THEN _correction_stage ELSE NULL END,
      is_finalized = CASE WHEN _next_status = 'FINALIZED' THEN true ELSE is_finalized END,
      finalized_by = CASE WHEN _next_status = 'FINALIZED' THEN _actor_user_id ELSE finalized_by END,
      finalized_at = CASE WHEN _next_status = 'FINALIZED' THEN now() ELSE finalized_at END,
      finalization_reason = CASE WHEN _next_status = 'FINALIZED' THEN _reason ELSE finalization_reason END
  WHERE id = _evaluation_id AND version = _expected_version;

  INSERT INTO public.evaluation_events(evaluation_id, event_type, from_status, to_status, actor_user_id, reason)
  VALUES (_evaluation_id, _action, current_row.status, _next_status, _actor_user_id, NULLIF(_reason, ''));

  audience := CASE _next_status
    WHEN 'DRAFT' THEN 'evaluations.step2'
    WHEN 'FOR_REVIEW' THEN 'evaluations.review_step3'
    WHEN 'FOR_PROCESSING' THEN 'personnel.process'
    WHEN 'FOR_APPROVAL' THEN 'committee.review'
    WHEN 'FINALIZED' THEN 'evaluations.view_history'
    WHEN 'RETURNED' THEN 'evaluations.view_history'
    ELSE 'evaluations.view_history'
  END;
  title := CASE _next_status
    WHEN 'FINALIZED' THEN 'Performance Evaluation Finalized'
    WHEN 'RETURNED' THEN 'Evaluation Returned'
    WHEN 'FOR_APPROVAL' THEN 'Evaluation Ready for Review'
    WHEN 'FOR_PROCESSING' THEN 'Evaluation Ready for Processing'
    ELSE 'Evaluation Workflow Updated'
  END;
  body := COALESCE(NULLIF(_reason, ''), 'An evaluation workflow status changed.');

  INSERT INTO public.notification_events(evaluation_id, event_type, audience_permission, title, body, payload, dedupe_key)
  VALUES (
    _evaluation_id, _action, audience, title, body,
    jsonb_build_object('fromStatus', current_row.status, 'toStatus', _next_status, 'reason', _reason),
    _evaluation_id::text || ':' || _action || ':' || _expected_version
  ) ON CONFLICT (dedupe_key) DO NOTHING;

  SELECT string_agg(ur.role::text, ',') INTO actor_roles
  FROM public.user_roles ur WHERE ur.user_id = _actor_user_id;
  INSERT INTO public.audit_logs(actor_user_id, actor_role, action, module, entity_type, entity_id, evaluation_id, previous_value, new_value, reason)
  VALUES (
    _actor_user_id, actor_roles, _action, 'Evaluation Workflow', 'evaluation', _evaluation_id, _evaluation_id,
    jsonb_build_object('status', current_row.status),
    jsonb_build_object('status', _next_status), NULLIF(_reason, '')
  );

  IF _next_status = 'FINALIZED' THEN
    INSERT INTO public.evaluation_processing_jobs(evaluation_id, job_type)
    VALUES
      (_evaluation_id, 'DEVELOPMENT'),
      (_evaluation_id, 'TRAINING'),
      (_evaluation_id, 'SUCCESSION'),
      (_evaluation_id, 'RECOGNITION'),
      (_evaluation_id, 'FINALIZED_EMAIL')
    ON CONFLICT (evaluation_id, job_type) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'fromStatus', current_row.status, 'toStatus', _next_status, 'version', _expected_version + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.atomic_evaluation_transition(uuid, integer, public.evaluation_status, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_evaluation_transition(uuid, integer, public.evaluation_status, uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_evaluation_processing_jobs(_limit integer DEFAULT 10)
RETURNS SETOF public.evaluation_processing_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH claimed AS (
    SELECT id FROM public.evaluation_processing_jobs
    WHERE status IN ('PENDING','FAILED')
      AND available_at <= now()
      AND attempts < 5
    ORDER BY available_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(_limit, 50))
  )
  UPDATE public.evaluation_processing_jobs jobs
  SET status = 'PROCESSING', attempts = attempts + 1, updated_at = now()
  FROM claimed
  WHERE jobs.id = claimed.id
  RETURNING jobs.*;
$$;

REVOKE ALL ON FUNCTION public.claim_evaluation_processing_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_evaluation_processing_jobs(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_evaluation_processing_job(_job_id uuid, _success boolean, _error text DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.evaluation_processing_jobs
  SET status = CASE WHEN _success THEN 'COMPLETED' ELSE CASE WHEN attempts >= 5 THEN 'FAILED' ELSE 'PENDING' END END,
      last_error = CASE WHEN _success THEN NULL ELSE left(_error, 1000) END,
      available_at = CASE WHEN _success THEN available_at ELSE now() + interval '1 minute' * least(attempts * 5, 60) END,
      completed_at = CASE WHEN _success THEN now() ELSE completed_at END,
      updated_at = now()
  WHERE id = _job_id;
$$;

REVOKE ALL ON FUNCTION public.finish_evaluation_processing_job(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_evaluation_processing_job(uuid, boolean, text) TO service_role;

REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated;
REVOKE UPDATE, DELETE ON public.audit_logs FROM anon;

CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_audit_update ON public.audit_logs;
CREATE TRIGGER trg_prevent_audit_update
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

REVOKE ALL ON FUNCTION public.prevent_audit_mutation() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.evaluation_id_sequences (
  cycle_year integer PRIMARY KEY CHECK (cycle_year BETWEEN 2000 AND 2200),
  next_sequence integer NOT NULL CHECK (next_sequence > 0)
);

ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS evaluation_id text,
  ADD COLUMN IF NOT EXISTS evaluation_sequence integer;

-- Existing rows receive stable IDs ordered by creation time, then UUID. No existing
-- primary keys or workflow relationships are changed.
WITH numbered AS (
  SELECT
    e.id,
    c.year AS cycle_year,
    row_number() OVER (PARTITION BY c.year ORDER BY e.created_at, e.id)::integer AS sequence_number
  FROM public.evaluations e
  JOIN public.evaluation_cycles c ON c.id = e.cycle_id
  WHERE e.evaluation_id IS NULL
)
UPDATE public.evaluations e
SET
  evaluation_sequence = numbered.sequence_number,
  evaluation_id = format('EV-%s-%s', numbered.cycle_year, lpad(numbered.sequence_number::text, 6, '0'))
FROM numbered
WHERE e.id = numbered.id;

INSERT INTO public.evaluation_id_sequences(cycle_year, next_sequence)
SELECT c.year, COALESCE(MAX(e.evaluation_sequence), 0) + 1
FROM public.evaluation_cycles c
JOIN public.evaluations e ON e.cycle_id = c.id
GROUP BY c.year
ON CONFLICT (cycle_year) DO UPDATE
SET next_sequence = GREATEST(public.evaluation_id_sequences.next_sequence, EXCLUDED.next_sequence);

CREATE OR REPLACE FUNCTION public.assign_evaluation_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cycle_year integer;
  sequence_number integer;
BEGIN
  IF NEW.evaluation_id IS NOT NULL OR NEW.evaluation_sequence IS NOT NULL THEN
    RAISE EXCEPTION 'Evaluation ID is generated by the database';
  END IF;

  SELECT ec.year INTO v_cycle_year
  FROM public.evaluation_cycles ec
  WHERE ec.id = NEW.cycle_id;
  IF v_cycle_year IS NULL THEN RAISE EXCEPTION 'Evaluation cycle is required'; END IF;

  INSERT INTO public.evaluation_id_sequences(cycle_year, next_sequence)
  VALUES (v_cycle_year, 2)
  ON CONFLICT (cycle_year) DO UPDATE SET next_sequence = public.evaluation_id_sequences.next_sequence + 1
  RETURNING next_sequence - 1 INTO sequence_number;

  NEW.evaluation_sequence := sequence_number;
  NEW.evaluation_id := format('EV-%s-%s', v_cycle_year, lpad(sequence_number::text, 6, '0'));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_evaluation_id_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.evaluation_id IS DISTINCT FROM OLD.evaluation_id
     OR NEW.evaluation_sequence IS DISTINCT FROM OLD.evaluation_sequence
     OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id THEN
    RAISE EXCEPTION 'Evaluation ID and cycle cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_evaluation_id ON public.evaluations;
CREATE TRIGGER trg_assign_evaluation_id
BEFORE INSERT ON public.evaluations
FOR EACH ROW EXECUTE FUNCTION public.assign_evaluation_id();

DROP TRIGGER IF EXISTS trg_prevent_evaluation_id_mutation ON public.evaluations;
CREATE TRIGGER trg_prevent_evaluation_id_mutation
BEFORE UPDATE ON public.evaluations
FOR EACH ROW EXECUTE FUNCTION public.prevent_evaluation_id_mutation();

ALTER TABLE public.evaluations
  ALTER COLUMN evaluation_id SET NOT NULL,
  ALTER COLUMN evaluation_sequence SET NOT NULL;

ALTER TABLE public.evaluations
  ADD CONSTRAINT evaluations_evaluation_id_format_check
    CHECK (evaluation_id ~ '^EV-[0-9]{4}-[0-9]{6,}$'),
  ADD CONSTRAINT evaluations_evaluation_id_unique UNIQUE (evaluation_id),
  ADD CONSTRAINT evaluations_cycle_sequence_unique UNIQUE (cycle_id, evaluation_sequence);

CREATE INDEX IF NOT EXISTS idx_evaluations_evaluation_id
  ON public.evaluations(evaluation_id);

DROP POLICY IF EXISTS "evaluation id sequence access" ON public.evaluation_id_sequences;
ALTER TABLE public.evaluation_id_sequences ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS evaluation_display_id text;

CREATE INDEX IF NOT EXISTS idx_audit_logs_evaluation_display_id
  ON public.audit_logs(evaluation_display_id);

UPDATE public.audit_logs al
SET evaluation_display_id = e.evaluation_id
FROM public.evaluations e
WHERE al.evaluation_id = e.id
  AND al.evaluation_display_id IS NULL;

-- Evaluation inserts allocate their public ID through a trigger. Keep the
-- sequence table private while allowing the trusted server role to access it.
ALTER TABLE public.evaluation_id_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evaluation id sequence service access"
  ON public.evaluation_id_sequences;
CREATE POLICY "evaluation id sequence service access"
  ON public.evaluation_id_sequences
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.evaluation_id_sequences TO service_role;
