INSERT INTO public.roles (code, name, description)
VALUES (
  'OPERATIONS_MANAGER',
  'Operations Manager',
  'Training and development operations with explicitly permissioned competency-gap access'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.permissions (code, module, description) VALUES
  ('competencies.framework.view', 'Competency Management', 'View the competency framework and approved requirements'),
  ('competencies.framework.manage', 'Competency Management', 'Create new versioned competency definitions'),
  ('competencies.requirements.manage', 'Competency Management', 'Create position competency requirement versions'),
  ('competencies.requirements.approve', 'Competency Management', 'Approve or return position competency requirements'),
  ('competencies.matrix.view', 'Competency Management', 'View authorized employee competency matrices'),
  ('competencies.assessments.view', 'Competency Management', 'View assessment history in authorized employee scope'),
  ('competencies.assess', 'Competency Management', 'Submit competency assessments for authorized employees'),
  ('competencies.evidence.validate', 'Competency Management', 'Validate competency assessment evidence'),
  ('competencies.assessments.approve', 'Competency Management', 'Approve or return competency assessments'),
  ('competencies.gaps.view', 'Competency Management', 'View competency gaps needed for development planning'),
  ('competencies.reassess', 'Competency Management', 'Submit authorized competency reassessments')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_code, permission_code) VALUES
  ('HR', 'competencies.framework.view'),
  ('HR', 'competencies.framework.manage'),
  ('HR', 'competencies.requirements.manage'),
  ('HR', 'competencies.requirements.approve'),
  ('HR', 'competencies.matrix.view'),
  ('HR', 'competencies.assessments.view'),
  ('HR', 'competencies.assessments.approve'),
  ('SUPERVISOR', 'competencies.framework.view'),
  ('SUPERVISOR', 'competencies.matrix.view'),
  ('SUPERVISOR', 'competencies.assessments.view'),
  ('SUPERVISOR', 'competencies.assess'),
  ('SUPERVISOR', 'competencies.evidence.validate'),
  ('SUPERVISOR', 'competencies.reassess'),
  ('DEPARTMENT_HEAD', 'competencies.framework.view'),
  ('DEPARTMENT_HEAD', 'competencies.matrix.view'),
  ('DEPARTMENT_HEAD', 'competencies.assessments.view'),
  ('DEPARTMENT_HEAD', 'competencies.assessments.approve'),
  ('DEPARTMENT_HEAD', 'competencies.gaps.view'),
  ('EMPLOYEE', 'competencies.framework.view'),
  ('EMPLOYEE', 'competencies.assessments.view'),
  ('EMPLOYEE', 'competencies.gaps.view'),
  ('OPERATIONS_MANAGER', 'competencies.framework.view'),
  ('OPERATIONS_MANAGER', 'competencies.assessments.view'),
  ('OPERATIONS_MANAGER', 'competencies.gaps.view')
ON CONFLICT DO NOTHING;

CREATE TABLE public.competency_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,39}$'),
  version integer NOT NULL CHECK (version > 0),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  category text NOT NULL CHECK (length(btrim(category)) > 0),
  description text NOT NULL CHECK (length(btrim(description)) > 0),
  observable_criteria text[] NOT NULL CHECK (cardinality(observable_criteria) > 0),
  assessment_methods text[] NOT NULL CHECK (cardinality(assessment_methods) > 0),
  evidence_requirements text[] NOT NULL CHECK (cardinality(evidence_requirements) > 0),
  mandatory_qualification boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, version)
);

CREATE TABLE public.competency_proficiency_levels (
  competency_definition_id uuid NOT NULL REFERENCES public.competency_definitions(id) ON DELETE RESTRICT,
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 5),
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  observable_definition text NOT NULL CHECK (length(btrim(observable_definition)) > 0),
  PRIMARY KEY (competency_definition_id, level)
);

CREATE TABLE public.competency_requirement_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_position_id uuid NOT NULL REFERENCES public.job_positions(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'RETURNED', 'RETIRED')),
  effective_from date NOT NULL,
  created_by uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_position_id, version),
  CHECK ((status = 'APPROVED') = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE public.competency_requirement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_set_id uuid NOT NULL REFERENCES public.competency_requirement_sets(id) ON DELETE RESTRICT,
  competency_definition_id uuid NOT NULL REFERENCES public.competency_definitions(id) ON DELETE RESTRICT,
  required_level smallint NOT NULL CHECK (required_level BETWEEN 1 AND 5),
  mandatory_qualification boolean NOT NULL DEFAULT false,
  qualification_label text,
  assessment_method text NOT NULL CHECK (length(btrim(assessment_method)) > 0),
  evidence_requirement text NOT NULL CHECK (length(btrim(evidence_requirement)) > 0),
  UNIQUE (requirement_set_id, competency_definition_id),
  CHECK (NOT mandatory_qualification OR NULLIF(btrim(qualification_label), '') IS NOT NULL)
);

CREATE TABLE public.competency_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  employee_number_snapshot text NOT NULL,
  employee_name_snapshot text NOT NULL,
  job_position_id uuid NOT NULL REFERENCES public.job_positions(id) ON DELETE RESTRICT,
  job_position_name_snapshot text NOT NULL,
  department_id uuid REFERENCES public.performance_departments(id) ON DELETE RESTRICT,
  department_label_snapshot text NOT NULL DEFAULT '',
  assigned_supervisor_user_id uuid REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  department_head_user_id uuid REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  competency_definition_id uuid NOT NULL REFERENCES public.competency_definitions(id) ON DELETE RESTRICT,
  requirement_item_id uuid NOT NULL REFERENCES public.competency_requirement_items(id) ON DELETE RESTRICT,
  assessor_user_id uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  assessor_role text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  assessed_level smallint NOT NULL CHECK (assessed_level BETWEEN 1 AND 5),
  assessment_method text NOT NULL CHECK (length(btrim(assessment_method)) > 0),
  evidence_notes text NOT NULL CHECK (length(btrim(evidence_notes)) > 0),
  assessed_on date NOT NULL,
  next_assessment_on date,
  status text NOT NULL DEFAULT 'SUBMITTED'
    CHECK (status IN ('SUBMITTED', 'APPROVED', 'RETURNED')),
  evidence_validated_by uuid REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  evidence_validated_at timestamptz,
  approval_user_id uuid REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, competency_definition_id, version),
  CHECK (next_assessment_on IS NULL OR next_assessment_on >= assessed_on),
  CHECK ((status = 'APPROVED') = (approval_user_id IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE INDEX idx_competency_assessments_employee_latest
  ON public.competency_assessments(employee_id, competency_definition_id, assessed_on DESC, version DESC);

CREATE TABLE public.competency_assessment_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.competency_assessments(id) ON DELETE RESTRICT,
  source_evaluation_id uuid REFERENCES public.employee_evaluations(id) ON DELETE RESTRICT,
  source_attachment_id uuid REFERENCES public.evaluation_attachments(id) ON DELETE RESTRICT,
  evidence_reference text,
  added_by uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_evaluation_id IS NOT NULL OR source_attachment_id IS NOT NULL OR
    NULLIF(btrim(evidence_reference), '') IS NOT NULL)
);

CREATE TABLE public.competency_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competency_definition_id uuid REFERENCES public.competency_definitions(id) ON DELETE RESTRICT,
  assessment_id uuid REFERENCES public.competency_assessments(id) ON DELETE RESTRICT,
  requirement_set_id uuid REFERENCES public.competency_requirement_sets(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  previous_status text,
  new_status text,
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(competency_definition_id, assessment_id, requirement_set_id) = 1)
);

CREATE INDEX idx_competency_events_assessment
  ON public.competency_workflow_events(assessment_id, occurred_at DESC);
CREATE INDEX idx_competency_events_requirement
  ON public.competency_workflow_events(requirement_set_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.has_competency_employee_scope(
  _employee_id uuid,
  _user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_account_usable(_user_id) AND EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = _employee_id
      AND (
        (public.has_role(_user_id, 'EMPLOYEE') AND e.user_id = _user_id)
        OR (public.has_role(_user_id, 'SUPERVISOR')
          AND e.assigned_supervisor_user_id = _user_id)
        OR (public.has_role(_user_id, 'DEPARTMENT_HEAD') AND EXISTS (
          SELECT 1 FROM public.department_head_assignments dha
          WHERE dha.department_id = e.department_id
            AND dha.user_id = _user_id AND dha.is_active
        ))
        OR (public.has_role(_user_id, 'HR')
          AND public.has_permission(_user_id, 'competencies.matrix.view'))
        OR (public.has_role(_user_id, 'OPERATIONS_MANAGER')
          AND public.has_permission(_user_id, 'competencies.gaps.view'))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_competency_employee(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_competency_employee_scope(_employee_id, auth.uid());
$$;

REVOKE ALL ON FUNCTION public.has_competency_employee_scope(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_access_competency_employee(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_competency_employee(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_competency_requirement_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  previous_status text;
  next_status text;
BEGIN
  IF TG_TABLE_NAME = 'competency_requirement_sets' THEN
    IF TG_OP <> 'INSERT' THEN previous_status := OLD.status; END IF;
    IF TG_OP <> 'DELETE' THEN next_status := NEW.status; END IF;
    IF previous_status IN ('APPROVED', 'RETIRED') THEN
      RAISE EXCEPTION 'Approved or retired competency requirement versions are immutable';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  ELSE
    IF TG_OP <> 'INSERT' THEN
      SELECT s.status INTO previous_status FROM public.competency_requirement_sets s
      WHERE s.id = OLD.requirement_set_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT s.status INTO next_status FROM public.competency_requirement_sets s
      WHERE s.id = NEW.requirement_set_id;
    END IF;
  END IF;
  IF previous_status IN ('APPROVED', 'RETIRED') OR next_status IN ('APPROVED', 'RETIRED') THEN
    RAISE EXCEPTION 'Approved or retired competency requirement versions are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_competency_requirement_sets_immutable
  BEFORE UPDATE OR DELETE ON public.competency_requirement_sets
  FOR EACH ROW EXECUTE FUNCTION public.guard_competency_requirement_history();
CREATE TRIGGER trg_competency_requirement_items_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.competency_requirement_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_competency_requirement_history();

CREATE OR REPLACE FUNCTION public.prevent_competency_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Competency assessment and workflow history is append-only';
END;
$$;

CREATE TRIGGER trg_competency_events_append_only
  BEFORE UPDATE OR DELETE ON public.competency_workflow_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_competency_history_mutation();
CREATE TRIGGER trg_competency_evidence_append_only
  BEFORE UPDATE OR DELETE ON public.competency_assessment_evidence
  FOR EACH ROW EXECUTE FUNCTION public.prevent_competency_history_mutation();

CREATE OR REPLACE FUNCTION public.guard_competency_assessment_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Competency assessments are immutable; create a reassessment instead';
  END IF;
  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
    OR NEW.employee_number_snapshot IS DISTINCT FROM OLD.employee_number_snapshot
    OR NEW.employee_name_snapshot IS DISTINCT FROM OLD.employee_name_snapshot
    OR NEW.job_position_id IS DISTINCT FROM OLD.job_position_id
    OR NEW.job_position_name_snapshot IS DISTINCT FROM OLD.job_position_name_snapshot
    OR NEW.department_id IS DISTINCT FROM OLD.department_id
    OR NEW.department_label_snapshot IS DISTINCT FROM OLD.department_label_snapshot
    OR NEW.assigned_supervisor_user_id IS DISTINCT FROM OLD.assigned_supervisor_user_id
    OR NEW.department_head_user_id IS DISTINCT FROM OLD.department_head_user_id
    OR NEW.competency_definition_id IS DISTINCT FROM OLD.competency_definition_id
    OR NEW.requirement_item_id IS DISTINCT FROM OLD.requirement_item_id
    OR NEW.assessor_user_id IS DISTINCT FROM OLD.assessor_user_id
    OR NEW.assessor_role IS DISTINCT FROM OLD.assessor_role
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.assessed_level IS DISTINCT FROM OLD.assessed_level
    OR NEW.assessment_method IS DISTINCT FROM OLD.assessment_method
    OR NEW.evidence_notes IS DISTINCT FROM OLD.evidence_notes
    OR NEW.assessed_on IS DISTINCT FROM OLD.assessed_on
    OR NEW.next_assessment_on IS DISTINCT FROM OLD.next_assessment_on THEN
    RAISE EXCEPTION 'Assessment content is immutable; create a reassessment instead';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_competency_assessments_immutable
  BEFORE UPDATE OR DELETE ON public.competency_assessments
  FOR EACH ROW EXECUTE FUNCTION public.guard_competency_assessment_history();

ALTER TABLE public.competency_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competency_proficiency_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competency_requirement_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competency_requirement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competency_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competency_assessment_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competency_workflow_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.competency_definitions, public.competency_proficiency_levels,
  public.competency_requirement_sets, public.competency_requirement_items,
  public.competency_assessments, public.competency_assessment_evidence,
  public.competency_workflow_events FROM anon, authenticated;
GRANT SELECT ON public.competency_definitions, public.competency_proficiency_levels,
  public.competency_requirement_sets, public.competency_requirement_items,
  public.competency_assessments, public.competency_assessment_evidence,
  public.competency_workflow_events TO authenticated;
GRANT ALL ON public.competency_definitions, public.competency_proficiency_levels,
  public.competency_requirement_sets, public.competency_requirement_items,
  public.competency_assessments, public.competency_assessment_evidence,
  public.competency_workflow_events TO service_role;

CREATE POLICY "active competency definitions readable by signed-in users"
  ON public.competency_definitions FOR SELECT TO authenticated
  USING (public.is_account_usable(auth.uid()) AND active);
CREATE POLICY "competency levels readable by signed-in users"
  ON public.competency_proficiency_levels FOR SELECT TO authenticated
  USING (public.is_account_usable(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.competency_definitions d
    WHERE d.id = competency_definition_id AND d.active
  ));
CREATE POLICY "authorized requirement sets readable"
  ON public.competency_requirement_sets FOR SELECT TO authenticated
  USING (
    status = 'APPROVED' AND (
      public.has_permission(auth.uid(), 'competencies.matrix.view')
      OR public.has_permission(auth.uid(), 'competencies.requirements.manage')
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.job_position_id = competency_requirement_sets.job_position_id
          AND public.can_access_competency_employee(e.id)
      )
    )
  );
CREATE POLICY "authorized requirement items readable"
  ON public.competency_requirement_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.competency_requirement_sets s
    WHERE s.id = requirement_set_id AND s.status = 'APPROVED'
  ));
CREATE POLICY "scoped competency assessments readable"
  ON public.competency_assessments FOR SELECT TO authenticated
  USING (public.can_access_competency_employee(employee_id));
CREATE POLICY "scoped competency evidence readable"
  ON public.competency_assessment_evidence FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.competency_assessments a
    WHERE a.id = assessment_id AND public.can_access_competency_employee(a.employee_id)
  ));
CREATE POLICY "scoped competency workflow history readable"
  ON public.competency_workflow_events FOR SELECT TO authenticated
  USING (
    (assessment_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.competency_assessments a
      WHERE a.id = assessment_id AND public.can_access_competency_employee(a.employee_id)
    ))
    OR (requirement_set_id IS NOT NULL AND (
      public.has_permission(auth.uid(), 'competencies.requirements.manage')
      OR public.has_permission(auth.uid(), 'competencies.requirements.approve')
    ))
    OR (competency_definition_id IS NOT NULL
      AND public.has_permission(auth.uid(), 'competencies.framework.manage'))
  );

CREATE OR REPLACE FUNCTION public.save_competency_definition(
  _actor uuid,
  _code text,
  _name text,
  _category text,
  _description text,
  _observable_criteria text[],
  _assessment_methods text[],
  _evidence_requirements text[],
  _mandatory_qualification boolean,
  _levels jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  next_version integer;
  definition_id uuid;
BEGIN
  IF NOT public.has_permission(_actor, 'competencies.framework.manage') THEN
    RAISE EXCEPTION 'Not authorized to manage the competency framework';
  END IF;
  IF cardinality(_observable_criteria) = 0 OR cardinality(_assessment_methods) = 0
    OR cardinality(_evidence_requirements) = 0 OR jsonb_array_length(_levels) <> 5 THEN
    RAISE EXCEPTION 'Observable criteria, methods, evidence rules, and all five levels are required';
  END IF;
  SELECT COALESCE(max(version), 0) + 1 INTO next_version
  FROM public.competency_definitions WHERE code = upper(btrim(_code));
  UPDATE public.competency_definitions
  SET active = false
  WHERE code = upper(btrim(_code)) AND active;
  INSERT INTO public.competency_definitions (
    code, version, name, category, description, observable_criteria,
    assessment_methods, evidence_requirements, mandatory_qualification, created_by
  ) VALUES (
    upper(btrim(_code)), next_version, btrim(_name), btrim(_category), btrim(_description),
    _observable_criteria, _assessment_methods, _evidence_requirements,
    _mandatory_qualification, _actor
  ) RETURNING id INTO definition_id;
  INSERT INTO public.competency_proficiency_levels (
    competency_definition_id, level, label, observable_definition
  )
  SELECT definition_id, (item->>'level')::smallint, btrim(item->>'label'),
    btrim(item->>'definition')
  FROM jsonb_array_elements(_levels) item;
  INSERT INTO public.competency_workflow_events (
    competency_definition_id, actor_user_id, action, new_status, details
  ) VALUES (
    definition_id, _actor, 'COMPETENCY_DEFINITION_CREATED', 'ACTIVE',
    jsonb_build_object('competency_id', definition_id, 'code', upper(btrim(_code)),
      'version', next_version)
  );
  RETURN definition_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_competency_requirement_set(
  _actor uuid,
  _job_position_id uuid,
  _effective_from date,
  _items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  next_version integer;
  set_id uuid;
BEGIN
  IF NOT public.has_permission(_actor, 'competencies.requirements.manage') THEN
    RAISE EXCEPTION 'Not authorized to manage job competency requirements';
  END IF;
  IF jsonb_array_length(_items) = 0 OR NOT EXISTS (
    SELECT 1 FROM public.job_positions p WHERE p.id = _job_position_id AND p.is_active
  ) THEN
    RAISE EXCEPTION 'An active position and at least one competency requirement are required';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_items) item
    LEFT JOIN public.competency_definitions d
      ON d.id = (item->>'competency_definition_id')::uuid AND d.active
    WHERE d.id IS NULL
  ) THEN
    RAISE EXCEPTION 'All required competency definitions must be active';
  END IF;
  SELECT COALESCE(max(version), 0) + 1 INTO next_version
  FROM public.competency_requirement_sets WHERE job_position_id = _job_position_id;
  INSERT INTO public.competency_requirement_sets (
    job_position_id, version, effective_from, created_by
  ) VALUES (_job_position_id, next_version, _effective_from, _actor)
  RETURNING id INTO set_id;
  INSERT INTO public.competency_requirement_items (
    requirement_set_id, competency_definition_id, required_level,
    mandatory_qualification, qualification_label, assessment_method, evidence_requirement
  )
  SELECT set_id, (item->>'competency_definition_id')::uuid,
    (item->>'required_level')::smallint,
    COALESCE((item->>'mandatory_qualification')::boolean, false),
    NULLIF(btrim(item->>'qualification_label'), ''),
    btrim(item->>'assessment_method'), btrim(item->>'evidence_requirement')
  FROM jsonb_array_elements(_items) item;
  INSERT INTO public.competency_workflow_events (
    requirement_set_id, actor_user_id, action, new_status, details
  ) VALUES (set_id, _actor, 'REQUIREMENTS_SUBMITTED', 'PENDING_APPROVAL',
    jsonb_build_object('version', next_version, 'item_count', jsonb_array_length(_items)));
  UPDATE public.competency_requirement_sets SET status = 'PENDING_APPROVAL' WHERE id = set_id;
  RETURN set_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_competency_requirement_set(
  _actor uuid,
  _requirement_set_id uuid,
  _approve boolean,
  _reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  set_row public.competency_requirement_sets%ROWTYPE;
  next_status text;
BEGIN
  IF NOT public.has_permission(_actor, 'competencies.requirements.approve') THEN
    RAISE EXCEPTION 'Not authorized to approve competency requirements';
  END IF;
  SELECT * INTO set_row FROM public.competency_requirement_sets
  WHERE id = _requirement_set_id FOR UPDATE;
  IF NOT FOUND OR set_row.status NOT IN ('PENDING_APPROVAL', 'RETURNED') THEN
    RAISE EXCEPTION 'Requirement set is not awaiting a decision';
  END IF;
  IF NOT _approve AND length(btrim(COALESCE(_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'A reason is required to return competency requirements';
  END IF;
  IF _approve AND set_row.created_by = _actor THEN
    RAISE EXCEPTION 'A different authorized reviewer must approve this requirement set';
  END IF;
  IF _approve AND EXISTS (
    SELECT 1 FROM public.competency_requirement_items i
    JOIN public.competency_definitions d ON d.id = i.competency_definition_id
    WHERE i.requirement_set_id = _requirement_set_id AND NOT d.active
  ) THEN
    RAISE EXCEPTION 'Every required competency definition must be active';
  END IF;
  IF _approve AND NOT EXISTS (
    SELECT 1 FROM public.competency_requirement_items i
    JOIN public.competency_definitions d ON d.id = i.competency_definition_id
    WHERE i.requirement_set_id = _requirement_set_id AND d.active
  ) THEN
    RAISE EXCEPTION 'Requirement set has no active competency definitions';
  END IF;
  next_status := CASE WHEN _approve THEN 'APPROVED' ELSE 'RETURNED' END;
  UPDATE public.competency_requirement_sets
  SET status = next_status,
      approved_by = CASE WHEN _approve THEN _actor ELSE NULL END,
      approved_at = CASE WHEN _approve THEN now() ELSE NULL END,
      decision_reason = NULLIF(btrim(_reason), '')
  WHERE id = _requirement_set_id;
  INSERT INTO public.competency_workflow_events (
    requirement_set_id, actor_user_id, action, previous_status, new_status, reason
  ) VALUES (
    _requirement_set_id, _actor,
    CASE WHEN _approve THEN 'REQUIREMENTS_APPROVED' ELSE 'REQUIREMENTS_RETURNED' END,
    set_row.status, next_status, NULLIF(btrim(_reason), '')
  );
  RETURN next_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_competency_assessment(
  _actor uuid,
  _employee_id uuid,
  _competency_definition_id uuid,
  _assessed_level smallint,
  _assessment_method text,
  _evidence_notes text,
  _assessed_on date,
  _next_assessment_on date,
  _source_evaluation_id uuid,
  _source_attachment_id uuid,
  _evidence_reference text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  employee_row public.employees%ROWTYPE;
  requirement_item public.competency_requirement_items%ROWTYPE;
  assessment_id uuid;
  next_version integer;
  job_position_name text;
  department_label text;
  department_head_id uuid;
  actor_role text;
BEGIN
  IF NOT (
    public.has_permission(_actor, 'competencies.assess')
    OR public.has_permission(_actor, 'competencies.reassess')
  )     OR NOT public.has_competency_employee_scope(_employee_id, _actor) THEN
    RAISE EXCEPTION 'Not authorized to assess this employee';
  END IF;
  SELECT * INTO employee_row FROM public.employees WHERE id = _employee_id;
  IF NOT FOUND OR employee_row.job_position_id IS NULL THEN
    RAISE EXCEPTION 'Employee does not have a linked job position';
  END IF;
  SELECT p.name INTO job_position_name
  FROM public.job_positions p WHERE p.id = employee_row.job_position_id;
  IF employee_row.department_id IS NOT NULL THEN
    SELECT d.label INTO department_label
    FROM public.performance_departments d WHERE d.id = employee_row.department_id;
    SELECT dha.user_id INTO department_head_id
    FROM public.department_head_assignments dha
    WHERE dha.department_id = employee_row.department_id AND dha.is_active;
  END IF;
  SELECT ur.role::text INTO actor_role
  FROM public.user_roles ur WHERE ur.user_id = _actor;
  SELECT i.* INTO requirement_item
  FROM public.competency_requirement_items i
  JOIN public.competency_requirement_sets s ON s.id = i.requirement_set_id
  WHERE i.competency_definition_id = _competency_definition_id
    AND s.job_position_id = employee_row.job_position_id
    AND s.status = 'APPROVED'
    AND s.effective_from <= _assessed_on
  ORDER BY s.version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No approved requirement exists for this position and competency'; END IF;
  IF _assessment_method IS DISTINCT FROM requirement_item.assessment_method THEN
    RAISE EXCEPTION 'Assessment method must match the approved job requirement';
  END IF;
  IF _assessed_level NOT BETWEEN 1 AND 5 OR length(btrim(_evidence_notes)) = 0 THEN
    RAISE EXCEPTION 'A valid level and supporting evidence are required';
  END IF;
  IF _source_evaluation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.employee_evaluations e
    WHERE e.id = _source_evaluation_id AND e.employee_id = _employee_id AND e.status = 'FINALIZED'
  ) THEN
    RAISE EXCEPTION 'Only a finalized performance evaluation for this employee can be linked';
  END IF;
  IF _source_attachment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.evaluation_attachments a
    JOIN public.employee_evaluations e ON e.id = a.employee_evaluation_id
    WHERE a.id = _source_attachment_id AND e.id = _source_evaluation_id
      AND e.employee_id = _employee_id AND e.status = 'FINALIZED'
  ) THEN
    RAISE EXCEPTION 'Evidence attachment must belong to the selected finalized employee evaluation';
  END IF;
  SELECT COALESCE(max(version), 0) + 1 INTO next_version
  FROM public.competency_assessments
  WHERE employee_id = _employee_id AND competency_definition_id = _competency_definition_id;
  IF next_version > 1 AND NOT public.has_permission(_actor, 'competencies.reassess') THEN
    RAISE EXCEPTION 'A reassessment permission is required for subsequent assessment versions';
  END IF;
  INSERT INTO public.competency_assessments (
    employee_id, employee_number_snapshot, employee_name_snapshot,
    job_position_id, job_position_name_snapshot, department_id, department_label_snapshot,
    assigned_supervisor_user_id, department_head_user_id, competency_definition_id,
    requirement_item_id, assessor_user_id, assessor_role,
    version, assessed_level, assessment_method, evidence_notes, assessed_on, next_assessment_on
  ) VALUES (
    _employee_id, employee_row.employee_number, employee_row.full_name,
    employee_row.job_position_id, COALESCE(job_position_name, employee_row.job_title),
    employee_row.department_id, COALESCE(department_label, ''),
    employee_row.assigned_supervisor_user_id, department_head_id, _competency_definition_id,
    requirement_item.id, _actor, COALESCE(actor_role, 'UNKNOWN'),
    next_version, _assessed_level, btrim(_assessment_method), btrim(_evidence_notes),
    _assessed_on, _next_assessment_on
  ) RETURNING id INTO assessment_id;
  IF _source_evaluation_id IS NOT NULL OR _source_attachment_id IS NOT NULL
    OR NULLIF(btrim(_evidence_reference), '') IS NOT NULL THEN
    INSERT INTO public.competency_assessment_evidence (
      assessment_id, source_evaluation_id, source_attachment_id, evidence_reference, added_by
    ) VALUES (
      assessment_id, _source_evaluation_id, _source_attachment_id,
      NULLIF(btrim(_evidence_reference), ''), _actor
    );
  END IF;
  INSERT INTO public.competency_workflow_events (
    assessment_id, actor_user_id, action, new_status, details
  ) VALUES (
    assessment_id, _actor, 'ASSESSMENT_SUBMITTED', 'SUBMITTED',
    jsonb_build_object('level', _assessed_level, 'method', _assessment_method,
      'reassessment', next_version > 1)
  );
  RETURN assessment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_competency_assessment_evidence(
  _actor uuid,
  _assessment_id uuid,
  _valid boolean,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  assessment_row public.competency_assessments%ROWTYPE;
BEGIN
  IF NOT public.has_permission(_actor, 'competencies.evidence.validate') THEN
    RAISE EXCEPTION 'Not authorized to validate competency evidence';
  END IF;
  SELECT * INTO assessment_row FROM public.competency_assessments
  WHERE id = _assessment_id FOR UPDATE;
  IF NOT FOUND OR assessment_row.status <> 'SUBMITTED'
    OR NOT public.has_competency_employee_scope(assessment_row.employee_id, _actor) THEN
    RAISE EXCEPTION 'Assessment is unavailable for evidence validation';
  END IF;
  IF NOT _valid AND length(btrim(COALESCE(_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'A reason is required to reject the evidence';
  END IF;
  IF _valid AND length(btrim(assessment_row.evidence_notes)) = 0 THEN
    RAISE EXCEPTION 'Evidence notes are required before validation';
  END IF;
  UPDATE public.competency_assessments
  SET evidence_validated_by = CASE WHEN _valid THEN _actor ELSE NULL END,
      evidence_validated_at = CASE WHEN _valid THEN now() ELSE NULL END,
      decision_reason = NULLIF(btrim(_reason), '')
  WHERE id = _assessment_id;
  INSERT INTO public.competency_workflow_events (
    assessment_id, actor_user_id, action, previous_status, new_status, reason
  ) VALUES (
    _assessment_id, _actor,
    CASE WHEN _valid THEN 'EVIDENCE_VALIDATED' ELSE 'EVIDENCE_RETURNED' END,
    'SUBMITTED', 'SUBMITTED', NULLIF(btrim(_reason), '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_competency_assessment(
  _actor uuid,
  _assessment_id uuid,
  _approve boolean,
  _reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  assessment_row public.competency_assessments%ROWTYPE;
  next_status text;
BEGIN
  IF NOT public.has_permission(_actor, 'competencies.assessments.approve') THEN
    RAISE EXCEPTION 'Not authorized to approve competency assessments';
  END IF;
  SELECT * INTO assessment_row FROM public.competency_assessments
  WHERE id = _assessment_id FOR UPDATE;
  IF NOT FOUND OR assessment_row.status <> 'SUBMITTED'
    OR NOT public.has_competency_employee_scope(assessment_row.employee_id, _actor) THEN
    RAISE EXCEPTION 'Assessment is not awaiting review in your authorized scope';
  END IF;
  IF NOT _approve AND length(btrim(COALESCE(_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'A reason is required to return an assessment';
  END IF;
  IF _approve AND assessment_row.assessor_user_id = _actor THEN
    RAISE EXCEPTION 'A different authorized reviewer must approve this assessment';
  END IF;
  IF _approve AND assessment_row.evidence_validated_at IS NULL THEN
    RAISE EXCEPTION 'Assessment evidence must be validated before approval';
  END IF;
  next_status := CASE WHEN _approve THEN 'APPROVED' ELSE 'RETURNED' END;
  UPDATE public.competency_assessments
  SET status = next_status,
      approval_user_id = CASE WHEN _approve THEN _actor ELSE NULL END,
      approved_at = CASE WHEN _approve THEN now() ELSE NULL END,
      decision_reason = NULLIF(btrim(_reason), '')
  WHERE id = _assessment_id;
  INSERT INTO public.competency_workflow_events (
    assessment_id, actor_user_id, action, previous_status, new_status, reason
  ) VALUES (
    _assessment_id, _actor,
    CASE WHEN _approve THEN 'ASSESSMENT_APPROVED' ELSE 'ASSESSMENT_RETURNED' END,
    assessment_row.status, next_status, NULLIF(btrim(_reason), '')
  );
  RETURN next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.save_competency_definition(uuid,text,text,text,text,text[],text[],text[],boolean,jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_competency_requirement_set(uuid,uuid,date,jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_competency_requirement_set(uuid,uuid,boolean,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_competency_assessment(uuid,uuid,uuid,smallint,text,text,date,date,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_competency_assessment_evidence(uuid,uuid,boolean,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_competency_assessment(uuid,uuid,boolean,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_competency_definition(uuid,text,text,text,text,text[],text[],text[],boolean,jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.create_competency_requirement_set(uuid,uuid,date,jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_competency_requirement_set(uuid,uuid,boolean,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_competency_assessment(uuid,uuid,uuid,smallint,text,text,date,date,uuid,uuid,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_competency_assessment_evidence(uuid,uuid,boolean,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_competency_assessment(uuid,uuid,boolean,text)
  TO service_role;
