ALTER TABLE public.competency_assessments
  DROP CONSTRAINT competency_assessments_status_check;

ALTER TABLE public.competency_assessments
  ADD CONSTRAINT competency_assessments_status_check
  CHECK (status IN ('SUBMITTED', 'NEEDS_EVIDENCE', 'APPROVED', 'RETURNED'));

ALTER TABLE public.competency_assessments
  ADD COLUMN supersedes_assessment_id uuid
    REFERENCES public.competency_assessments(id) ON DELETE RESTRICT;

CREATE TABLE public.competency_assessment_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  competency_definition_id uuid NOT NULL REFERENCES public.competency_definitions(id) ON DELETE RESTRICT,
  requirement_item_id uuid NOT NULL REFERENCES public.competency_requirement_items(id) ON DELETE RESTRICT,
  supersedes_assessment_id uuid
    REFERENCES public.competency_assessments(id) ON DELETE RESTRICT,
  assessor_user_id uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  assessed_level smallint NOT NULL CHECK (assessed_level BETWEEN 1 AND 5),
  assessment_method text NOT NULL CHECK (length(btrim(assessment_method)) > 0),
  evidence_notes text NOT NULL CHECK (length(btrim(evidence_notes)) >= 10),
  assessed_on date NOT NULL,
  next_assessment_on date,
  source_evaluation_id uuid REFERENCES public.employee_evaluations(id) ON DELETE RESTRICT,
  source_attachment_id uuid REFERENCES public.evaluation_attachments(id) ON DELETE RESTRICT,
  evidence_reference text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (next_assessment_on IS NULL OR next_assessment_on >= assessed_on),
  CHECK (source_evaluation_id IS NOT NULL OR source_attachment_id IS NULL)
);

ALTER TABLE public.competency_workflow_events
  ADD COLUMN assessment_draft_id uuid
    REFERENCES public.competency_assessment_drafts(id) ON DELETE RESTRICT;
ALTER TABLE public.competency_workflow_events
  DROP CONSTRAINT competency_workflow_events_check;
ALTER TABLE public.competency_workflow_events
  ADD CONSTRAINT competency_workflow_events_check
  CHECK (num_nonnulls(
    competency_definition_id, assessment_id, requirement_set_id, assessment_draft_id
  ) = 1);

CREATE INDEX idx_competency_drafts_assessor
  ON public.competency_assessment_drafts(assessor_user_id, updated_at DESC);
CREATE INDEX idx_competency_drafts_employee
  ON public.competency_assessment_drafts(employee_id, competency_definition_id);
CREATE INDEX idx_competency_events_draft
  ON public.competency_workflow_events(assessment_draft_id, occurred_at DESC);
CREATE INDEX idx_competency_assessments_supersedes
  ON public.competency_assessments(supersedes_assessment_id)
  WHERE supersedes_assessment_id IS NOT NULL;

ALTER TABLE public.competency_assessment_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.competency_assessment_drafts FROM anon, authenticated;
GRANT SELECT ON public.competency_assessment_drafts TO authenticated;
GRANT ALL ON public.competency_assessment_drafts TO service_role;

CREATE POLICY "scoped competency assessment drafts readable"
  ON public.competency_assessment_drafts FOR SELECT TO authenticated
  USING (public.can_access_competency_employee(employee_id));

CREATE OR REPLACE FUNCTION public.save_competency_assessment_draft(
  _actor uuid,
  _draft_id uuid,
  _employee_id uuid,
  _competency_definition_id uuid,
  _supersedes_assessment_id uuid,
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
  draft_row public.competency_assessment_drafts%ROWTYPE;
  draft_result uuid;
  actor_role text;
BEGIN
  IF NOT public.has_permission(_actor, 'competencies.assess')
    OR NOT public.has_competency_employee_scope(_employee_id, _actor) THEN
    RAISE EXCEPTION 'Not authorized to create a competency assessment for this employee';
  END IF;
  SELECT * INTO employee_row
  FROM public.employees
  WHERE id = _employee_id AND employment_status = 'ACTIVE';
  IF NOT FOUND OR employee_row.job_position_id IS NULL THEN
    RAISE EXCEPTION 'Active employee does not have a linked job position';
  END IF;
  SELECT i.* INTO requirement_item
  FROM public.competency_requirement_items i
  JOIN public.competency_requirement_sets s ON s.id = i.requirement_set_id
  WHERE i.competency_definition_id = _competency_definition_id
    AND s.job_position_id = employee_row.job_position_id
    AND s.status = 'APPROVED'
    AND s.effective_from <= _assessed_on
  ORDER BY s.version DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No approved competency requirements exist for this employee position; ask HR to approve the job requirements';
  END IF;
  IF _assessment_method IS DISTINCT FROM requirement_item.assessment_method THEN
    RAISE EXCEPTION 'Assessment method must match the approved job requirement';
  END IF;
  IF _assessed_level NOT BETWEEN 1 AND 5
    OR length(btrim(COALESCE(_evidence_notes, ''))) < 10 THEN
    RAISE EXCEPTION 'A valid level and at least 10 characters of supporting evidence notes are required';
  END IF;
  IF _next_assessment_on IS NOT NULL AND _next_assessment_on < _assessed_on THEN
    RAISE EXCEPTION 'Next assessment date cannot be before the assessment date';
  END IF;
  IF _source_evaluation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.employee_evaluations e
    WHERE e.id = _source_evaluation_id
      AND e.employee_id = _employee_id
      AND e.status = 'FINALIZED'
  ) THEN
    RAISE EXCEPTION 'Only a finalized performance evaluation for this employee can be linked';
  END IF;
  IF _source_attachment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.evaluation_attachments a
    JOIN public.employee_evaluations e ON e.id = a.employee_evaluation_id
    WHERE a.id = _source_attachment_id
      AND e.id = _source_evaluation_id
      AND e.employee_id = _employee_id
      AND e.status = 'FINALIZED'
  ) THEN
    RAISE EXCEPTION 'Supporting attachment must belong to the selected finalized evaluation';
  END IF;
  IF _supersedes_assessment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.competency_assessments a
    WHERE a.id = _supersedes_assessment_id
      AND a.employee_id = _employee_id
      AND a.competency_definition_id = _competency_definition_id
      AND a.status IN ('APPROVED', 'NEEDS_EVIDENCE', 'RETURNED')
  ) THEN
    RAISE EXCEPTION 'The prior assessment cannot be reassessed or corrected';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.competency_assessments a
    WHERE a.employee_id = _employee_id
      AND a.competency_definition_id = _competency_definition_id
  ) AND NOT public.has_permission(_actor, 'competencies.reassess') THEN
    RAISE EXCEPTION 'Reassessment permission is required for subsequent assessment versions';
  END IF;
  SELECT ur.role::text INTO actor_role FROM public.user_roles ur
  WHERE ur.user_id = _actor;
  IF _draft_id IS NULL THEN
    INSERT INTO public.competency_assessment_drafts (
      employee_id, competency_definition_id, requirement_item_id, supersedes_assessment_id,
      assessor_user_id, assessed_level, assessment_method, evidence_notes, assessed_on,
      next_assessment_on, source_evaluation_id, source_attachment_id, evidence_reference
    ) VALUES (
      _employee_id, _competency_definition_id, requirement_item.id, _supersedes_assessment_id,
      _actor, _assessed_level, btrim(_assessment_method), btrim(_evidence_notes), _assessed_on,
      _next_assessment_on, _source_evaluation_id, _source_attachment_id,
      NULLIF(btrim(_evidence_reference), '')
    ) RETURNING id INTO draft_result;
  ELSE
    SELECT * INTO draft_row FROM public.competency_assessment_drafts
    WHERE id = _draft_id FOR UPDATE;
    IF NOT FOUND OR draft_row.assessor_user_id <> _actor
      OR draft_row.employee_id <> _employee_id
      OR draft_row.competency_definition_id <> _competency_definition_id
      OR draft_row.status <> 'DRAFT'
      OR draft_row.supersedes_assessment_id IS DISTINCT FROM _supersedes_assessment_id THEN
      RAISE EXCEPTION 'Draft is unavailable for editing';
    END IF;
    UPDATE public.competency_assessment_drafts
    SET requirement_item_id = requirement_item.id,
        assessed_level = _assessed_level,
        assessment_method = btrim(_assessment_method),
        evidence_notes = btrim(_evidence_notes),
        assessed_on = _assessed_on,
        next_assessment_on = _next_assessment_on,
        source_evaluation_id = _source_evaluation_id,
        source_attachment_id = _source_attachment_id,
        evidence_reference = NULLIF(btrim(_evidence_reference), ''),
        updated_at = now()
    WHERE id = _draft_id
    RETURNING id INTO draft_result;
  END IF;
  INSERT INTO public.competency_workflow_events (
    assessment_draft_id, actor_user_id, action, previous_status, new_status, details
  ) VALUES (
    draft_result, _actor, 'ASSESSMENT_DRAFT_SAVED',
    CASE WHEN _draft_id IS NULL THEN NULL ELSE 'DRAFT' END, 'DRAFT',
    jsonb_build_object('role', actor_role, 'supersedes_assessment_id', _supersedes_assessment_id)
  );
  RETURN draft_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_competency_assessment_draft(
  _actor uuid,
  _draft_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  draft_row public.competency_assessment_drafts%ROWTYPE;
  employee_row public.employees%ROWTYPE;
  assessment_id uuid;
  next_version integer;
  job_position_name text;
  department_label text;
  department_head_id uuid;
  actor_role text;
BEGIN
  SELECT * INTO draft_row FROM public.competency_assessment_drafts
  WHERE id = _draft_id FOR UPDATE;
  IF NOT FOUND OR draft_row.assessor_user_id <> _actor OR draft_row.status <> 'DRAFT'
    OR NOT public.has_permission(_actor, 'competencies.assess')
    OR NOT public.has_competency_employee_scope(draft_row.employee_id, _actor) THEN
    RAISE EXCEPTION 'Draft is unavailable for submission';
  END IF;
  IF length(btrim(draft_row.evidence_notes)) < 10 THEN
    RAISE EXCEPTION 'Evidence notes are required before submission';
  END IF;
  SELECT * INTO employee_row FROM public.employees
  WHERE id = draft_row.employee_id AND employment_status = 'ACTIVE';
  IF NOT FOUND OR employee_row.job_position_id IS NULL THEN
    RAISE EXCEPTION 'Employee no longer has an active linked position';
  END IF;
  SELECT p.name INTO job_position_name FROM public.job_positions p
  WHERE p.id = employee_row.job_position_id;
  IF employee_row.department_id IS NOT NULL THEN
    SELECT d.label INTO department_label FROM public.performance_departments d
    WHERE d.id = employee_row.department_id;
    SELECT dha.user_id INTO department_head_id FROM public.department_head_assignments dha
    WHERE dha.department_id = employee_row.department_id AND dha.is_active
    ORDER BY dha.assigned_at DESC LIMIT 1;
  END IF;
  SELECT ur.role::text INTO actor_role FROM public.user_roles ur
  WHERE ur.user_id = _actor;
  SELECT COALESCE(max(version), 0) + 1 INTO next_version
  FROM public.competency_assessments
  WHERE employee_id = draft_row.employee_id
    AND competency_definition_id = draft_row.competency_definition_id;
  IF next_version > 1 AND NOT public.has_permission(_actor, 'competencies.reassess') THEN
    RAISE EXCEPTION 'Reassessment permission is required for subsequent assessment versions';
  END IF;
  INSERT INTO public.competency_assessments (
    employee_id, employee_number_snapshot, employee_name_snapshot,
    job_position_id, job_position_name_snapshot, department_id, department_label_snapshot,
    assigned_supervisor_user_id, department_head_user_id, competency_definition_id,
    requirement_item_id, assessor_user_id, assessor_role, version, assessed_level,
    assessment_method, evidence_notes, assessed_on, next_assessment_on, status,
    supersedes_assessment_id
  ) VALUES (
    employee_row.id, employee_row.employee_number, employee_row.full_name,
    employee_row.job_position_id, COALESCE(job_position_name, employee_row.job_title),
    employee_row.department_id, COALESCE(department_label, ''),
    employee_row.assigned_supervisor_user_id, department_head_id, draft_row.competency_definition_id,
    draft_row.requirement_item_id, _actor, COALESCE(actor_role, 'UNKNOWN'), next_version,
    draft_row.assessed_level, draft_row.assessment_method, draft_row.evidence_notes,
    draft_row.assessed_on, draft_row.next_assessment_on, 'SUBMITTED',
    draft_row.supersedes_assessment_id
  ) RETURNING id INTO assessment_id;
  IF draft_row.source_evaluation_id IS NOT NULL OR draft_row.source_attachment_id IS NOT NULL
    OR draft_row.evidence_reference IS NOT NULL THEN
    INSERT INTO public.competency_assessment_evidence (
      assessment_id, source_evaluation_id, source_attachment_id, evidence_reference, added_by
    ) VALUES (
      assessment_id, draft_row.source_evaluation_id, draft_row.source_attachment_id,
      draft_row.evidence_reference, _actor
    );
  END IF;
  UPDATE public.competency_assessment_drafts
  SET status = 'SUBMITTED', updated_at = now()
  WHERE id = _draft_id;
  INSERT INTO public.competency_workflow_events (
    assessment_id, actor_user_id, action, new_status, details
  ) VALUES (
    assessment_id, _actor, 'ASSESSMENT_SUBMITTED', 'SUBMITTED',
    jsonb_build_object('level', draft_row.assessed_level,
      'method', draft_row.assessment_method, 'version', next_version,
      'supersedes_assessment_id', draft_row.supersedes_assessment_id,
      'draft_id', _draft_id)
  );
  INSERT INTO public.competency_workflow_events (
    assessment_draft_id, actor_user_id, action, previous_status, new_status, details
  ) VALUES (
    _draft_id, _actor, 'ASSESSMENT_DRAFT_SUBMITTED', 'DRAFT', 'SUBMITTED',
    jsonb_build_object('assessment_id', assessment_id)
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
  next_status text;
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
    RAISE EXCEPTION 'A reason is required to request additional evidence';
  END IF;
  next_status := CASE WHEN _valid THEN 'SUBMITTED' ELSE 'NEEDS_EVIDENCE' END;
  UPDATE public.competency_assessments
  SET evidence_validated_by = CASE WHEN _valid THEN _actor ELSE NULL END,
      evidence_validated_at = CASE WHEN _valid THEN now() ELSE NULL END,
      decision_reason = NULLIF(btrim(_reason), ''),
      status = next_status
  WHERE id = _assessment_id;
  INSERT INTO public.competency_workflow_events (
    assessment_id, actor_user_id, action, previous_status, new_status, reason
  ) VALUES (
    _assessment_id, _actor,
    CASE WHEN _valid THEN 'EVIDENCE_VALIDATED' ELSE 'ADDITIONAL_EVIDENCE_REQUESTED' END,
    assessment_row.status, next_status, NULLIF(btrim(_reason), '')
  );
END;
$$;

CREATE POLICY "scoped competency draft workflow history readable"
  ON public.competency_workflow_events FOR SELECT TO authenticated
  USING (
    assessment_draft_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.competency_assessment_drafts d
      WHERE d.id = assessment_draft_id
        AND public.can_access_competency_employee(d.employee_id)
    )
  );

REVOKE ALL ON FUNCTION public.save_competency_assessment_draft(uuid,uuid,uuid,uuid,uuid,smallint,text,text,date,date,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_competency_assessment_draft(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_competency_assessment_draft(uuid,uuid,uuid,uuid,uuid,smallint,text,text,date,date,uuid,uuid,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_competency_assessment_draft(uuid,uuid)
  TO service_role;
