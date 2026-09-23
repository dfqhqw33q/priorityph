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
