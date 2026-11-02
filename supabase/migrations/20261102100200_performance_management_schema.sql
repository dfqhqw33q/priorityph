CREATE TABLE public.job_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(btrim(name)) > 0),
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_job_positions_updated
  BEFORE UPDATE ON public.job_positions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.employees
  ADD COLUMN job_position_id uuid REFERENCES public.job_positions(id) ON DELETE SET NULL;

CREATE INDEX idx_employees_job_position
  ON public.employees(job_position_id);

CREATE TABLE public.evaluation_rating_scale (
  rating smallint PRIMARY KEY CHECK (rating BETWEEN 1 AND 5),
  label text NOT NULL,
  description text NOT NULL
);

INSERT INTO public.evaluation_rating_scale(rating, label, description)
VALUES
  (1, 'Poor', 'Poor / Unacceptable'),
  (2, 'Below Average', 'Below Average / Improvement required'),
  (3, 'Average', 'Average / Meets expectations'),
  (4, 'Above Average', 'Above Average / Often exceeds expectations'),
  (5, 'Excellent', 'Excellent / Consistently exceeds expectations')
ON CONFLICT (rating) DO NOTHING;

CREATE TABLE public.evaluation_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(btrim(name)) > 0),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  submission_deadline date,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'CLOSED')),
  created_by uuid REFERENCES public.internal_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  CHECK (submission_deadline IS NULL OR submission_deadline >= starts_on)
);

CREATE TRIGGER trg_evaluation_periods_updated
  BEFORE UPDATE ON public.evaluation_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.evaluation_templates
  DROP CONSTRAINT IF EXISTS evaluation_templates_name_key,
  ADD COLUMN job_position_id uuid REFERENCES public.job_positions(id) ON DELETE RESTRICT,
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN effective_from date,
  ADD COLUMN effective_to date,
  ADD COLUMN status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
  ADD COLUMN created_by uuid REFERENCES public.internal_users(id) ON DELETE SET NULL,
  ADD CONSTRAINT evaluation_templates_position_version_unique
    UNIQUE (job_position_id, version),
  ADD CONSTRAINT evaluation_templates_effective_dates_check
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  ADD CONSTRAINT evaluation_templates_active_fields_check
    CHECK (status <> 'ACTIVE' OR (job_position_id IS NOT NULL AND effective_from IS NOT NULL));

CREATE INDEX idx_evaluation_templates_position_effective
  ON public.evaluation_templates(job_position_id, status, effective_from, effective_to);

CREATE TABLE public.evaluation_template_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.evaluation_templates(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  weight numeric(5, 2) NOT NULL CHECK (weight > 0 AND weight <= 100),
  position integer NOT NULL CHECK (position > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, position),
  UNIQUE (template_id, name)
);

CREATE TABLE public.evaluation_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.evaluation_template_categories(id) ON DELETE RESTRICT,
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  position integer NOT NULL CHECK (position > 0),
  UNIQUE (category_id, position)
);

CREATE TABLE public.evaluation_evidence_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.evaluation_template_categories(id) ON DELETE RESTRICT,
  description text NOT NULL CHECK (length(btrim(description)) > 0),
  is_required boolean NOT NULL DEFAULT false,
  position integer NOT NULL CHECK (position > 0),
  UNIQUE (category_id, position)
);

CREATE OR REPLACE FUNCTION public.guard_evaluation_template_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  previous_template_id uuid;
  next_template_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'evaluation_template_categories' THEN
    IF TG_OP <> 'INSERT' THEN
      previous_template_id := OLD.template_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      next_template_id := NEW.template_id;
    END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN
      SELECT c.template_id INTO previous_template_id
      FROM public.evaluation_template_categories c
      WHERE c.id = OLD.category_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT c.template_id INTO next_template_id
      FROM public.evaluation_template_categories c
      WHERE c.id = NEW.category_id;
    END IF;
  END IF;

  IF previous_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.evaluation_templates t
    WHERE t.id = previous_template_id AND t.status = 'DRAFT'
  ) THEN
    RAISE EXCEPTION 'Only draft evaluation templates can be changed';
  END IF;
  IF next_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.evaluation_templates t
    WHERE t.id = next_template_id AND t.status = 'DRAFT'
  ) THEN
    RAISE EXCEPTION 'Only draft evaluation templates can be changed';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_evaluation_categories_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.evaluation_template_categories
  FOR EACH ROW EXECUTE FUNCTION public.guard_evaluation_template_changes();

CREATE TRIGGER trg_evaluation_indicators_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.evaluation_indicators
  FOR EACH ROW EXECUTE FUNCTION public.guard_evaluation_template_changes();

CREATE TRIGGER trg_evaluation_evidence_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.evaluation_evidence_requirements
  FOR EACH ROW EXECUTE FUNCTION public.guard_evaluation_template_changes();

CREATE OR REPLACE FUNCTION public.validate_evaluation_template_activation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  category_weight_total numeric;
  category_count integer;
  overlapping_templates integer;
BEGIN
  IF NEW.status = 'ACTIVE' AND OLD.status IS DISTINCT FROM 'ACTIVE' THEN
    SELECT COALESCE(SUM(c.weight), 0), COUNT(*)
    INTO category_weight_total, category_count
    FROM public.evaluation_template_categories c
    WHERE c.template_id = NEW.id;

    IF category_count <> 8 OR category_weight_total <> 100 THEN
      RAISE EXCEPTION 'An active evaluation template must have exactly eight categories totaling 100%%';
    END IF;

    SELECT COUNT(*) INTO overlapping_templates
    FROM public.evaluation_templates t
    WHERE t.id <> NEW.id
      AND t.job_position_id = NEW.job_position_id
      AND t.status = 'ACTIVE'
      AND t.effective_from <= COALESCE(NEW.effective_to, 'infinity'::date)
      AND NEW.effective_from <= COALESCE(t.effective_to, 'infinity'::date);
    IF overlapping_templates > 0 THEN
      RAISE EXCEPTION 'Active evaluation templates for the same position cannot have overlapping effective dates';
    END IF;
  END IF;

  IF OLD.status = 'RETIRED' AND NEW.status <> 'RETIRED' THEN
    RAISE EXCEPTION 'Retired evaluation templates cannot be reactivated';
  END IF;

  IF OLD.status = 'ACTIVE' AND NEW.status NOT IN ('ACTIVE', 'RETIRED') THEN
    RAISE EXCEPTION 'Active evaluation templates can only be retired';
  END IF;

  IF OLD.status = 'ACTIVE' AND NEW.status = 'RETIRED'
    AND (
      NEW.job_position_id IS DISTINCT FROM OLD.job_position_id
      OR NEW.name IS DISTINCT FROM OLD.name
      OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
      OR (OLD.effective_to IS NOT NULL AND NEW.effective_to IS DISTINCT FROM OLD.effective_to)
    ) THEN
    RAISE EXCEPTION 'Only the end date may be set when retiring an active evaluation template';
  END IF;

  IF OLD.status = 'RETIRED' AND (
    NEW.job_position_id IS DISTINCT FROM OLD.job_position_id
    OR NEW.name IS DISTINCT FROM OLD.name
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
    OR NEW.effective_to IS DISTINCT FROM OLD.effective_to
  ) THEN
    RAISE EXCEPTION 'Only draft evaluation template details can be changed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_evaluation_template_activation
  BEFORE UPDATE ON public.evaluation_templates
  FOR EACH ROW EXECUTE FUNCTION public.validate_evaluation_template_activation();

CREATE OR REPLACE FUNCTION public.prevent_active_evaluation_template_deletion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Only draft evaluation templates can be deleted';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_prevent_active_evaluation_template_deletion
  BEFORE DELETE ON public.evaluation_templates
  FOR EACH ROW EXECUTE FUNCTION public.prevent_active_evaluation_template_deletion();

DO $$
DECLARE
  driver_position_id uuid;
  driver_template_id uuid;
BEGIN
  INSERT INTO public.job_positions(name, description)
  VALUES ('Driver', 'Freight and logistics driver position')
  ON CONFLICT (name) DO NOTHING;

  SELECT id INTO driver_position_id
  FROM public.job_positions
  WHERE name = 'Driver';

  UPDATE public.employees
  SET job_position_id = driver_position_id
  WHERE job_position_id IS NULL
    AND lower(btrim(job_title)) = 'driver';

  INSERT INTO public.evaluation_templates(
    id, job_position_id, name, version, effective_from, status
  )
  VALUES (
    'd0000000-0000-4000-8000-000000000001',
    driver_position_id,
    'Driver Performance Evaluation',
    1,
    '2026-01-01',
    'DRAFT'
  )
  ON CONFLICT (job_position_id, version) DO NOTHING;

  SELECT id INTO driver_template_id
  FROM public.evaluation_templates
  WHERE job_position_id = driver_position_id AND version = 1;

  INSERT INTO public.evaluation_template_categories(id, template_id, name, weight, position)
  VALUES
    ('d0000000-0000-4000-8000-000000000101', driver_template_id, 'Safety & Compliance', 30, 1),
    ('d0000000-0000-4000-8000-000000000102', driver_template_id, 'Delivery / Operational Performance', 25, 2),
    ('d0000000-0000-4000-8000-000000000103', driver_template_id, 'Vehicle & Equipment Care', 10, 3),
    ('d0000000-0000-4000-8000-000000000104', driver_template_id, 'Documentation & Accuracy', 10, 4),
    ('d0000000-0000-4000-8000-000000000105', driver_template_id, 'Dependability', 10, 5),
    ('d0000000-0000-4000-8000-000000000106', driver_template_id, 'Customer Service & Communication', 5, 6),
    ('d0000000-0000-4000-8000-000000000107', driver_template_id, 'Teamwork & Professionalism', 5, 7),
    ('d0000000-0000-4000-8000-000000000108', driver_template_id, 'Initiative / Problem Solving', 5, 8)
  ON CONFLICT (template_id, position) DO NOTHING;

  INSERT INTO public.evaluation_indicators(category_id, label, position)
  VALUES
    ('d0000000-0000-4000-8000-000000000101', 'Follows traffic laws.', 1),
    ('d0000000-0000-4000-8000-000000000101', 'Observes safety procedures.', 2),
    ('d0000000-0000-4000-8000-000000000101', 'Follows company policies.', 3),
    ('d0000000-0000-4000-8000-000000000101', 'Maintains safe driving practices.', 4),
    ('d0000000-0000-4000-8000-000000000102', 'Completes deliveries on time.', 1),
    ('d0000000-0000-4000-8000-000000000102', 'Follows assigned routes.', 2),
    ('d0000000-0000-4000-8000-000000000102', 'Meets operational requirements.', 3),
    ('d0000000-0000-4000-8000-000000000102', 'Handles delivery responsibilities properly.', 4),
    ('d0000000-0000-4000-8000-000000000103', 'Maintains vehicle cleanliness.', 1),
    ('d0000000-0000-4000-8000-000000000103', 'Reports defects.', 2),
    ('d0000000-0000-4000-8000-000000000103', 'Performs required inspections.', 3),
    ('d0000000-0000-4000-8000-000000000103', 'Handles equipment responsibly.', 4),
    ('d0000000-0000-4000-8000-000000000104', 'Completes delivery documents correctly.', 1),
    ('d0000000-0000-4000-8000-000000000104', 'Submits accurate reports.', 2),
    ('d0000000-0000-4000-8000-000000000104', 'Maintains required records.', 3),
    ('d0000000-0000-4000-8000-000000000105', 'Maintains reliable attendance.', 1),
    ('d0000000-0000-4000-8000-000000000105', 'Arrives punctually.', 2),
    ('d0000000-0000-4000-8000-000000000105', 'Remains available as scheduled.', 3),
    ('d0000000-0000-4000-8000-000000000105', 'Consistently completes assigned duties.', 4),
    ('d0000000-0000-4000-8000-000000000106', 'Communicates professionally.', 1),
    ('d0000000-0000-4000-8000-000000000106', 'Handles customer concerns appropriately.', 2),
    ('d0000000-0000-4000-8000-000000000106', 'Provides timely updates.', 3),
    ('d0000000-0000-4000-8000-000000000107', 'Cooperates with colleagues.', 1),
    ('d0000000-0000-4000-8000-000000000107', 'Respects supervisors.', 2),
    ('d0000000-0000-4000-8000-000000000107', 'Follows workplace standards.', 3),
    ('d0000000-0000-4000-8000-000000000108', 'Responds appropriately to unexpected situations.', 1),
    ('d0000000-0000-4000-8000-000000000108', 'Identifies problems.', 2),
    ('d0000000-0000-4000-8000-000000000108', 'Takes responsible action.', 3)
  ON CONFLICT (category_id, position) DO NOTHING;

  INSERT INTO public.evaluation_evidence_requirements(category_id, description, position)
  VALUES
    ('d0000000-0000-4000-8000-000000000101', 'Safety records.', 1),
    ('d0000000-0000-4000-8000-000000000101', 'Inspection records.', 2),
    ('d0000000-0000-4000-8000-000000000101', 'Incident reports.', 3),
    ('d0000000-0000-4000-8000-000000000101', 'Supervisor observation.', 4),
    ('d0000000-0000-4000-8000-000000000102', 'Dispatch records.', 1),
    ('d0000000-0000-4000-8000-000000000102', 'Delivery records.', 2),
    ('d0000000-0000-4000-8000-000000000102', 'Route records.', 3),
    ('d0000000-0000-4000-8000-000000000103', 'Inspection history.', 1),
    ('d0000000-0000-4000-8000-000000000103', 'Maintenance reports.', 2),
    ('d0000000-0000-4000-8000-000000000103', 'Supervisor evidence.', 3),
    ('d0000000-0000-4000-8000-000000000104', 'Delivery documents.', 1),
    ('d0000000-0000-4000-8000-000000000104', 'Records.', 2),
    ('d0000000-0000-4000-8000-000000000104', 'Exception reports.', 3),
    ('d0000000-0000-4000-8000-000000000105', 'Attendance records.', 1),
    ('d0000000-0000-4000-8000-000000000105', 'Assignment records.', 2),
    ('d0000000-0000-4000-8000-000000000106', 'Supervisor evidence.', 1),
    ('d0000000-0000-4000-8000-000000000106', 'Service records where available.', 2),
    ('d0000000-0000-4000-8000-000000000107', 'Supervisor/peer evidence where policy allows.', 1),
    ('d0000000-0000-4000-8000-000000000108', 'Incident examples.', 1),
    ('d0000000-0000-4000-8000-000000000108', 'Supervisor evidence.', 2)
  ON CONFLICT (category_id, position) DO NOTHING;

  UPDATE public.evaluation_templates
  SET status = 'ACTIVE'
  WHERE id = driver_template_id AND status = 'DRAFT';
END;
$$;

CREATE TABLE public.employee_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  evaluation_period_id uuid NOT NULL REFERENCES public.evaluation_periods(id) ON DELETE RESTRICT,
  template_id uuid NOT NULL REFERENCES public.evaluation_templates(id) ON DELETE RESTRICT,
  template_version_snapshot integer NOT NULL DEFAULT 0,
  template_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN (
      'DRAFT',
      'IN_PROGRESS',
      'SUBMITTED',
      'PENDING_SUPERVISOR_REVIEW',
      'RETURNED_FOR_REVISION',
      'SUPERVISOR_IN_PROGRESS',
      'SUPERVISOR_SUBMITTED',
      'COMPLETED'
    )),
  weighted_score numeric(4, 2) CHECK (weighted_score IS NULL OR weighted_score BETWEEN 1 AND 5),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, evaluation_period_id)
);

CREATE INDEX idx_employee_evaluations_employee_period
  ON public.employee_evaluations(employee_id, evaluation_period_id);

CREATE INDEX idx_employee_evaluations_status
  ON public.employee_evaluations(status, updated_at);

CREATE TRIGGER trg_employee_evaluations_updated
  BEFORE UPDATE ON public.employee_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_employee_evaluation_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'DRAFT' AND NEW.status IN ('IN_PROGRESS', 'SUBMITTED'))
    OR (OLD.status = 'IN_PROGRESS' AND NEW.status IN ('DRAFT', 'SUBMITTED'))
    OR (OLD.status = 'SUBMITTED' AND NEW.status IN (
      'PENDING_SUPERVISOR_REVIEW',
      'SUPERVISOR_IN_PROGRESS',
      'RETURNED_FOR_REVISION'
    ))
    OR (OLD.status = 'PENDING_SUPERVISOR_REVIEW' AND NEW.status IN (
      'SUPERVISOR_IN_PROGRESS',
      'RETURNED_FOR_REVISION'
    ))
    OR (OLD.status = 'RETURNED_FOR_REVISION' AND NEW.status IN ('IN_PROGRESS', 'SUBMITTED'))
    OR (OLD.status = 'SUPERVISOR_IN_PROGRESS' AND NEW.status IN (
      'RETURNED_FOR_REVISION',
      'SUPERVISOR_SUBMITTED'
    ))
    OR (OLD.status = 'SUPERVISOR_SUBMITTED' AND NEW.status = 'COMPLETED')
  ) THEN
    RAISE EXCEPTION 'Invalid evaluation status transition: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_employee_evaluation_status_transition
  BEFORE UPDATE OF status ON public.employee_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.validate_employee_evaluation_status_transition();

CREATE OR REPLACE FUNCTION public.protect_employee_evaluation_template_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
    OR NEW.evaluation_period_id IS DISTINCT FROM OLD.evaluation_period_id
    OR NEW.template_id IS DISTINCT FROM OLD.template_id
    OR NEW.template_version_snapshot IS DISTINCT FROM OLD.template_version_snapshot
    OR NEW.template_snapshot IS DISTINCT FROM OLD.template_snapshot THEN
    RAISE EXCEPTION 'Evaluation identity and template snapshot are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_employee_evaluation_template_snapshot
  BEFORE UPDATE ON public.employee_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.protect_employee_evaluation_template_snapshot();

CREATE OR REPLACE FUNCTION public.snapshot_employee_evaluation_template()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  template_version integer;
  template_snapshot jsonb;
BEGIN
  SELECT
    t.version,
    jsonb_build_object(
      'template_id', t.id,
      'name', t.name,
      'version', t.version,
      'job_position_id', t.job_position_id,
      'rating_scale', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'rating', rs.rating,
            'label', rs.label,
            'description', rs.description
          )
          ORDER BY rs.rating
        )
        FROM public.evaluation_rating_scale rs
      ), '[]'::jsonb),
      'categories', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'weight', c.weight,
            'position', c.position,
            'indicators', COALESCE((
              SELECT jsonb_agg(jsonb_build_object('label', i.label, 'position', i.position) ORDER BY i.position)
              FROM public.evaluation_indicators i
              WHERE i.category_id = c.id
            ), '[]'::jsonb),
            'evidence_requirements', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'description', r.description,
                  'is_required', r.is_required,
                  'position', r.position
                )
                ORDER BY r.position
              )
              FROM public.evaluation_evidence_requirements r
              WHERE r.category_id = c.id
            ), '[]'::jsonb)
          )
          ORDER BY c.position
        )
        FROM public.evaluation_template_categories c
        WHERE c.template_id = t.id
      ), '[]'::jsonb)
    )
  INTO template_version, template_snapshot
  FROM public.evaluation_templates t
  JOIN public.employees e
    ON e.id = NEW.employee_id
   AND e.job_position_id = t.job_position_id
  JOIN public.evaluation_periods p
    ON p.id = NEW.evaluation_period_id
   AND p.status = 'ACTIVE'
   AND p.starts_on >= t.effective_from
   AND (t.effective_to IS NULL OR p.starts_on <= t.effective_to)
  WHERE t.id = NEW.template_id
    AND t.status = 'ACTIVE';

  IF template_version IS NULL THEN
    RAISE EXCEPTION 'The active evaluation template must match the employee position and evaluation period';
  END IF;

  NEW.template_version_snapshot := template_version;
  NEW.template_snapshot := template_snapshot;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_snapshot_employee_evaluation_template
  BEFORE INSERT ON public.employee_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_employee_evaluation_template();

CREATE TABLE public.employee_evaluation_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_evaluation_id uuid NOT NULL REFERENCES public.employee_evaluations(id) ON DELETE RESTRICT,
  category_id uuid NOT NULL REFERENCES public.evaluation_template_categories(id) ON DELETE RESTRICT,
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  comments text NOT NULL DEFAULT '',
  evidence text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_evaluation_id, category_id)
);

CREATE TRIGGER trg_employee_evaluation_ratings_updated
  BEFORE UPDATE ON public.employee_evaluation_ratings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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

  IF parent_status NOT IN ('DRAFT', 'IN_PROGRESS', 'RETURNED_FOR_REVISION') THEN
    RAISE EXCEPTION 'Employee ratings cannot be changed after submission unless returned for revision';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_employee_evaluation_rating_changes
  BEFORE INSERT OR UPDATE OR DELETE ON public.employee_evaluation_ratings
  FOR EACH ROW EXECUTE FUNCTION public.guard_employee_evaluation_rating_changes();

CREATE TABLE public.supervisor_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_evaluation_id uuid NOT NULL UNIQUE REFERENCES public.employee_evaluations(id) ON DELETE RESTRICT,
  supervisor_user_id uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED')),
  weighted_score numeric(4, 2) CHECK (weighted_score IS NULL OR weighted_score BETWEEN 1 AND 5),
  overall_comments text NOT NULL DEFAULT '',
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_supervisor_evaluations_reviewer_status
  ON public.supervisor_evaluations(supervisor_user_id, status, updated_at);

CREATE TRIGGER trg_supervisor_evaluations_updated
  BEFORE UPDATE ON public.supervisor_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_supervisor_evaluation_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'DRAFT' AND NEW.status IN ('IN_PROGRESS', 'SUBMITTED'))
    OR (OLD.status = 'IN_PROGRESS' AND NEW.status IN ('DRAFT', 'SUBMITTED'))
    OR (OLD.status = 'SUBMITTED' AND NEW.status = 'COMPLETED')
  ) THEN
    RAISE EXCEPTION 'Invalid supervisor evaluation status transition: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_supervisor_evaluation_status_transition
  BEFORE UPDATE OF status ON public.supervisor_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.validate_supervisor_evaluation_status_transition();

CREATE OR REPLACE FUNCTION public.validate_performance_supervisor_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.employee_evaluations ee
    JOIN public.employees e ON e.id = ee.employee_id
    WHERE ee.id = NEW.employee_evaluation_id
      AND e.assigned_supervisor_user_id = NEW.supervisor_user_id
  ) OR NOT public.has_portal_role(NEW.supervisor_user_id, 'SUPERVISOR') THEN
    RAISE EXCEPTION 'Supervisor must be the active supervisor assigned to the employee';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_performance_supervisor_assignment
  BEFORE INSERT OR UPDATE OF employee_evaluation_id, supervisor_user_id
  ON public.supervisor_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.validate_performance_supervisor_assignment();

CREATE TABLE public.supervisor_evaluation_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_evaluation_id uuid NOT NULL REFERENCES public.supervisor_evaluations(id) ON DELETE RESTRICT,
  category_id uuid NOT NULL REFERENCES public.evaluation_template_categories(id) ON DELETE RESTRICT,
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  comments text NOT NULL DEFAULT '',
  evidence text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supervisor_evaluation_id, category_id)
);

CREATE TRIGGER trg_supervisor_evaluation_ratings_updated
  BEFORE UPDATE ON public.supervisor_evaluation_ratings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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

  IF parent_status NOT IN ('DRAFT', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'Supervisor ratings cannot be changed after supervisor submission';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_supervisor_evaluation_rating_changes
  BEFORE INSERT OR UPDATE OR DELETE ON public.supervisor_evaluation_ratings
  FOR EACH ROW EXECUTE FUNCTION public.guard_supervisor_evaluation_rating_changes();

CREATE TABLE public.evaluation_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_evaluation_id uuid REFERENCES public.employee_evaluations(id) ON DELETE RESTRICT,
  supervisor_evaluation_id uuid REFERENCES public.supervisor_evaluations(id) ON DELETE RESTRICT,
  uploaded_by uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  file_name text NOT NULL,
  content_type text NOT NULL,
  file_size bigint NOT NULL CHECK (file_size > 0),
  storage_path text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(employee_evaluation_id, supervisor_evaluation_id) = 1)
);

CREATE TABLE public.evaluation_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_evaluation_id uuid REFERENCES public.employee_evaluations(id) ON DELETE RESTRICT,
  supervisor_evaluation_id uuid REFERENCES public.supervisor_evaluations(id) ON DELETE RESTRICT,
  author_user_id uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(employee_evaluation_id, supervisor_evaluation_id) = 1)
);

CREATE TABLE public.evaluation_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_evaluation_id uuid NOT NULL REFERENCES public.employee_evaluations(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES public.internal_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  previous_value jsonb,
  new_value jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evaluation_audit_logs_evaluation_time
  ON public.evaluation_audit_logs(employee_evaluation_id, occurred_at DESC);

CREATE TABLE public.performance_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE CASCADE,
  employee_evaluation_id uuid REFERENCES public.employee_evaluations(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'EVALUATION_AVAILABLE',
    'SELF_EVALUATION_SUBMITTED',
    'EVALUATION_RETURNED',
    'SUPERVISOR_SUBMITTED',
    'EVALUATION_COMPLETED',
    'EMPLOYEE_SUBMITTED',
    'EMPLOYEE_RESUBMITTED'
  )),
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX idx_performance_notifications_recipient_created
  ON public.performance_notifications(recipient_user_id, created_at DESC);

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
      WHERE e.id = _employee_id
        AND e.employment_status = 'ACTIVE'
        AND public.is_account_usable(auth.uid())
        AND (
        (
          e.user_id = auth.uid()
          AND public.has_portal_role(auth.uid(), 'EMPLOYEE')
          AND public.is_account_usable(e.user_id)
          AND e.assigned_supervisor_user_id IS NOT NULL
          AND public.has_portal_role(e.assigned_supervisor_user_id, 'SUPERVISOR')
          AND public.is_account_usable(e.assigned_supervisor_user_id)
        )
        OR (
          e.assigned_supervisor_user_id = auth.uid()
          AND public.has_portal_role(auth.uid(), 'SUPERVISOR')
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_performance_employee(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_performance_employee(uuid) TO authenticated, service_role;

ALTER TABLE public.job_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_rating_scale ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_template_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_evidence_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_evaluation_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_evaluation_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_notifications ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON
  public.job_positions,
  public.evaluation_rating_scale,
  public.evaluation_periods,
  public.evaluation_templates,
  public.evaluation_template_categories,
  public.evaluation_indicators,
  public.evaluation_evidence_requirements,
  public.employee_evaluations,
  public.employee_evaluation_ratings,
  public.supervisor_evaluations,
  public.supervisor_evaluation_ratings,
  public.evaluation_attachments,
  public.evaluation_comments,
  public.evaluation_audit_logs,
  public.performance_notifications
TO authenticated;

GRANT ALL ON
  public.job_positions,
  public.evaluation_rating_scale,
  public.evaluation_periods,
  public.evaluation_templates,
  public.evaluation_template_categories,
  public.evaluation_indicators,
  public.evaluation_evidence_requirements,
  public.employee_evaluations,
  public.employee_evaluation_ratings,
  public.supervisor_evaluations,
  public.supervisor_evaluation_ratings,
  public.evaluation_attachments,
  public.evaluation_comments,
  public.evaluation_audit_logs,
  public.performance_notifications
TO service_role;

CREATE POLICY "active positions readable by portal users"
  ON public.job_positions FOR SELECT TO authenticated
  USING (
    is_active
    AND (
      public.has_portal_role(auth.uid(), 'EMPLOYEE')
      OR public.has_portal_role(auth.uid(), 'SUPERVISOR')
    )
  );

CREATE POLICY "evaluation periods readable by portal users"
  ON public.evaluation_periods FOR SELECT TO authenticated
  USING (
    public.is_account_usable(auth.uid())
    AND (
      public.has_portal_role(auth.uid(), 'EMPLOYEE')
      OR public.has_portal_role(auth.uid(), 'SUPERVISOR')
    )
  );

CREATE POLICY "rating scale readable by portal users"
  ON public.evaluation_rating_scale FOR SELECT TO authenticated
  USING (
    public.has_portal_role(auth.uid(), 'EMPLOYEE')
    OR public.has_portal_role(auth.uid(), 'SUPERVISOR')
  );

CREATE POLICY "active evaluation templates readable by portal users"
  ON public.evaluation_templates FOR SELECT TO authenticated
  USING (
    status = 'ACTIVE'
    AND (
      public.has_portal_role(auth.uid(), 'EMPLOYEE')
      OR public.has_portal_role(auth.uid(), 'SUPERVISOR')
    )
  );

DROP POLICY IF EXISTS "templates viewable by signed-in users"
  ON public.evaluation_templates;

CREATE POLICY "active template categories readable by portal users"
  ON public.evaluation_template_categories FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.evaluation_templates t
      WHERE t.id = template_id AND t.status = 'ACTIVE'
    )
    AND (
      public.has_portal_role(auth.uid(), 'EMPLOYEE')
      OR public.has_portal_role(auth.uid(), 'SUPERVISOR')
    )
  );

CREATE POLICY "active template indicators readable by portal users"
  ON public.evaluation_indicators FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.evaluation_template_categories c
      JOIN public.evaluation_templates t ON t.id = c.template_id
      WHERE c.id = category_id AND t.status = 'ACTIVE'
    )
    AND (
      public.has_portal_role(auth.uid(), 'EMPLOYEE')
      OR public.has_portal_role(auth.uid(), 'SUPERVISOR')
    )
  );

CREATE POLICY "active template evidence readable by portal users"
  ON public.evaluation_evidence_requirements FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.evaluation_template_categories c
      JOIN public.evaluation_templates t ON t.id = c.template_id
      WHERE c.id = category_id AND t.status = 'ACTIVE'
    )
    AND (
      public.has_portal_role(auth.uid(), 'EMPLOYEE')
      OR public.has_portal_role(auth.uid(), 'SUPERVISOR')
    )
  );

CREATE POLICY "evaluation records readable by assigned portal users"
  ON public.employee_evaluations FOR SELECT TO authenticated
  USING (public.can_access_performance_employee(employee_id));

CREATE POLICY "self evaluation ratings readable by assigned portal users"
  ON public.employee_evaluation_ratings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employee_evaluations ee
      WHERE ee.id = employee_evaluation_id
        AND public.can_access_performance_employee(ee.employee_id)
    )
  );

CREATE POLICY "supervisor evaluations readable by assigned portal users"
  ON public.supervisor_evaluations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employee_evaluations ee
      WHERE ee.id = employee_evaluation_id
        AND public.can_access_performance_employee(ee.employee_id)
    )
    AND (
      public.has_portal_role(auth.uid(), 'SUPERVISOR')
      OR (
        public.has_portal_role(auth.uid(), 'EMPLOYEE')
        AND status IN ('SUBMITTED', 'COMPLETED')
      )
    )
  );

CREATE POLICY "supervisor ratings readable by assigned portal users"
  ON public.supervisor_evaluation_ratings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.supervisor_evaluations se
      JOIN public.employee_evaluations ee ON ee.id = se.employee_evaluation_id
      WHERE se.id = supervisor_evaluation_id
        AND public.can_access_performance_employee(ee.employee_id)
        AND (
          public.has_portal_role(auth.uid(), 'SUPERVISOR')
          OR (
            public.has_portal_role(auth.uid(), 'EMPLOYEE')
            AND se.status IN ('SUBMITTED', 'COMPLETED')
          )
        )
    )
  );

CREATE POLICY "evaluation attachments readable by assigned portal users"
  ON public.evaluation_attachments FOR SELECT TO authenticated
  USING (
    (
      employee_evaluation_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.employee_evaluations ee
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
          AND (
            public.has_portal_role(auth.uid(), 'SUPERVISOR')
            OR (
              public.has_portal_role(auth.uid(), 'EMPLOYEE')
              AND se.status IN ('SUBMITTED', 'COMPLETED')
            )
          )
      )
    )
  );

CREATE POLICY "evaluation comments readable by assigned portal users"
  ON public.evaluation_comments FOR SELECT TO authenticated
  USING (
    (
      employee_evaluation_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.employee_evaluations ee
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
          AND (
            public.has_portal_role(auth.uid(), 'SUPERVISOR')
            OR (
              public.has_portal_role(auth.uid(), 'EMPLOYEE')
              AND se.status IN ('SUBMITTED', 'COMPLETED')
            )
          )
      )
    )
  );

CREATE POLICY "evaluation audit readable by assigned portal users"
  ON public.evaluation_audit_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employee_evaluations ee
      WHERE ee.id = employee_evaluation_id
        AND public.can_access_performance_employee(ee.employee_id)
    )
  );

CREATE POLICY "users can read their performance notifications"
  ON public.performance_notifications FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

CREATE POLICY "users can mark their performance notifications read"
  ON public.performance_notifications FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());
