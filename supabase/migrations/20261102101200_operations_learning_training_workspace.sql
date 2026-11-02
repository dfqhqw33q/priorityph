INSERT INTO public.permissions (code, module, description) VALUES
  ('operations.learning.view', 'Learning & Training', 'View learning and training operations'),
  ('operations.learning.manage', 'Learning & Training', 'Manage courses, paths, quizzes, plans and training delivery'),
  ('operations.learning.review', 'Learning & Training', 'Review and publish learning content'),
  ('operations.recommendations.review', 'AI Recommendations', 'Review validated gap-linked AI recommendations'),
  ('operations.plans.approve', 'Development Plans', 'Approve or return development plans')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_code, permission_code) VALUES
  ('OPERATIONS_MANAGER', 'operations.learning.view'),
  ('OPERATIONS_MANAGER', 'operations.learning.manage'),
  ('OPERATIONS_MANAGER', 'operations.learning.review'),
  ('OPERATIONS_MANAGER', 'operations.recommendations.review'),
  ('OPERATIONS_MANAGER', 'operations.plans.approve'),
  ('HR', 'operations.plans.approve')
ON CONFLICT DO NOTHING;

CREATE TABLE public.learning_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  format text NOT NULL DEFAULT 'SELF_PACED',
  duration_minutes integer NOT NULL DEFAULT 0 CHECK (duration_minutes >= 0),
  target_roles text[] NOT NULL DEFAULT '{}',
  objectives text[] NOT NULL DEFAULT '{}',
  content_blocks jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(content_blocks) = 'array'),
  prerequisites text[] NOT NULL DEFAULT '{}',
  completion_criteria text NOT NULL DEFAULT '',
  review_due_on date,
  version_notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED')),
  created_by uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  reviewed_by uuid REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, version)
);

CREATE TABLE public.learning_course_competencies (
  course_id uuid NOT NULL REFERENCES public.learning_courses(id) ON DELETE RESTRICT,
  competency_definition_id uuid NOT NULL REFERENCES public.competency_definitions(id) ON DELETE RESTRICT,
  PRIMARY KEY (course_id, competency_definition_id)
);

CREATE TABLE public.learning_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text NOT NULL DEFAULT '',
  target_job_position_id uuid REFERENCES public.job_positions(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  created_by uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);

CREATE TABLE public.learning_path_courses (
  path_id uuid NOT NULL REFERENCES public.learning_paths(id) ON DELETE RESTRICT,
  course_id uuid NOT NULL REFERENCES public.learning_courses(id) ON DELETE RESTRICT,
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  required boolean NOT NULL DEFAULT true,
  PRIMARY KEY (path_id, course_id),
  UNIQUE (path_id, sequence_number)
);

CREATE TABLE public.learning_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.learning_courses(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  questions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(questions) = 'array'),
  pass_threshold numeric(5,2) NOT NULL CHECK (pass_threshold BETWEEN 0 AND 100),
  attempt_limit integer NOT NULL DEFAULT 1 CHECK (attempt_limit > 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  created_by uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, version)
);

CREATE TABLE public.learning_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  course_id uuid NOT NULL REFERENCES public.learning_courses(id) ON DELETE RESTRICT,
  plan_id uuid,
  assigned_by uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  due_at date,
  status text NOT NULL DEFAULT 'ASSIGNED'
    CHECK (status IN ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED')),
  progress_percent smallint NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, course_id, plan_id)
);

CREATE TABLE public.development_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  assessment_id uuid NOT NULL REFERENCES public.competency_assessments(id) ON DELETE RESTRICT,
  requirement_item_id uuid NOT NULL REFERENCES public.competency_requirement_items(id) ON DELETE RESTRICT,
  recommendation_id uuid,
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  activity_type text NOT NULL,
  activity_description text NOT NULL,
  owner_user_id uuid REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  target_date date,
  success_criteria text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'RETURNED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
  approval_user_id uuid REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  decision_reason text,
  followup_assessment_id uuid REFERENCES public.competency_assessments(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'APPROVED') = (approval_user_id IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE public.operations_ai_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  assessment_id uuid NOT NULL REFERENCES public.competency_assessments(id) ON DELETE RESTRICT,
  requirement_item_id uuid NOT NULL REFERENCES public.competency_requirement_items(id) ON DELETE RESTRICT,
  model_name text NOT NULL,
  model_version text NOT NULL,
  rationale text NOT NULL,
  activity_title text NOT NULL,
  activity_type text NOT NULL,
  mapped_course_id uuid REFERENCES public.learning_courses(id) ON DELETE RESTRICT,
  verification_method text NOT NULL,
  source_references jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING_REVIEW'
    CHECK (status IN ('PENDING_REVIEW', 'ACCEPTED', 'REJECTED', 'EVIDENCE_REQUESTED', 'CONVERTED')),
  reviewer_user_id uuid REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  reviewer_decision text,
  decision_reason text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.development_plans
  ADD CONSTRAINT development_plans_recommendation_id_fkey
  FOREIGN KEY (recommendation_id) REFERENCES public.operations_ai_recommendations(id) ON DELETE RESTRICT;

ALTER TABLE public.learning_assignments
  ADD CONSTRAINT learning_assignments_plan_id_fkey
  FOREIGN KEY (plan_id) REFERENCES public.development_plans(id) ON DELETE RESTRICT;

CREATE TABLE public.training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES public.learning_courses(id) ON DELETE RESTRICT,
  plan_id uuid REFERENCES public.development_plans(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  trainer_user_id uuid REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  venue text NOT NULL DEFAULT '',
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  status text NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
  created_by uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE public.training_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.training_sessions(id) ON DELETE RESTRICT,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'REGISTERED'
    CHECK (status IN ('REGISTERED', 'ATTENDED', 'PARTIAL', 'ABSENT', 'EXCUSED', 'CANCELLED')),
  attendance_notes text NOT NULL DEFAULT '',
  recorded_by uuid REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  recorded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, employee_id)
);

CREATE TABLE public.learning_quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.learning_quizzes(id) ON DELETE RESTRICT,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  score numeric(5,2) CHECK (score BETWEEN 0 AND 100),
  passed boolean,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.internal_users(id) ON DELETE RESTRICT
);

CREATE INDEX ON public.development_plans (employee_id, status, target_date);
CREATE INDEX ON public.operations_ai_recommendations (status, created_at DESC);
CREATE INDEX ON public.learning_assignments (employee_id, status, due_at);
CREATE INDEX ON public.training_sessions (starts_at, status);
CREATE INDEX ON public.training_attendance (employee_id, status);

ALTER TABLE public.learning_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_course_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_path_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.development_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_ai_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_quiz_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.learning_courses, public.learning_course_competencies,
  public.learning_paths, public.learning_path_courses, public.learning_quizzes,
  public.learning_assignments, public.development_plans, public.operations_ai_recommendations,
  public.training_sessions, public.training_attendance, public.learning_quiz_attempts
FROM anon, authenticated;
GRANT SELECT ON public.learning_courses, public.learning_course_competencies,
  public.learning_paths, public.learning_path_courses, public.learning_quizzes,
  public.learning_assignments, public.development_plans, public.operations_ai_recommendations,
  public.training_sessions, public.training_attendance, public.learning_quiz_attempts
TO authenticated;
GRANT ALL ON public.learning_courses, public.learning_course_competencies,
  public.learning_paths, public.learning_path_courses, public.learning_quizzes,
  public.learning_assignments, public.development_plans, public.operations_ai_recommendations,
  public.training_sessions, public.training_attendance, public.learning_quiz_attempts
TO service_role;

CREATE POLICY "authorized learning course reads" ON public.learning_courses
  FOR SELECT TO authenticated
  USING (status = 'PUBLISHED' OR public.has_permission(auth.uid(), 'operations.learning.view'));
CREATE POLICY "authorized learning course competency reads" ON public.learning_course_competencies
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.learning_courses c WHERE c.id = course_id AND
    (c.status = 'PUBLISHED' OR public.has_permission(auth.uid(), 'operations.learning.view'))));
CREATE POLICY "authorized learning path reads" ON public.learning_paths
  FOR SELECT TO authenticated
  USING (status = 'PUBLISHED' OR public.has_permission(auth.uid(), 'operations.learning.view'));
CREATE POLICY "authorized learning path item reads" ON public.learning_path_courses
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.learning_paths p WHERE p.id = path_id AND
    (p.status = 'PUBLISHED' OR public.has_permission(auth.uid(), 'operations.learning.view'))));
CREATE POLICY "authorized quiz reads" ON public.learning_quizzes
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'operations.learning.view'));
CREATE POLICY "scoped learning assignment reads" ON public.learning_assignments
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'operations.learning.view')
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR public.can_access_competency_employee(employee_id)
  );
CREATE POLICY "scoped development plan reads" ON public.development_plans
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'operations.learning.view')
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR public.can_access_competency_employee(employee_id)
  );
CREATE POLICY "recommendations visible to authorized reviewers" ON public.operations_ai_recommendations
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'operations.recommendations.review'));
CREATE POLICY "authorized training session reads" ON public.training_sessions
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'operations.learning.view'));
CREATE POLICY "scoped training attendance reads" ON public.training_attendance
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'operations.learning.view')
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR public.can_access_competency_employee(employee_id)
  );
CREATE POLICY "scoped quiz attempt reads" ON public.learning_quiz_attempts
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'operations.learning.view')
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR public.can_access_competency_employee(employee_id)
  );
