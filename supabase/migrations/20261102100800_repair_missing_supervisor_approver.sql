CREATE OR REPLACE FUNCTION public.protect_performance_evaluation_context()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  employee_department_id uuid;
  employee_department_label text;
  department_snapshot_repair_allowed boolean := false;
BEGIN
  IF OLD.department_id IS NULL
    AND NEW.department_id IS NOT NULL
    AND OLD.status = 'SUPERVISOR_IN_PROGRESS' THEN
    SELECT e.department_id, d.label
    INTO employee_department_id, employee_department_label
    FROM public.employees e
    LEFT JOIN public.performance_departments d ON d.id = e.department_id
    WHERE e.id = OLD.employee_id;

    department_snapshot_repair_allowed :=
      employee_department_id IS NOT NULL
      AND NEW.department_id = employee_department_id
      AND NEW.department_label_snapshot = COALESCE(employee_department_label, '');
  END IF;

  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
    OR NEW.evaluation_period_id IS DISTINCT FROM OLD.evaluation_period_id
    OR NEW.template_id IS DISTINCT FROM OLD.template_id
    OR (
      NEW.department_id IS DISTINCT FROM OLD.department_id
      AND NOT department_snapshot_repair_allowed
    )
    OR NEW.assigned_supervisor_user_id IS DISTINCT FROM OLD.assigned_supervisor_user_id
    OR NEW.employee_name_snapshot IS DISTINCT FROM OLD.employee_name_snapshot
    OR NEW.employee_number_snapshot IS DISTINCT FROM OLD.employee_number_snapshot
    OR NEW.job_title_snapshot IS DISTINCT FROM OLD.job_title_snapshot
    OR (
      NEW.department_label_snapshot IS DISTINCT FROM OLD.department_label_snapshot
      AND NOT department_snapshot_repair_allowed
    ) THEN
    RAISE EXCEPTION 'Evaluation identity and historical context snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_supervisor_performance(
  _evaluation_id uuid,
  _actor_user_id uuid,
  _weighted_score numeric,
  _assessment_snapshot jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  evaluation_row public.employee_evaluations%ROWTYPE;
  supervisor_row public.supervisor_evaluations%ROWTYPE;
  head_user_id uuid;
  resolved_department_id uuid;
  department_label text;
  next_number integer;
  event_id uuid;
BEGIN
  IF _weighted_score NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'A valid Supervisor weighted score is required';
  END IF;
  SELECT * INTO evaluation_row
  FROM public.employee_evaluations
  WHERE id = _evaluation_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evaluation not found'; END IF;
  IF evaluation_row.status <> 'SUPERVISOR_IN_PROGRESS'
    OR evaluation_row.assigned_supervisor_user_id <> _actor_user_id
    OR NOT public.has_role(_actor_user_id, 'SUPERVISOR')
    OR NOT public.has_permission(_actor_user_id, 'evaluations.rate_supervisor') THEN
    RAISE EXCEPTION 'Not authorized to submit this Supervisor assessment';
  END IF;

  resolved_department_id := evaluation_row.department_id;
  IF resolved_department_id IS NULL THEN
    SELECT e.department_id
    INTO resolved_department_id
    FROM public.employees e
    WHERE e.id = evaluation_row.employee_id;
  END IF;

  head_user_id := evaluation_row.department_head_user_id;
  IF head_user_id IS NULL AND resolved_department_id IS NOT NULL THEN
    SELECT dha.user_id
    INTO head_user_id
    FROM public.department_head_assignments dha
    WHERE dha.department_id = resolved_department_id
      AND dha.is_active;

    IF head_user_id IS NOT NULL THEN
      SELECT d.label INTO department_label
      FROM public.performance_departments d
      WHERE d.id = resolved_department_id;

      UPDATE public.employee_evaluations
      SET department_id = COALESCE(department_id, resolved_department_id),
          department_label_snapshot = CASE
            WHEN department_id IS NULL THEN COALESCE(department_label, '')
            ELSE department_label_snapshot
          END,
          department_head_user_id = head_user_id
      WHERE id = _evaluation_id;
    END IF;
  END IF;

  IF head_user_id IS NULL
    OR NOT public.has_permission(head_user_id, 'performance.department_approval.view') THEN
    RAISE EXCEPTION 'An authorized Department Head must be assigned before Supervisor submission';
  END IF;

  SELECT * INTO supervisor_row
  FROM public.supervisor_evaluations
  WHERE employee_evaluation_id = _evaluation_id
  FOR UPDATE;
  IF NOT FOUND OR supervisor_row.supervisor_user_id <> _actor_user_id
    OR supervisor_row.status NOT IN ('IN_PROGRESS', 'RETURNED') THEN
    RAISE EXCEPTION 'A Supervisor draft or returned assessment is required';
  END IF;

  SELECT COALESCE(MAX(submission_number), 0) + 1
  INTO next_number
  FROM public.supervisor_evaluation_submissions
  WHERE supervisor_evaluation_id = supervisor_row.id;
  INSERT INTO public.supervisor_evaluation_submissions (
    supervisor_evaluation_id, submission_number, submitted_by, weighted_score, assessment_snapshot
  ) VALUES (
    supervisor_row.id, next_number, _actor_user_id, _weighted_score, _assessment_snapshot
  );
  UPDATE public.supervisor_evaluations
  SET status = 'SUBMITTED', weighted_score = _weighted_score, submitted_at = now()
  WHERE id = supervisor_row.id;
  UPDATE public.employee_evaluations
  SET status = 'SUPERVISOR_SUBMITTED'
  WHERE id = _evaluation_id;
  UPDATE public.employee_evaluations
  SET status = 'PENDING_DEPARTMENT_HEAD_APPROVAL'
  WHERE id = _evaluation_id;

  INSERT INTO public.performance_workflow_events (
    employee_evaluation_id, actor_user_id, actor_role, action,
    previous_status, new_status, decision
  ) VALUES (
    _evaluation_id, _actor_user_id, 'SUPERVISOR', 'SUPERVISOR_SUBMITTED',
    evaluation_row.status, 'PENDING_DEPARTMENT_HEAD_APPROVAL', 'SUBMITTED'
  ) RETURNING id INTO event_id;
  INSERT INTO public.evaluation_audit_logs (
    employee_evaluation_id, actor_user_id, action, previous_value, new_value
  ) VALUES (
    _evaluation_id, _actor_user_id, 'SUPERVISOR_EVALUATION_SUBMITTED',
    jsonb_build_object('status', evaluation_row.status),
    jsonb_build_object('status', 'PENDING_DEPARTMENT_HEAD_APPROVAL', 'weighted_score', _weighted_score)
  );
  INSERT INTO public.performance_notifications (
    recipient_user_id, employee_evaluation_id, event_type, title, message, dedupe_key
  ) VALUES (
    head_user_id, _evaluation_id, 'SUPERVISOR_SUBMITTED',
    'Evaluation pending Department Head approval',
    'A Supervisor submitted an evaluation for your department.',
    'workflow:' || event_id::text || ':' || head_user_id::text
  ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  INSERT INTO public.performance_notifications (
    recipient_user_id, employee_evaluation_id, event_type, title, message, dedupe_key
  )
  SELECT e.user_id, _evaluation_id, 'SUPERVISOR_SUBMITTED',
    'Supervisor evaluation submitted', 'Your Supervisor assessment has been submitted.',
    'workflow:' || event_id::text || ':' || e.user_id::text
  FROM public.employees e
  WHERE e.id = evaluation_row.employee_id AND e.user_id IS NOT NULL
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  RETURN 'PENDING_DEPARTMENT_HEAD_APPROVAL';
END;
$$;
