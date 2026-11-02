CREATE TABLE public.performance_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division text NOT NULL DEFAULT '',
  section text NOT NULL DEFAULT '',
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (division, section)
);

INSERT INTO public.performance_departments (division, section, label)
SELECT DISTINCT
  COALESCE(NULLIF(btrim(division), ''), ''),
  COALESCE(NULLIF(btrim(section), ''), ''),
  COALESCE(NULLIF(btrim(division), ''), NULLIF(btrim(section), ''), 'Unassigned department')
    || CASE
      WHEN NULLIF(btrim(division), '') IS NOT NULL AND NULLIF(btrim(section), '') IS NOT NULL
        THEN ' / ' || btrim(section)
      ELSE ''
    END
FROM public.employees
WHERE NULLIF(btrim(division), '') IS NOT NULL OR NULLIF(btrim(section), '') IS NOT NULL
ON CONFLICT (division, section) DO NOTHING;

ALTER TABLE public.employees
  ADD COLUMN department_id uuid REFERENCES public.performance_departments(id) ON DELETE SET NULL;

UPDATE public.employees e
SET department_id = d.id
FROM public.performance_departments d
WHERE d.division = COALESCE(NULLIF(btrim(e.division), ''), '')
  AND d.section = COALESCE(NULLIF(btrim(e.section), ''), '');

CREATE TABLE public.department_head_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.performance_departments(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  assigned_by uuid REFERENCES public.internal_users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, user_id)
);

CREATE UNIQUE INDEX idx_one_active_department_head
  ON public.department_head_assignments(department_id)
  WHERE is_active;

CREATE TABLE public.user_permissions (
  user_id uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.internal_users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  PRIMARY KEY (user_id, permission_code)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.user_permissions TO service_role;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_account_usable(_user_id) AND (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role_code = ur.role
      WHERE ur.user_id = _user_id AND rp.permission_code = _permission
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_permissions up
      WHERE up.user_id = _user_id
        AND up.permission_code = _permission
        AND up.revoked_at IS NULL
    )
  );
$$;

INSERT INTO public.roles(code, name, description)
VALUES ('DEPARTMENT_HEAD', 'Department Head', 'Approves performance evaluations for assigned departments')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.permissions(code, module, description) VALUES
  ('performance.cycles.view', 'Performance Management', 'View evaluation cycles'),
  ('performance.cycles.create', 'Performance Management', 'Create evaluation cycles'),
  ('performance.cycles.edit', 'Performance Management', 'Edit draft evaluation cycles'),
  ('performance.cycles.launch', 'Performance Management', 'Launch evaluation cycles for assigned employees'),
  ('performance.assignments.manage', 'Performance Management', 'Manage employee evaluation assignments'),
  ('performance.department_assignments.manage', 'Organization Setup', 'Assign Department Head accounts to stable department records'),
  ('performance.profiles.manage', 'Performance Management', 'Manage evaluation profiles and versions'),
  ('performance.monitoring.view', 'Performance Management', 'View performance monitoring'),
  ('performance.hr_validation.view', 'HR Validation', 'View evaluations pending HR validation'),
  ('performance.hr_validation.finalize', 'HR Validation', 'Finalize evaluations after Department Head approval'),
  ('performance.hr_validation.return', 'HR Validation', 'Return evaluations for correction'),
  ('performance.reopen', 'Performance Management', 'Reopen a finalized evaluation through the controlled process'),
  ('performance.history.view', 'Performance Management', 'View performance evaluation history'),
  ('performance.department.view', 'Department Performance', 'View authorized department performance'),
  ('performance.department_approval.view', 'Department Performance', 'View pending department approvals'),
  ('performance.department_approval.approve', 'Department Performance', 'Approve supervisor-submitted evaluations'),
  ('performance.department_approval.return', 'Department Performance', 'Return evaluations to supervisors'),
  ('performance.department_history.view', 'Department Performance', 'View authorized department evaluation history'),
  ('evaluations.return_employee', 'Performance Management', 'Return a self-evaluation to its employee for correction')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions(role_code, permission_code) VALUES
  ('HR', 'performance.cycles.view'),
  ('HR', 'performance.monitoring.view'),
  ('HR', 'performance.hr_validation.view'),
  ('HR', 'performance.hr_validation.return'),
  ('HR', 'performance.history.view'),
  ('SUPERVISOR', 'evaluations.return_employee'),
  ('DEPARTMENT_HEAD', 'performance.department.view'),
  ('DEPARTMENT_HEAD', 'performance.department_approval.view'),
  ('DEPARTMENT_HEAD', 'performance.department_approval.approve'),
  ('DEPARTMENT_HEAD', 'performance.department_approval.return'),
  ('DEPARTMENT_HEAD', 'performance.department_history.view')
ON CONFLICT DO NOTHING;

DELETE FROM public.role_permissions
WHERE role_code = 'HR' AND permission_code IN ('cycles.manage', 'cycles.manage_link');

ALTER TABLE public.employee_evaluations
  ADD COLUMN assigned_supervisor_user_id uuid REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  ADD COLUMN department_id uuid REFERENCES public.performance_departments(id) ON DELETE RESTRICT,
  ADD COLUMN department_head_user_id uuid REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  ADD COLUMN employee_name_snapshot text NOT NULL DEFAULT '',
  ADD COLUMN employee_number_snapshot text NOT NULL DEFAULT '',
  ADD COLUMN job_title_snapshot text NOT NULL DEFAULT '',
  ADD COLUMN department_label_snapshot text NOT NULL DEFAULT '',
  ADD COLUMN finalized_by uuid REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  ADD COLUMN finalized_at timestamptz;

UPDATE public.employee_evaluations ee
SET assigned_supervisor_user_id = e.assigned_supervisor_user_id,
    department_id = e.department_id,
    department_head_user_id = dha.user_id,
    employee_name_snapshot = e.full_name,
    employee_number_snapshot = e.employee_number,
    job_title_snapshot = e.job_title,
    department_label_snapshot = COALESCE(d.label, '')
FROM public.employees e
LEFT JOIN public.department_head_assignments dha
  ON dha.department_id = e.department_id AND dha.is_active
LEFT JOIN public.performance_departments d ON d.id = e.department_id
WHERE ee.employee_id = e.id;

ALTER TABLE public.employee_evaluations
  DROP CONSTRAINT employee_evaluations_status_check,
  ADD CONSTRAINT employee_evaluations_status_check CHECK (status IN (
    'DRAFT',
    'IN_PROGRESS',
    'SUBMITTED',
    'PENDING_SUPERVISOR_REVIEW',
    'RETURNED_FOR_REVISION',
    'SUPERVISOR_IN_PROGRESS',
    'SUPERVISOR_SUBMITTED',
    'PENDING_DEPARTMENT_HEAD_APPROVAL',
    'RETURNED_BY_DEPARTMENT_HEAD',
    'PENDING_HR_VALIDATION',
    'RETURNED_BY_HR',
    'FINALIZED',
    'REOPENED',
    'ARCHIVED',
    'COMPLETED'
  ));

CREATE OR REPLACE FUNCTION public.validate_employee_evaluation_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('FINALIZED', 'ARCHIVED')
    AND NOT (
      OLD.status = 'FINALIZED'
      AND NEW.status = 'REOPENED'
      AND current_setting('app.performance_reopen', true) = 'true'
    )
    AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Finalized or archived evaluations require a controlled reopening process';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'DRAFT' AND NEW.status IN ('IN_PROGRESS', 'SUBMITTED'))
    OR (OLD.status = 'IN_PROGRESS' AND NEW.status IN ('DRAFT', 'SUBMITTED'))
    OR (OLD.status = 'SUBMITTED' AND NEW.status IN (
      'PENDING_SUPERVISOR_REVIEW', 'SUPERVISOR_IN_PROGRESS', 'RETURNED_FOR_REVISION'
    ))
    OR (OLD.status = 'PENDING_SUPERVISOR_REVIEW' AND NEW.status IN (
      'SUPERVISOR_IN_PROGRESS', 'RETURNED_FOR_REVISION'
    ))
    OR (OLD.status = 'RETURNED_FOR_REVISION' AND NEW.status IN ('IN_PROGRESS', 'SUBMITTED'))
    OR (OLD.status = 'SUPERVISOR_IN_PROGRESS' AND NEW.status IN (
      'RETURNED_FOR_REVISION', 'SUPERVISOR_SUBMITTED'
    ))
    OR (OLD.status = 'SUPERVISOR_SUBMITTED' AND NEW.status IN (
      'COMPLETED', 'PENDING_DEPARTMENT_HEAD_APPROVAL'
    ))
    OR (OLD.status = 'PENDING_DEPARTMENT_HEAD_APPROVAL' AND NEW.status IN (
      'RETURNED_BY_DEPARTMENT_HEAD', 'PENDING_HR_VALIDATION'
    ))
    OR (OLD.status = 'RETURNED_BY_DEPARTMENT_HEAD' AND NEW.status IN (
      'SUPERVISOR_IN_PROGRESS', 'RETURNED_FOR_REVISION'
    ))
    OR (OLD.status = 'PENDING_HR_VALIDATION' AND NEW.status IN ('RETURNED_BY_HR', 'FINALIZED'))
    OR (OLD.status = 'RETURNED_BY_HR' AND NEW.status IN (
      'SUBMITTED', 'RETURNED_FOR_REVISION', 'SUPERVISOR_IN_PROGRESS',
      'PENDING_DEPARTMENT_HEAD_APPROVAL', 'PENDING_HR_VALIDATION', 'RETURNED_BY_DEPARTMENT_HEAD'
    ))
    OR (OLD.status = 'REOPENED' AND NEW.status IN (
      'IN_PROGRESS', 'SUBMITTED', 'SUPERVISOR_IN_PROGRESS', 'RETURNED_FOR_REVISION'
    ))
    OR (OLD.status IN ('COMPLETED', 'SUPERVISOR_SUBMITTED') AND NEW.status = 'ARCHIVED')
  ) THEN
    RAISE EXCEPTION 'Invalid evaluation status transition: % -> %', OLD.status, NEW.status;
  END IF;
  IF NEW.status = 'FINALIZED' AND (
    NEW.finalized_by IS NULL OR NEW.finalized_at IS NULL OR OLD.status <> 'PENDING_HR_VALIDATION'
  ) THEN
    RAISE EXCEPTION 'Only an HR validation can finalize a Department Head-approved evaluation';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.supervisor_evaluations
  DROP CONSTRAINT supervisor_evaluations_status_check,
  ADD CONSTRAINT supervisor_evaluations_status_check CHECK (
    status IN ('DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'RETURNED', 'COMPLETED')
  );

CREATE OR REPLACE FUNCTION public.validate_supervisor_evaluation_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'DRAFT' AND NEW.status IN ('IN_PROGRESS', 'SUBMITTED'))
    OR (OLD.status = 'IN_PROGRESS' AND NEW.status IN ('DRAFT', 'SUBMITTED', 'RETURNED'))
    OR (OLD.status = 'SUBMITTED' AND NEW.status IN ('RETURNED', 'COMPLETED'))
    OR (OLD.status = 'COMPLETED' AND NEW.status = 'RETURNED')
    OR (OLD.status = 'RETURNED' AND NEW.status IN ('IN_PROGRESS', 'SUBMITTED'))
    OR (OLD.status = 'RETURNED' AND NEW.status IN ('IN_PROGRESS', 'SUBMITTED'))
  ) THEN
    RAISE EXCEPTION 'Invalid supervisor evaluation status transition: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_supervisor_evaluation_rating_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_status text;
  parent_id uuid;
BEGIN
  parent_id := COALESCE(NEW.supervisor_evaluation_id, OLD.supervisor_evaluation_id);
  SELECT status INTO parent_status
  FROM public.supervisor_evaluations
  WHERE id = parent_id
  FOR UPDATE;

  IF parent_status NOT IN ('DRAFT', 'IN_PROGRESS', 'RETURNED') THEN
    RAISE EXCEPTION 'Supervisor ratings can only be changed before submission or after a return';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_employee_evaluation_finalized_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('FINALIZED', 'ARCHIVED')
    AND NOT (
      OLD.status = 'FINALIZED'
      AND NEW.status = 'REOPENED'
      AND current_setting('app.performance_reopen', true) = 'true'
    ) THEN
    RAISE EXCEPTION 'Finalized or archived evaluations cannot be edited';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_finalized_employee_evaluation
  BEFORE UPDATE ON public.employee_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.guard_employee_evaluation_finalized_changes();

CREATE OR REPLACE FUNCTION public.guard_employee_evaluation_rating_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_status text;
  parent_id uuid;
BEGIN
  parent_id := COALESCE(NEW.employee_evaluation_id, OLD.employee_evaluation_id);
  SELECT status INTO parent_status
  FROM public.employee_evaluations
  WHERE id = parent_id
  FOR UPDATE;

  IF parent_status NOT IN (
    'DRAFT', 'IN_PROGRESS', 'RETURNED_FOR_REVISION', 'RETURNED_BY_HR', 'REOPENED'
  ) THEN
    RAISE EXCEPTION 'Employee ratings cannot be changed after submission unless returned for revision';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.snapshot_performance_approvers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  employee_row public.employees%ROWTYPE;
BEGIN
  SELECT * INTO employee_row FROM public.employees WHERE id = NEW.employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evaluation employee record not found'; END IF;
  NEW.assigned_supervisor_user_id :=
    COALESCE(NEW.assigned_supervisor_user_id, employee_row.assigned_supervisor_user_id);
  NEW.department_id := COALESCE(NEW.department_id, employee_row.department_id);
  IF NEW.department_id IS NOT NULL THEN
    SELECT d.label INTO NEW.department_label_snapshot
    FROM public.performance_departments d WHERE d.id = NEW.department_id;
  END IF;
  NEW.employee_name_snapshot := employee_row.full_name;
  NEW.employee_number_snapshot := employee_row.employee_number;
  NEW.job_title_snapshot := employee_row.job_title;
  IF NEW.department_head_user_id IS NULL AND NEW.department_id IS NOT NULL THEN
    SELECT dha.user_id INTO NEW.department_head_user_id
    FROM public.department_head_assignments dha
    WHERE dha.department_id = NEW.department_id AND dha.is_active
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_snapshot_performance_approvers
  BEFORE INSERT ON public.employee_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_performance_approvers();

CREATE OR REPLACE FUNCTION public.protect_performance_evaluation_context()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
    OR NEW.evaluation_period_id IS DISTINCT FROM OLD.evaluation_period_id
    OR NEW.template_id IS DISTINCT FROM OLD.template_id
    OR NEW.department_id IS DISTINCT FROM OLD.department_id
    OR NEW.assigned_supervisor_user_id IS DISTINCT FROM OLD.assigned_supervisor_user_id
    OR NEW.employee_name_snapshot IS DISTINCT FROM OLD.employee_name_snapshot
    OR NEW.employee_number_snapshot IS DISTINCT FROM OLD.employee_number_snapshot
    OR NEW.job_title_snapshot IS DISTINCT FROM OLD.job_title_snapshot
    OR NEW.department_label_snapshot IS DISTINCT FROM OLD.department_label_snapshot THEN
    RAISE EXCEPTION 'Evaluation identity and historical context snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_performance_evaluation_context
  BEFORE UPDATE ON public.employee_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.protect_performance_evaluation_context();

CREATE TABLE public.supervisor_evaluation_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_evaluation_id uuid NOT NULL REFERENCES public.supervisor_evaluations(id) ON DELETE RESTRICT,
  submission_number integer NOT NULL CHECK (submission_number > 0),
  submitted_by uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  weighted_score numeric(4, 2) NOT NULL CHECK (weighted_score BETWEEN 1 AND 5),
  assessment_snapshot jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supervisor_evaluation_id, submission_number)
);

CREATE TABLE public.employee_evaluation_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_evaluation_id uuid NOT NULL REFERENCES public.employee_evaluations(id) ON DELETE RESTRICT,
  submission_number integer NOT NULL CHECK (submission_number > 0),
  submitted_by uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  weighted_score numeric(4, 2) NOT NULL CHECK (weighted_score BETWEEN 1 AND 5),
  assessment_snapshot jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_evaluation_id, submission_number)
);

CREATE INDEX idx_employee_evaluation_submissions_history
  ON public.employee_evaluation_submissions(employee_evaluation_id, submitted_at DESC);

CREATE TABLE public.performance_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_evaluation_id uuid NOT NULL REFERENCES public.employee_evaluations(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES public.internal_users(id) ON DELETE SET NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  decision text,
  reason text,
  responsible_user_id uuid REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_performance_workflow_events_evaluation
  ON public.performance_workflow_events(employee_evaluation_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_performance_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Performance approval history is append-only';
END;
$$;

CREATE TRIGGER trg_workflow_events_append_only
  BEFORE UPDATE OR DELETE ON public.performance_workflow_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_performance_history_mutation();

CREATE TRIGGER trg_evaluation_audit_logs_append_only
  BEFORE UPDATE OR DELETE ON public.evaluation_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_performance_history_mutation();

CREATE TRIGGER trg_supervisor_submissions_append_only
  BEFORE UPDATE OR DELETE ON public.supervisor_evaluation_submissions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_performance_history_mutation();

CREATE TRIGGER trg_employee_submissions_append_only
  BEFORE UPDATE OR DELETE ON public.employee_evaluation_submissions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_performance_history_mutation();

ALTER TABLE public.performance_notifications
  ADD COLUMN dedupe_key text;

CREATE UNIQUE INDEX idx_performance_notifications_dedupe
  ON public.performance_notifications(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

ALTER TABLE public.performance_notifications
  DROP CONSTRAINT performance_notifications_event_type_check,
  ADD CONSTRAINT performance_notifications_event_type_check CHECK (event_type IN (
    'EVALUATION_AVAILABLE',
    'SELF_EVALUATION_SUBMITTED',
    'EVALUATION_RETURNED',
    'SUPERVISOR_SUBMITTED',
    'EVALUATION_COMPLETED',
    'EMPLOYEE_SUBMITTED',
    'EMPLOYEE_RESUBMITTED',
    'DEPARTMENT_HEAD_APPROVED',
    'DEPARTMENT_HEAD_RETURNED',
    'HR_VALIDATION_REQUIRED',
    'HR_RETURNED',
    'EVALUATION_FINALIZED'
  ));

ALTER TABLE public.performance_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_head_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_evaluation_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_evaluation_submissions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON
  public.performance_departments,
  public.department_head_assignments,
  public.supervisor_evaluation_submissions,
  public.employee_evaluation_submissions,
  public.performance_workflow_events
TO authenticated;
GRANT ALL ON
  public.performance_departments,
  public.department_head_assignments,
  public.supervisor_evaluation_submissions,
  public.employee_evaluation_submissions,
  public.performance_workflow_events
TO service_role;

CREATE OR REPLACE FUNCTION public.can_access_performance_employee(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE     e.id = _employee_id
    AND public.is_account_usable(auth.uid())
      AND (
        (
          e.user_id = auth.uid()
          AND public.has_portal_role(auth.uid(), 'EMPLOYEE')
        )
        OR (
          public.has_portal_role(auth.uid(), 'SUPERVISOR')
          AND EXISTS (
            SELECT 1 FROM public.employee_evaluations ee
            WHERE ee.employee_id = e.id
              AND ee.assigned_supervisor_user_id = auth.uid()
          )
        )
        OR (
          public.has_permission(auth.uid(), 'performance.department.view')
          AND EXISTS (
            SELECT 1 FROM public.employee_evaluations ee
            WHERE ee.employee_id = e.id
              AND ee.department_head_user_id = auth.uid()
          )
        )
        OR public.has_permission(auth.uid(), 'performance.hr_validation.view')
        OR public.has_permission(auth.uid(), 'performance.monitoring.view')
        OR public.has_permission(auth.uid(), 'performance.history.view')
      )
  );
$$;

CREATE POLICY "authorized performance departments readable"
  ON public.performance_departments FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'performance.monitoring.view')
    OR public.has_permission(auth.uid(), 'performance.hr_validation.view')
    OR EXISTS (
      SELECT 1 FROM public.employee_evaluations ee
      WHERE ee.department_id = id AND ee.department_head_user_id = auth.uid()
    )
  );

CREATE POLICY "department assignments readable by assigned head"
  ON public.department_head_assignments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'users.manage'));

CREATE OR REPLACE FUNCTION public.assign_performance_department_head(
  _actor_user_id uuid,
  _department_id uuid,
  _department_head_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  evaluation_row public.employee_evaluations%ROWTYPE;
  actor_role text;
BEGIN
  IF NOT (
    public.has_permission(_actor_user_id, 'performance.department_assignments.manage')
    OR public.has_permission(_actor_user_id, 'users.manage')
  ) THEN
    RAISE EXCEPTION 'Not authorized to assign Department Heads';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.performance_departments
    WHERE id = _department_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Department not found or inactive';
  END IF;
  IF NOT public.has_role(_department_head_user_id, 'DEPARTMENT_HEAD') THEN
    RAISE EXCEPTION 'The selected account must have the Department Head role';
  END IF;
  SELECT ur.role INTO actor_role FROM public.user_roles ur WHERE ur.user_id = _actor_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'The assigning account has no role'; END IF;
  PERFORM 1 FROM public.performance_departments
    WHERE id = _department_id FOR UPDATE;
  UPDATE public.department_head_assignments
  SET is_active = false
  WHERE department_id = _department_id AND is_active;
  INSERT INTO public.department_head_assignments (
    department_id, user_id, is_active, assigned_by, assigned_at
  ) VALUES (
    _department_id, _department_head_user_id, true, _actor_user_id, now()
  )
  ON CONFLICT (department_id, user_id) DO UPDATE
  SET is_active = true, assigned_by = _actor_user_id, assigned_at = now();

  FOR evaluation_row IN
    SELECT ee.*
    FROM public.employee_evaluations ee
    WHERE ee.department_id = _department_id
      AND ee.department_head_user_id IS DISTINCT FROM _department_head_user_id
      AND ee.status NOT IN ('FINALIZED', 'ARCHIVED', 'COMPLETED')
    FOR UPDATE
  LOOP
    INSERT INTO public.performance_workflow_events (
      employee_evaluation_id, actor_user_id, actor_role, action,
      previous_status, new_status, reason, details
    ) VALUES (
      evaluation_row.id, _actor_user_id, actor_role, 'DEPARTMENT_HEAD_REASSIGNED',
      evaluation_row.status, evaluation_row.status, 'Department Head assignment changed',
      jsonb_build_object(
        'previous_department_head_user_id', evaluation_row.department_head_user_id,
        'new_department_head_user_id', _department_head_user_id
      )
    );
    IF evaluation_row.status = 'RETURNED_BY_HR' THEN
      INSERT INTO public.performance_workflow_events (
        employee_evaluation_id, actor_user_id, actor_role, action,
        previous_status, new_status, reason, responsible_user_id, details
      ) VALUES (
        evaluation_row.id, _actor_user_id, actor_role, 'HR_CORRECTION_REASSIGNED',
        evaluation_row.status, evaluation_row.status, 'Department Head assignment changed',
        _department_head_user_id,
        jsonb_build_object('previous_responsible_user_id', evaluation_row.department_head_user_id)
      );
    END IF;
    UPDATE public.employee_evaluations
    SET department_head_user_id = _department_head_user_id
    WHERE id = evaluation_row.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_performance_department_head(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_performance_department_head(uuid, uuid, uuid)
  TO service_role;

CREATE POLICY "supervisor submissions readable by authorized reviewers"
  ON public.supervisor_evaluation_submissions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.supervisor_evaluations se
      JOIN public.employee_evaluations ee ON ee.id = se.employee_evaluation_id
      WHERE se.id = supervisor_evaluation_id
        AND public.can_access_performance_employee(ee.employee_id)
    )
  );

CREATE POLICY "employee submissions readable by authorized reviewers"
  ON public.employee_evaluation_submissions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employee_evaluations ee
      WHERE ee.id = employee_evaluation_id
        AND public.can_access_performance_employee(ee.employee_id)
    )
  );

CREATE POLICY "workflow events readable by authorized reviewers"
  ON public.performance_workflow_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employee_evaluations ee
      WHERE ee.id = employee_evaluation_id
        AND public.can_access_performance_employee(ee.employee_id)
    )
  );

DROP POLICY IF EXISTS "evaluation periods readable by portal users" ON public.evaluation_periods;
CREATE POLICY "evaluation periods readable by authorized performance users"
  ON public.evaluation_periods FOR SELECT TO authenticated
  USING (
    public.is_account_usable(auth.uid())
    AND (
      public.has_portal_role(auth.uid(), 'EMPLOYEE')
      OR public.has_portal_role(auth.uid(), 'SUPERVISOR')
      OR public.has_permission(auth.uid(), 'performance.cycles.view')
      OR public.has_permission(auth.uid(), 'performance.department.view')
    )
  );

DROP POLICY IF EXISTS "evaluation records readable by assigned portal users" ON public.employee_evaluations;
CREATE POLICY "evaluation records readable by authorized performance users"
  ON public.employee_evaluations FOR SELECT TO authenticated
  USING (public.can_access_performance_employee(employee_id));

DROP POLICY IF EXISTS "self evaluation ratings readable by assigned portal users" ON public.employee_evaluation_ratings;
CREATE POLICY "self evaluation ratings readable by authorized performance users"
  ON public.employee_evaluation_ratings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employee_evaluations ee
      WHERE ee.id = employee_evaluation_id
        AND public.can_access_performance_employee(ee.employee_id)
    )
  );

DROP POLICY IF EXISTS "supervisor evaluations readable by assigned portal users" ON public.supervisor_evaluations;
CREATE POLICY "supervisor evaluations readable by authorized performance users"
  ON public.supervisor_evaluations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employee_evaluations ee
      WHERE ee.id = employee_evaluation_id
        AND public.can_access_performance_employee(ee.employee_id)
    )
  );

DROP POLICY IF EXISTS "supervisor ratings readable by assigned portal users" ON public.supervisor_evaluation_ratings;
CREATE POLICY "supervisor ratings readable by authorized performance users"
  ON public.supervisor_evaluation_ratings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.supervisor_evaluations se
      JOIN public.employee_evaluations ee ON ee.id = se.employee_evaluation_id
      WHERE se.id = supervisor_evaluation_id
        AND public.can_access_performance_employee(ee.employee_id)
    )
  );

DROP POLICY IF EXISTS "evaluation attachments readable by assigned portal users" ON public.evaluation_attachments;
CREATE POLICY "evaluation attachments readable by authorized performance users"
  ON public.evaluation_attachments FOR SELECT TO authenticated
  USING (
    (
      employee_evaluation_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.employee_evaluations ee
        WHERE ee.id = employee_evaluation_id
          AND public.can_access_performance_employee(ee.employee_id)
      )
    )
    OR (
      supervisor_evaluation_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.supervisor_evaluations se
        JOIN public.employee_evaluations ee ON ee.id = se.employee_evaluation_id
        WHERE se.id = supervisor_evaluation_id
          AND public.can_access_performance_employee(ee.employee_id)
      )
    )
  );

DROP POLICY IF EXISTS "evaluation comments readable by assigned portal users" ON public.evaluation_comments;
CREATE POLICY "evaluation comments readable by authorized performance users"
  ON public.evaluation_comments FOR SELECT TO authenticated
  USING (
    (
      employee_evaluation_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.employee_evaluations ee
        WHERE ee.id = employee_evaluation_id
          AND public.can_access_performance_employee(ee.employee_id)
      )
    )
    OR (
      supervisor_evaluation_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.supervisor_evaluations se
        JOIN public.employee_evaluations ee ON ee.id = se.employee_evaluation_id
        WHERE se.id = supervisor_evaluation_id
          AND public.can_access_performance_employee(ee.employee_id)
      )
    )
  );

DROP POLICY IF EXISTS "evaluation audit readable by assigned portal users" ON public.evaluation_audit_logs;
CREATE POLICY "evaluation audit readable by authorized performance users"
  ON public.evaluation_audit_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employee_evaluations ee
      WHERE ee.id = employee_evaluation_id
        AND public.can_access_performance_employee(ee.employee_id)
    )
  );

DROP POLICY IF EXISTS "active positions readable by portal users" ON public.job_positions;
CREATE POLICY "active positions readable by performance users"
  ON public.job_positions FOR SELECT TO authenticated
  USING (
    is_active AND (
      public.has_portal_role(auth.uid(), 'EMPLOYEE')
      OR public.has_portal_role(auth.uid(), 'SUPERVISOR')
      OR public.has_permission(auth.uid(), 'performance.profiles.manage')
    )
  );

DROP POLICY IF EXISTS "active evaluation templates readable by portal users" ON public.evaluation_templates;
CREATE POLICY "evaluation templates readable by performance users"
  ON public.evaluation_templates FOR SELECT TO authenticated
  USING (
    public.is_account_usable(auth.uid())
    AND (
      status = 'ACTIVE'
      OR public.has_permission(auth.uid(), 'performance.department.view')
      OR public.has_permission(auth.uid(), 'performance.hr_validation.view')
      OR public.has_permission(auth.uid(), 'performance.profiles.manage')
      OR public.has_permission(auth.uid(), 'performance.cycles.view')
    )
  );

DROP POLICY IF EXISTS "active template categories readable by portal users" ON public.evaluation_template_categories;
CREATE POLICY "template categories readable by performance users"
  ON public.evaluation_template_categories FOR SELECT TO authenticated
  USING (
    public.is_account_usable(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.evaluation_templates t
      WHERE t.id = template_id AND (
        t.status = 'ACTIVE'
        OR public.has_permission(auth.uid(), 'performance.department.view')
        OR public.has_permission(auth.uid(), 'performance.hr_validation.view')
        OR public.has_permission(auth.uid(), 'performance.profiles.manage')
        OR public.has_permission(auth.uid(), 'performance.cycles.view')
      )
    )
  );

DROP POLICY IF EXISTS "active template indicators readable by portal users" ON public.evaluation_indicators;
CREATE POLICY "template indicators readable by performance users"
  ON public.evaluation_indicators FOR SELECT TO authenticated
  USING (
    public.is_account_usable(auth.uid()) AND EXISTS (
      SELECT 1
      FROM public.evaluation_template_categories c
      JOIN public.evaluation_templates t ON t.id = c.template_id
      WHERE c.id = category_id AND (
        t.status = 'ACTIVE'
        OR public.has_permission(auth.uid(), 'performance.department.view')
        OR public.has_permission(auth.uid(), 'performance.hr_validation.view')
        OR public.has_permission(auth.uid(), 'performance.profiles.manage')
        OR public.has_permission(auth.uid(), 'performance.cycles.view')
      )
    )
  );

DROP POLICY IF EXISTS "active template evidence readable by portal users" ON public.evaluation_evidence_requirements;
CREATE POLICY "template evidence readable by performance users"
  ON public.evaluation_evidence_requirements FOR SELECT TO authenticated
  USING (
    public.is_account_usable(auth.uid()) AND EXISTS (
      SELECT 1
      FROM public.evaluation_template_categories c
      JOIN public.evaluation_templates t ON t.id = c.template_id
      WHERE c.id = category_id AND (
        t.status = 'ACTIVE'
        OR public.has_permission(auth.uid(), 'performance.department.view')
        OR public.has_permission(auth.uid(), 'performance.hr_validation.view')
        OR public.has_permission(auth.uid(), 'performance.profiles.manage')
        OR public.has_permission(auth.uid(), 'performance.cycles.view')
      )
    )
  );

CREATE OR REPLACE FUNCTION public.department_head_decide_performance(
  _evaluation_id uuid,
  _actor_user_id uuid,
  _decision text,
  _reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  evaluation_row public.employee_evaluations%ROWTYPE;
  supervisor_row public.supervisor_evaluations%ROWTYPE;
  event_id uuid;
  next_status text;
BEGIN
  IF _decision NOT IN ('APPROVE', 'RETURN') THEN
    RAISE EXCEPTION 'Unsupported Department Head decision';
  END IF;
  IF _decision = 'RETURN' AND length(btrim(COALESCE(_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'A return reason is required';
  END IF;

  SELECT * INTO evaluation_row
  FROM public.employee_evaluations
  WHERE id = _evaluation_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evaluation not found'; END IF;
  IF evaluation_row.status NOT IN ('PENDING_DEPARTMENT_HEAD_APPROVAL', 'RETURNED_BY_HR')
    OR evaluation_row.department_head_user_id <> _actor_user_id
    OR NOT public.has_permission(_actor_user_id, 'performance.department_approval.' ||
      CASE WHEN _decision = 'APPROVE' THEN 'approve' ELSE 'return' END)
    OR NOT EXISTS (
      SELECT 1 FROM public.department_head_assignments dha
      WHERE dha.department_id = evaluation_row.department_id
        AND dha.user_id = _actor_user_id AND dha.is_active
    )
    OR (
      evaluation_row.status = 'RETURNED_BY_HR'
      AND NOT EXISTS (
        SELECT 1 FROM public.performance_workflow_events w
        WHERE w.employee_evaluation_id = _evaluation_id
          AND w.action IN ('HR_RETURNED', 'HR_CORRECTION_REASSIGNED')
          AND w.responsible_user_id = _actor_user_id
          AND w.occurred_at = (
            SELECT max(w2.occurred_at)
            FROM public.performance_workflow_events w2
            WHERE w2.employee_evaluation_id = _evaluation_id
              AND w2.action IN ('HR_RETURNED', 'HR_CORRECTION_REASSIGNED')
          )
      )
    ) THEN
    RAISE EXCEPTION 'Not authorized to decide this Department Head approval';
  END IF;

  SELECT * INTO supervisor_row
  FROM public.supervisor_evaluations
  WHERE employee_evaluation_id = _evaluation_id
  FOR UPDATE;
  IF NOT FOUND OR supervisor_row.status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'A submitted Supervisor assessment is required before Department Head approval';
  END IF;

  next_status := CASE WHEN _decision = 'APPROVE'
    THEN 'PENDING_HR_VALIDATION' ELSE 'RETURNED_BY_DEPARTMENT_HEAD' END;
  UPDATE public.employee_evaluations
  SET status = next_status
  WHERE id = _evaluation_id;
  IF _decision = 'RETURN' THEN
    UPDATE public.supervisor_evaluations SET status = 'RETURNED'
    WHERE id = supervisor_row.id;
  END IF;

  INSERT INTO public.performance_workflow_events (
    employee_evaluation_id, actor_user_id, actor_role, action,
    previous_status, new_status, decision, reason, responsible_user_id
  ) VALUES (
    _evaluation_id, _actor_user_id, 'DEPARTMENT_HEAD',
    CASE WHEN _decision = 'APPROVE' THEN 'DEPARTMENT_HEAD_APPROVED' ELSE 'DEPARTMENT_HEAD_RETURNED' END,
    evaluation_row.status, next_status, _decision, NULLIF(btrim(_reason), ''),
    CASE WHEN _decision = 'RETURN' THEN evaluation_row.assigned_supervisor_user_id ELSE NULL END
  ) RETURNING id INTO event_id;

  INSERT INTO public.evaluation_audit_logs (
    employee_evaluation_id, actor_user_id, action, previous_value, new_value
  ) VALUES (
    _evaluation_id, _actor_user_id,
    CASE WHEN _decision = 'APPROVE' THEN 'DEPARTMENT_HEAD_APPROVED' ELSE 'DEPARTMENT_HEAD_RETURNED' END,
    jsonb_build_object('status', evaluation_row.status),
    jsonb_build_object('status', next_status, 'reason', NULLIF(btrim(_reason), ''))
  );

  IF _decision = 'APPROVE' THEN
    INSERT INTO public.performance_notifications (
      recipient_user_id, employee_evaluation_id, event_type, title, message, dedupe_key
    )
    SELECT u.id, _evaluation_id, 'HR_VALIDATION_REQUIRED', 'Evaluation pending HR validation',
      'A Department Head approved evaluation is ready for HR validation.',
      'workflow:' || event_id::text || ':' || u.id::text
    FROM public.internal_users u
    WHERE u.is_active AND NOT u.is_locked
      AND public.has_permission(u.id, 'performance.hr_validation.view')
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

    IF evaluation_row.assigned_supervisor_user_id IS NOT NULL THEN
      INSERT INTO public.performance_notifications (
        recipient_user_id, employee_evaluation_id, event_type, title, message, dedupe_key
      ) VALUES (
        evaluation_row.assigned_supervisor_user_id, _evaluation_id, 'DEPARTMENT_HEAD_APPROVED',
        'Department Head approved evaluation', 'The evaluation has advanced to HR validation.',
        'workflow:' || event_id::text || ':' || evaluation_row.assigned_supervisor_user_id::text
      ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;
  ELSE
    INSERT INTO public.performance_notifications (
      recipient_user_id, employee_evaluation_id, event_type, title, message, dedupe_key
    )
    SELECT evaluation_row.assigned_supervisor_user_id, _evaluation_id, 'DEPARTMENT_HEAD_RETURNED',
      'Evaluation returned for correction', 'The Department Head returned the assessment: ' || btrim(_reason),
      'workflow:' || event_id::text || ':' || evaluation_row.assigned_supervisor_user_id::text
    WHERE evaluation_row.assigned_supervisor_user_id IS NOT NULL
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  RETURN next_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_decide_performance(
  _evaluation_id uuid,
  _actor_user_id uuid,
  _decision text,
  _reason text DEFAULT NULL,
  _responsible_party text DEFAULT NULL,
  _checklist jsonb DEFAULT '{}'::jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  evaluation_row public.employee_evaluations%ROWTYPE;
  supervisor_row public.supervisor_evaluations%ROWTYPE;
  profile_version integer;
  employee_user_id uuid;
  responsible_user_id uuid;
  event_id uuid;
  next_status text;
BEGIN
  IF _decision NOT IN ('FINALIZE', 'RETURN') THEN
    RAISE EXCEPTION 'Unsupported HR decision';
  END IF;
  IF _decision = 'RETURN' AND (
    length(btrim(COALESCE(_reason, ''))) = 0
    OR _responsible_party NOT IN ('EMPLOYEE', 'SUPERVISOR', 'DEPARTMENT_HEAD')
  ) THEN
    RAISE EXCEPTION 'A return reason and responsible party are required';
  END IF;

  SELECT * INTO evaluation_row
  FROM public.employee_evaluations
  WHERE id = _evaluation_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evaluation not found'; END IF;
  IF evaluation_row.status <> 'PENDING_HR_VALIDATION'
    OR NOT public.has_permission(
      _actor_user_id,
      'performance.hr_validation.' || CASE WHEN _decision = 'FINALIZE' THEN 'finalize' ELSE 'return' END
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.performance_workflow_events w
      WHERE w.employee_evaluation_id = _evaluation_id
        AND w.action = 'DEPARTMENT_HEAD_APPROVED'
        AND w.new_status = 'PENDING_HR_VALIDATION'
    ) THEN
    RAISE EXCEPTION 'Not authorized or the required Department Head approval is missing';
  END IF;

  IF _decision = 'FINALIZE' THEN
    IF NOT COALESCE(
      (_checklist->>'employee_record')::boolean
      AND (_checklist->>'department')::boolean
      AND (_checklist->>'supervisor')::boolean
      AND (_checklist->>'department_head')::boolean
      AND (_checklist->>'evaluation_period')::boolean
      AND (_checklist->>'profile_version')::boolean
      AND (_checklist->>'required_ratings')::boolean
      AND (_checklist->>'required_evidence')::boolean
      AND (_checklist->>'department_head_approval')::boolean
      AND (_checklist->>'no_open_corrections')::boolean,
      false
    ) THEN
      RAISE EXCEPTION 'Complete every HR validation checklist item before finalizing';
    END IF;
    IF (
      SELECT count(*)
      FROM public.employee_evaluation_ratings r
      JOIN public.evaluation_template_categories c ON c.id = r.category_id
      WHERE r.employee_evaluation_id = _evaluation_id
        AND c.template_id = evaluation_row.template_id AND r.rating BETWEEN 1 AND 5
    ) <> 8 OR (
      SELECT count(*) FROM public.supervisor_evaluation_ratings r
      JOIN public.supervisor_evaluations se ON se.id = r.supervisor_evaluation_id
      JOIN public.evaluation_template_categories c ON c.id = r.category_id
      WHERE se.employee_evaluation_id = _evaluation_id
        AND c.template_id = evaluation_row.template_id AND r.rating BETWEEN 1 AND 5
    ) <> 8 THEN
      RAISE EXCEPTION 'Both employee and Supervisor assessments must have all eight ratings';
    END IF;
    IF evaluation_row.department_id IS NULL
      OR evaluation_row.department_head_user_id IS NULL
      OR evaluation_row.assigned_supervisor_user_id IS NULL
      OR evaluation_row.template_version_snapshot IS NULL
      OR evaluation_row.template_version_snapshot < 1 THEN
      RAISE EXCEPTION 'The evaluation is missing a required department, reviewer, or profile snapshot';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = evaluation_row.employee_id
        AND length(btrim(e.employee_number)) > 0
        AND length(btrim(e.full_name)) > 0
    ) OR NOT EXISTS (
      SELECT 1 FROM public.performance_departments d
      WHERE d.id = evaluation_row.department_id
    ) OR NOT EXISTS (
      SELECT 1 FROM public.internal_users u
      WHERE u.id = evaluation_row.assigned_supervisor_user_id
    ) OR NOT EXISTS (
      SELECT 1 FROM public.internal_users u
      WHERE u.id = evaluation_row.department_head_user_id
    ) OR NOT EXISTS (
      SELECT 1 FROM public.evaluation_periods p
      WHERE p.id = evaluation_row.evaluation_period_id
    ) THEN
      RAISE EXCEPTION 'The employee, department, reviewer, or evaluation period record is incomplete';
    END IF;
    SELECT * INTO supervisor_row
    FROM public.supervisor_evaluations
    WHERE employee_evaluation_id = _evaluation_id
    FOR UPDATE;
    IF NOT FOUND OR supervisor_row.status <> 'SUBMITTED'
      OR supervisor_row.supervisor_user_id <> evaluation_row.assigned_supervisor_user_id THEN
      RAISE EXCEPTION 'The assigned Supervisor assessment is not submitted';
    END IF;
    SELECT t.version INTO profile_version
    FROM public.evaluation_templates t
    WHERE t.id = evaluation_row.template_id;
    IF profile_version IS NULL OR profile_version <> evaluation_row.template_version_snapshot THEN
      RAISE EXCEPTION 'The saved evaluation profile version could not be verified';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.performance_workflow_events approval
      WHERE approval.employee_evaluation_id = _evaluation_id
        AND approval.action = 'DEPARTMENT_HEAD_APPROVED'
        AND approval.actor_user_id = evaluation_row.department_head_user_id
        AND approval.new_status = 'PENDING_HR_VALIDATION'
        AND approval.occurred_at > COALESCE(
          (
            SELECT max(submission.occurred_at)
            FROM public.performance_workflow_events submission
            WHERE submission.employee_evaluation_id = _evaluation_id
              AND submission.action = 'SUPERVISOR_SUBMITTED'
          ),
          '-infinity'::timestamptz
        )
    ) THEN
      RAISE EXCEPTION 'The latest Supervisor submission has not been approved by its Department Head';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.evaluation_evidence_requirements req
      JOIN public.evaluation_template_categories c ON c.id = req.category_id
      JOIN public.employee_evaluation_ratings r
        ON r.category_id = c.id AND r.employee_evaluation_id = _evaluation_id
      WHERE req.is_required AND length(btrim(r.evidence)) = 0
    ) OR EXISTS (
      SELECT 1
      FROM public.evaluation_evidence_requirements req
      JOIN public.evaluation_template_categories c ON c.id = req.category_id
      JOIN public.supervisor_evaluations se
        ON se.employee_evaluation_id = _evaluation_id
      JOIN public.supervisor_evaluation_ratings r
        ON r.category_id = c.id AND r.supervisor_evaluation_id = se.id
      WHERE req.is_required AND length(btrim(r.evidence)) = 0
    ) THEN
      RAISE EXCEPTION 'Required supporting evidence is missing';
    END IF;
    SELECT e.user_id INTO employee_user_id
    FROM public.employees e WHERE e.id = evaluation_row.employee_id;
    next_status := 'FINALIZED';
    UPDATE public.employee_evaluations
    SET status = next_status, finalized_by = _actor_user_id, finalized_at = now()
    WHERE id = _evaluation_id;
  ELSE
    SELECT e.user_id INTO employee_user_id
    FROM public.employees e WHERE e.id = evaluation_row.employee_id;
    responsible_user_id := CASE _responsible_party
      WHEN 'EMPLOYEE' THEN employee_user_id
      WHEN 'SUPERVISOR' THEN evaluation_row.assigned_supervisor_user_id
      WHEN 'DEPARTMENT_HEAD' THEN evaluation_row.department_head_user_id
      ELSE NULL
    END;
    IF responsible_user_id IS NULL THEN
      RAISE EXCEPTION 'The selected responsible reviewer has no linked account';
    END IF;
    next_status := 'RETURNED_BY_HR';
    UPDATE public.employee_evaluations SET status = next_status
    WHERE id = _evaluation_id;
    IF _responsible_party IN ('EMPLOYEE', 'SUPERVISOR') THEN
      UPDATE public.supervisor_evaluations SET status = 'RETURNED'
      WHERE employee_evaluation_id = _evaluation_id AND status = 'SUBMITTED';
    END IF;
  END IF;

  INSERT INTO public.performance_workflow_events (
    employee_evaluation_id, actor_user_id, actor_role, action,
    previous_status, new_status, decision, reason, responsible_user_id, details
  ) VALUES (
    _evaluation_id, _actor_user_id, 'HR',
    CASE WHEN _decision = 'FINALIZE' THEN 'HR_FINALIZED' ELSE 'HR_RETURNED' END,
    evaluation_row.status, next_status, _decision, NULLIF(btrim(_reason), ''),
    responsible_user_id, CASE WHEN _decision = 'FINALIZE' THEN _checklist ELSE '{}'::jsonb END
  ) RETURNING id INTO event_id;

  INSERT INTO public.evaluation_audit_logs (
    employee_evaluation_id, actor_user_id, action, previous_value, new_value
  ) VALUES (
    _evaluation_id, _actor_user_id,
    CASE WHEN _decision = 'FINALIZE' THEN 'HR_FINALIZED' ELSE 'HR_RETURNED' END,
    jsonb_build_object('status', evaluation_row.status),
    jsonb_build_object('status', next_status, 'responsible_party', _responsible_party,
      'reason', NULLIF(btrim(_reason), ''))
  );

  IF _decision = 'FINALIZE' THEN
    INSERT INTO public.performance_notifications (
      recipient_user_id, employee_evaluation_id, event_type, title, message, dedupe_key
    )
    SELECT recipient, _evaluation_id, 'EVALUATION_FINALIZED',
      'Performance evaluation finalized', 'Your performance evaluation is finalized.',
      'workflow:' || event_id::text || ':' || recipient::text
    FROM (
      SELECT employee_user_id AS recipient
      UNION
      SELECT evaluation_row.assigned_supervisor_user_id
      UNION
      SELECT evaluation_row.department_head_user_id
    ) recipients
    WHERE recipient IS NOT NULL
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  ELSE
    INSERT INTO public.performance_notifications (
      recipient_user_id, employee_evaluation_id, event_type, title, message, dedupe_key
    ) VALUES (
      responsible_user_id, _evaluation_id, 'HR_RETURNED', 'Evaluation returned for correction',
      'HR returned the evaluation to the responsible reviewer: ' || btrim(_reason),
      'workflow:' || event_id::text || ':' || responsible_user_id::text
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  RETURN next_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_performance_evaluation(
  _evaluation_id uuid,
  _actor_user_id uuid,
  _responsible_party text,
  _reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  evaluation_row public.employee_evaluations%ROWTYPE;
  employee_user_id uuid;
  responsible_user_id uuid;
  event_id uuid;
  actor_role text;
BEGIN
  IF _responsible_party NOT IN ('EMPLOYEE', 'SUPERVISOR')
    OR length(btrim(COALESCE(_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'A responsible reviewer and reason are required to reopen';
  END IF;
  IF NOT public.has_permission(_actor_user_id, 'performance.reopen') THEN
    RAISE EXCEPTION 'Not authorized to reopen performance evaluations';
  END IF;
  SELECT * INTO evaluation_row
  FROM public.employee_evaluations
  WHERE id = _evaluation_id
  FOR UPDATE;
  IF NOT FOUND OR evaluation_row.status <> 'FINALIZED' THEN
    RAISE EXCEPTION 'Only a finalized evaluation can be reopened';
  END IF;
  SELECT e.user_id INTO employee_user_id
  FROM public.employees e WHERE e.id = evaluation_row.employee_id;
  responsible_user_id := CASE _responsible_party
    WHEN 'EMPLOYEE' THEN employee_user_id
    WHEN 'SUPERVISOR' THEN evaluation_row.assigned_supervisor_user_id
  END;
  IF responsible_user_id IS NULL THEN
    RAISE EXCEPTION 'The responsible reviewer has no linked account';
  END IF;
  SELECT ur.role INTO actor_role FROM public.user_roles ur WHERE ur.user_id = _actor_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'The reopening account has no assigned role'; END IF;
  PERFORM set_config('app.performance_reopen', 'true', true);
  UPDATE public.employee_evaluations
  SET status = 'REOPENED'
  WHERE id = _evaluation_id;
  UPDATE public.supervisor_evaluations
  SET status = 'RETURNED'
  WHERE employee_evaluation_id = _evaluation_id
    AND status IN ('SUBMITTED', 'COMPLETED');
  INSERT INTO public.performance_workflow_events (
    employee_evaluation_id, actor_user_id, actor_role, action,
    previous_status, new_status, decision, reason, responsible_user_id
  ) VALUES (
    _evaluation_id, _actor_user_id, actor_role, 'EVALUATION_REOPENED',
    evaluation_row.status, 'REOPENED', 'REOPEN', btrim(_reason), responsible_user_id
  ) RETURNING id INTO event_id;
  INSERT INTO public.evaluation_audit_logs (
    employee_evaluation_id, actor_user_id, action, previous_value, new_value
  ) VALUES (
    _evaluation_id, _actor_user_id, 'EVALUATION_REOPENED',
    jsonb_build_object('status', evaluation_row.status),
    jsonb_build_object('status', 'REOPENED', 'responsible_party', _responsible_party, 'reason', btrim(_reason))
  );
  INSERT INTO public.performance_notifications (
    recipient_user_id, employee_evaluation_id, event_type, title, message, dedupe_key
  ) VALUES (
    responsible_user_id, _evaluation_id, 'HR_RETURNED', 'Evaluation reopened for correction',
    'The finalized evaluation was reopened: ' || btrim(_reason),
    'workflow:' || event_id::text || ':' || responsible_user_id::text
  ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN 'REOPENED';
END;
$$;

CREATE OR REPLACE FUNCTION public.supervisor_return_self_evaluation(
  _evaluation_id uuid,
  _actor_user_id uuid,
  _reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  evaluation_row public.employee_evaluations%ROWTYPE;
  employee_user_id uuid;
  supervisor_row public.supervisor_evaluations%ROWTYPE;
  event_id uuid;
BEGIN
  IF length(btrim(COALESCE(_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'A correction reason is required';
  END IF;
  IF NOT public.has_role(_actor_user_id, 'SUPERVISOR')
    OR NOT public.has_permission(_actor_user_id, 'evaluations.return_employee') THEN
    RAISE EXCEPTION 'Not authorized to return employee self-evaluations';
  END IF;
  SELECT * INTO evaluation_row
  FROM public.employee_evaluations
  WHERE id = _evaluation_id
  FOR UPDATE;
  IF NOT FOUND OR evaluation_row.assigned_supervisor_user_id <> _actor_user_id
    OR evaluation_row.status NOT IN (
      'SUBMITTED', 'PENDING_SUPERVISOR_REVIEW', 'SUPERVISOR_IN_PROGRESS',
      'RETURNED_BY_DEPARTMENT_HEAD', 'RETURNED_BY_HR', 'REOPENED'
    ) THEN
    RAISE EXCEPTION 'This evaluation is not available for a Supervisor correction request';
  END IF;
  IF evaluation_row.status IN ('RETURNED_BY_HR', 'REOPENED')
    AND NOT EXISTS (
      SELECT 1 FROM public.performance_workflow_events w
      WHERE w.employee_evaluation_id = _evaluation_id
        AND w.action IN ('HR_RETURNED', 'EVALUATION_REOPENED')
        AND w.responsible_user_id = _actor_user_id
        AND w.occurred_at = (
          SELECT max(w2.occurred_at)
          FROM public.performance_workflow_events w2
          WHERE w2.employee_evaluation_id = _evaluation_id
            AND w2.action IN ('HR_RETURNED', 'EVALUATION_REOPENED')
        )
    ) THEN
    RAISE EXCEPTION 'This correction was assigned to another reviewer';
  END IF;
  SELECT e.user_id INTO employee_user_id
  FROM public.employees e WHERE e.id = evaluation_row.employee_id;
  IF employee_user_id IS NULL THEN
    RAISE EXCEPTION 'The employee account is unavailable';
  END IF;
  UPDATE public.employee_evaluations
  SET status = 'RETURNED_FOR_REVISION'
  WHERE id = _evaluation_id;
  SELECT * INTO supervisor_row
  FROM public.supervisor_evaluations
  WHERE employee_evaluation_id = _evaluation_id
  FOR UPDATE;
  IF FOUND AND supervisor_row.status IN ('IN_PROGRESS', 'SUBMITTED', 'COMPLETED') THEN
    UPDATE public.supervisor_evaluations
    SET status = 'RETURNED'
    WHERE id = supervisor_row.id;
  END IF;
  INSERT INTO public.performance_workflow_events (
    employee_evaluation_id, actor_user_id, actor_role, action,
    previous_status, new_status, decision, reason, responsible_user_id
  ) VALUES (
    _evaluation_id, _actor_user_id, 'SUPERVISOR', 'SUPERVISOR_RETURNED_TO_EMPLOYEE',
    evaluation_row.status, 'RETURNED_FOR_REVISION', 'RETURN', btrim(_reason), employee_user_id
  ) RETURNING id INTO event_id;
  INSERT INTO public.evaluation_audit_logs (
    employee_evaluation_id, actor_user_id, action, previous_value, new_value
  ) VALUES (
    _evaluation_id, _actor_user_id, 'SUPERVISOR_RETURNED_TO_EMPLOYEE',
    jsonb_build_object('status', evaluation_row.status),
    jsonb_build_object('status', 'RETURNED_FOR_REVISION', 'reason', btrim(_reason))
  );
  INSERT INTO public.performance_notifications (
    recipient_user_id, employee_evaluation_id, event_type, title, message, dedupe_key
  ) VALUES (
    employee_user_id, _evaluation_id, 'EVALUATION_RETURNED', 'Self-evaluation returned for correction',
    'Your Supervisor requested a correction: ' || btrim(_reason),
    'workflow:' || event_id::text || ':' || employee_user_id::text
  ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN 'RETURNED_FOR_REVISION';
END;
$$;

REVOKE ALL ON FUNCTION public.department_head_decide_performance(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_decide_performance(uuid, uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reopen_performance_evaluation(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supervisor_return_self_evaluation(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.department_head_decide_performance(uuid, uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.hr_decide_performance(uuid, uuid, text, text, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reopen_performance_evaluation(uuid, uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.supervisor_return_self_evaluation(uuid, uuid, text)
  TO service_role;

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
  head_user_id := evaluation_row.department_head_user_id;
  IF head_user_id IS NULL AND evaluation_row.department_id IS NOT NULL THEN
    SELECT dha.user_id INTO head_user_id
    FROM public.department_head_assignments dha
    WHERE dha.department_id = evaluation_row.department_id AND dha.is_active;
    IF head_user_id IS NOT NULL THEN
      UPDATE public.employee_evaluations SET department_head_user_id = head_user_id
      WHERE id = _evaluation_id;
    END IF;
  END IF;
  IF head_user_id IS NULL OR NOT public.has_permission(head_user_id, 'performance.department_approval.view') THEN
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

  SELECT COALESCE(MAX(submission_number), 0) + 1 INTO next_number
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

CREATE OR REPLACE FUNCTION public.submit_employee_performance(
  _evaluation_id uuid,
  _actor_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  evaluation_row public.employee_evaluations%ROWTYPE;
  next_number integer;
  rating_count integer;
  profile_category_count integer;
  profile_weight_total numeric;
  calculated_score numeric;
  assessment_snapshot jsonb;
  event_id uuid;
BEGIN
  SELECT * INTO evaluation_row
  FROM public.employee_evaluations
  WHERE id = _evaluation_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public.has_role(_actor_user_id, 'EMPLOYEE')
    OR NOT EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = evaluation_row.employee_id AND e.user_id = _actor_user_id
    ) THEN
    RAISE EXCEPTION 'Not authorized to submit this employee self-evaluation';
  END IF;
  IF evaluation_row.status NOT IN (
    'DRAFT', 'IN_PROGRESS', 'RETURNED_FOR_REVISION', 'RETURNED_BY_HR', 'REOPENED'
  ) THEN
    RAISE EXCEPTION 'This employee evaluation is not open for submission';
  END IF;
  IF evaluation_row.status IN ('RETURNED_BY_HR', 'REOPENED')
    AND NOT EXISTS (
      SELECT 1 FROM public.performance_workflow_events w
      WHERE w.employee_evaluation_id = _evaluation_id
        AND w.action IN ('HR_RETURNED', 'EVALUATION_REOPENED')
        AND w.responsible_user_id = _actor_user_id
        AND w.occurred_at = (
          SELECT max(w2.occurred_at)
          FROM public.performance_workflow_events w2
          WHERE w2.employee_evaluation_id = _evaluation_id
            AND w2.action IN ('HR_RETURNED', 'EVALUATION_REOPENED')
        )
    ) THEN
    RAISE EXCEPTION 'This correction was assigned to another reviewer';
  END IF;
  IF evaluation_row.assigned_supervisor_user_id IS NULL
    OR NOT public.has_role(evaluation_row.assigned_supervisor_user_id, 'SUPERVISOR') THEN
    RAISE EXCEPTION 'An authorized Supervisor must be assigned before submission';
  END IF;

  SELECT count(*)::integer, sum(c.weight)
  INTO profile_category_count, profile_weight_total
  FROM public.evaluation_template_categories c
  WHERE c.template_id = evaluation_row.template_id;
  IF profile_category_count <> 8 OR abs(profile_weight_total - 100) >= 0.0001 THEN
    RAISE EXCEPTION 'The assigned evaluation profile must contain eight categories weighted to 100%%';
  END IF;

  SELECT count(*)::integer, round(sum(r.rating * c.weight) / 100, 2)
  INTO rating_count, calculated_score
  FROM public.employee_evaluation_ratings r
  JOIN public.evaluation_template_categories c ON c.id = r.category_id
  WHERE r.employee_evaluation_id = _evaluation_id
    AND c.template_id = evaluation_row.template_id
    AND r.rating BETWEEN 1 AND 5;
  IF rating_count <> 8 OR calculated_score NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Complete all eight valid self-assessment ratings before submitting';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.evaluation_evidence_requirements req
    JOIN public.employee_evaluation_ratings r
      ON r.category_id = req.category_id
     AND r.employee_evaluation_id = _evaluation_id
    JOIN public.evaluation_template_categories c ON c.id = req.category_id
    WHERE c.template_id = evaluation_row.template_id
      AND req.is_required AND length(btrim(r.evidence)) = 0
  ) THEN
    RAISE EXCEPTION 'Required supporting evidence is missing';
  END IF;
  SELECT jsonb_agg(
    jsonb_build_object(
      'categoryId', c.id,
      'rating', r.rating,
      'comments', r.comments,
      'evidence', r.evidence
    ) ORDER BY c.position
  ) INTO assessment_snapshot
  FROM public.employee_evaluation_ratings r
  JOIN public.evaluation_template_categories c ON c.id = r.category_id
  WHERE r.employee_evaluation_id = _evaluation_id
    AND c.template_id = evaluation_row.template_id;
  SELECT COALESCE(MAX(s.submission_number), 0) + 1
  INTO next_number
  FROM public.employee_evaluation_submissions s
  WHERE s.employee_evaluation_id = _evaluation_id;
  INSERT INTO public.employee_evaluation_submissions (
    employee_evaluation_id, submission_number, submitted_by, weighted_score, assessment_snapshot
  ) VALUES (
    _evaluation_id, next_number, _actor_user_id, calculated_score, assessment_snapshot
  );
  UPDATE public.employee_evaluations
  SET status = 'SUBMITTED', weighted_score = calculated_score,
      submitted_at = now()
  WHERE id = _evaluation_id;
  INSERT INTO public.performance_workflow_events (
    employee_evaluation_id, actor_user_id, actor_role, action,
    previous_status, new_status, decision, responsible_user_id
  ) VALUES (
    _evaluation_id, _actor_user_id, 'EMPLOYEE',
    CASE WHEN evaluation_row.status IN ('RETURNED_FOR_REVISION', 'RETURNED_BY_HR', 'REOPENED')
      THEN 'EMPLOYEE_RESUBMITTED' ELSE 'EMPLOYEE_SUBMITTED' END,
    evaluation_row.status, 'SUBMITTED', 'SUBMITTED',
    evaluation_row.assigned_supervisor_user_id
  ) RETURNING id INTO event_id;
  INSERT INTO public.evaluation_audit_logs (
    employee_evaluation_id, actor_user_id, action, previous_value, new_value
  ) VALUES (
    _evaluation_id, _actor_user_id,
    CASE WHEN evaluation_row.status IN ('RETURNED_FOR_REVISION', 'RETURNED_BY_HR', 'REOPENED')
      THEN 'SELF_EVALUATION_RESUBMITTED' ELSE 'SELF_EVALUATION_SUBMITTED' END,
    jsonb_build_object('status', evaluation_row.status),
    jsonb_build_object('status', 'SUBMITTED', 'weighted_score', calculated_score)
  );
  INSERT INTO public.performance_notifications (
    recipient_user_id, employee_evaluation_id, event_type, title, message, dedupe_key
  ) VALUES (
    evaluation_row.assigned_supervisor_user_id, _evaluation_id,
    CASE WHEN evaluation_row.status IN ('RETURNED_FOR_REVISION', 'RETURNED_BY_HR', 'REOPENED')
      THEN 'EMPLOYEE_RESUBMITTED' ELSE 'EMPLOYEE_SUBMITTED' END,
    CASE WHEN evaluation_row.status IN ('RETURNED_FOR_REVISION', 'RETURNED_BY_HR', 'REOPENED')
      THEN 'Employee resubmitted an evaluation' ELSE 'Employee submitted a self-evaluation' END,
    'A self-evaluation is ready for Supervisor review.',
    'workflow:' || event_id::text || ':' || evaluation_row.assigned_supervisor_user_id::text
  ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN 'SUBMITTED';
END;
$$;

REVOKE ALL ON FUNCTION public.submit_supervisor_performance(uuid, uuid, numeric, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_employee_performance(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_supervisor_performance(uuid, uuid, numeric, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_employee_performance(uuid, uuid)
  TO service_role;
