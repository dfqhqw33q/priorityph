-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('ADMINISTRATOR','PRESIDENT','HR','SUPERVISOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.cycle_status AS ENUM ('DRAFT','ACTIVE','CLOSED','DISABLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.evaluator_type AS ENUM ('EMPLOYEE','SUPERVISOR','PRESIDENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.evaluation_status AS ENUM ('EMPLOYEE_SUBMITTED','SUPERVISOR_DRAFT','SUPERVISOR_SUBMITTED','PRESIDENT_REVIEW','FINALIZED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.employment_status AS ENUM ('ACTIVE','INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ COMMON ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ INTERNAL USERS ============
CREATE TABLE IF NOT EXISTS public.internal_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (position('@' in email) > 1),
  full_name text NOT NULL CHECK (length(btrim(full_name)) > 0),
  job_title text,
  is_active boolean NOT NULL DEFAULT true,
  is_locked boolean NOT NULL DEFAULT false,
  must_change_password boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_internal_users_updated ON public.internal_users;
CREATE TRIGGER trg_internal_users_updated BEFORE UPDATE ON public.internal_users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.roles (
  code public.app_role PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.permissions (
  code text PRIMARY KEY CHECK (code ~ '^[a-z_]+\.[a-z0-9_]+$'),
  module text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_code public.app_role NOT NULL REFERENCES public.roles(code) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_code, permission_code)
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL REFERENCES public.roles(code),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);

-- ============ EMPLOYEES ============
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_number text NOT NULL UNIQUE CHECK (length(btrim(employee_number)) > 0),
  full_name text NOT NULL CHECK (length(btrim(full_name)) > 0),
  job_title text NOT NULL DEFAULT '',
  division text NOT NULL DEFAULT '',
  section text NOT NULL DEFAULT '',
  employment_status public.employment_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employees_name ON public.employees(lower(full_name));
DROP TRIGGER IF EXISTS trg_employees_updated ON public.employees;
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ TEMPLATES ============
CREATE TABLE IF NOT EXISTS public.evaluation_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_templates_updated ON public.evaluation_templates;
CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON public.evaluation_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.evaluation_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.evaluation_templates(id) ON DELETE CASCADE,
  letter text NOT NULL CHECK (letter ~ '^[A-Z]$'),
  title text NOT NULL,
  description text NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, letter),
  UNIQUE (template_id, position)
);
CREATE INDEX IF NOT EXISTS idx_criteria_template ON public.evaluation_criteria(template_id);

-- ============ CYCLES ============
CREATE TABLE IF NOT EXISTS public.evaluation_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2200),
  template_id uuid NOT NULL REFERENCES public.evaluation_templates(id) ON DELETE RESTRICT,
  instructions text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status public.cycle_status NOT NULL DEFAULT 'DRAFT',
  cycle_token text UNIQUE,
  token_generated_at timestamptz,
  activated_at timestamptz,
  closed_at timestamptz,
  created_by uuid REFERENCES public.internal_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cycles_year ON public.evaluation_cycles(year);
DROP TRIGGER IF EXISTS trg_cycles_updated ON public.evaluation_cycles;
CREATE TRIGGER trg_cycles_updated BEFORE UPDATE ON public.evaluation_cycles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ EVALUATIONS ============
CREATE TABLE IF NOT EXISTS public.evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.evaluation_cycles(id) ON DELETE RESTRICT,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  status public.evaluation_status NOT NULL DEFAULT 'EMPLOYEE_SUBMITTED',
  employee_number_snapshot text NOT NULL,
  full_name_snapshot text NOT NULL,
  job_title_snapshot text NOT NULL,
  division_snapshot text NOT NULL,
  section_snapshot text NOT NULL,
  employee_submitted_at timestamptz,
  supervisor_user_id uuid REFERENCES public.internal_users(id) ON DELETE SET NULL,
  supervisor_remarks text NOT NULL DEFAULT '',
  supervisor_submitted_at timestamptz,
  president_user_id uuid REFERENCES public.internal_users(id) ON DELETE SET NULL,
  is_finalized boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_evaluations_status ON public.evaluations(status);
CREATE INDEX IF NOT EXISTS idx_evaluations_cycle ON public.evaluations(cycle_id);
DROP TRIGGER IF EXISTS trg_evaluations_updated ON public.evaluations;
CREATE TRIGGER trg_evaluations_updated BEFORE UPDATE ON public.evaluations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.evaluation_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL REFERENCES public.evaluation_criteria(id) ON DELETE RESTRICT,
  evaluator_type public.evaluator_type NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  evaluator_user_id uuid REFERENCES public.internal_users(id) ON DELETE SET NULL,
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_id, criterion_id, evaluator_type)
);
CREATE INDEX IF NOT EXISTS idx_ratings_eval ON public.evaluation_ratings(evaluation_id);
DROP TRIGGER IF EXISTS trg_ratings_updated ON public.evaluation_ratings;
CREATE TRIGGER trg_ratings_updated BEFORE UPDATE ON public.evaluation_ratings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.evaluation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status public.evaluation_status,
  to_status public.evaluation_status,
  actor_user_id uuid REFERENCES public.internal_users(id) ON DELETE SET NULL,
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eval_events_eval ON public.evaluation_events(evaluation_id);

-- ============ AUDIT ============
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_role text,
  action text NOT NULL,
  module text NOT NULL,
  entity_type text,
  entity_id uuid,
  employee_id uuid,
  evaluation_id uuid,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  correlation_id text,
  result text NOT NULL DEFAULT 'SUCCESS',
  ip_address text,
  user_agent text
);
CREATE INDEX IF NOT EXISTS idx_audit_occurred ON public.audit_logs(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.audit_logs(action);

CREATE TABLE IF NOT EXISTS public.login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  event_type text NOT NULL,
  result text NOT NULL DEFAULT 'SUCCESS',
  ip_address text,
  user_agent text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_events_occurred ON public.login_events(occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.password_reset_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  event_type text NOT NULL,
  ip_address text,
  user_agent text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- ============ AUTHZ FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.internal_users u ON u.id = ur.user_id
    WHERE ur.user_id = _user_id AND ur.role = _role AND u.is_active AND NOT u.is_locked
  );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_code = ur.role
    JOIN public.internal_users u ON u.id = ur.user_id
    WHERE ur.user_id = _user_id AND rp.permission_code = _permission
      AND u.is_active AND NOT u.is_locked
  );
$$;

CREATE OR REPLACE FUNCTION public.is_account_usable(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.internal_users u WHERE u.id = _user_id AND u.is_active AND NOT u.is_locked);
$$;

CREATE OR REPLACE FUNCTION public.count_active_administrators()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.user_roles ur
  JOIN public.internal_users u ON u.id = ur.user_id
  WHERE ur.role = 'ADMINISTRATOR' AND u.is_active AND NOT u.is_locked;
$$;

CREATE OR REPLACE FUNCTION public.protect_last_admin_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.role = 'ADMINISTRATOR' AND public.count_active_administrators() <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last active Administrator';
  END IF;
  RETURN OLD;
END; $$;
DROP TRIGGER IF EXISTS trg_protect_last_admin_role ON public.user_roles;
CREATE TRIGGER trg_protect_last_admin_role BEFORE DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_last_admin_role();

CREATE OR REPLACE FUNCTION public.protect_last_admin_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (OLD.is_active AND (NOT NEW.is_active OR NEW.is_locked))
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = OLD.id AND ur.role='ADMINISTRATOR')
     AND public.count_active_administrators() <= 1 THEN
    RAISE EXCEPTION 'Cannot deactivate or lock the last active Administrator';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_protect_last_admin_user ON public.internal_users;
CREATE TRIGGER trg_protect_last_admin_user BEFORE UPDATE ON public.internal_users
FOR EACH ROW EXECUTE FUNCTION public.protect_last_admin_user();

CREATE OR REPLACE FUNCTION public.protect_finalized_evaluation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.is_finalized AND NEW.is_finalized THEN
    RAISE EXCEPTION 'Finalized evaluations cannot be modified';
  END IF;
  NEW.version = OLD.version + 1;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_protect_finalized ON public.evaluations;
CREATE TRIGGER trg_protect_finalized BEFORE UPDATE ON public.evaluations
FOR EACH ROW EXECUTE FUNCTION public.protect_finalized_evaluation();

CREATE OR REPLACE FUNCTION public.protect_locked_rating()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.is_locked AND NEW.is_locked THEN
    RAISE EXCEPTION 'Locked ratings cannot be modified';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_protect_locked_rating ON public.evaluation_ratings;
CREATE TRIGGER trg_protect_locked_rating BEFORE UPDATE ON public.evaluation_ratings
FOR EACH ROW EXECUTE FUNCTION public.protect_locked_rating();

-- ============ GRANTS ============
GRANT SELECT ON public.internal_users TO authenticated;
GRANT SELECT ON public.roles TO authenticated;
GRANT SELECT ON public.permissions TO authenticated;
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.employees TO authenticated;
GRANT SELECT ON public.evaluation_templates TO authenticated;
GRANT SELECT ON public.evaluation_criteria TO authenticated;
GRANT SELECT ON public.evaluation_cycles TO authenticated;
GRANT SELECT ON public.evaluations TO authenticated;
GRANT SELECT ON public.evaluation_ratings TO authenticated;
GRANT SELECT ON public.evaluation_events TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT SELECT ON public.login_events TO authenticated;
GRANT SELECT ON public.password_reset_events TO authenticated;

GRANT ALL ON public.internal_users, public.roles, public.permissions, public.role_permissions,
  public.user_roles, public.employees, public.evaluation_templates, public.evaluation_criteria,
  public.evaluation_cycles, public.evaluations, public.evaluation_ratings, public.evaluation_events,
  public.audit_logs, public.login_events, public.password_reset_events TO service_role;

-- ============ RLS ============
ALTER TABLE public.internal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own profile or user management" ON public.internal_users;
CREATE POLICY "own profile or user management" ON public.internal_users FOR SELECT TO authenticated
USING (id = auth.uid() OR public.has_permission(auth.uid(), 'users.view'));

DROP POLICY IF EXISTS "roles readable by signed-in users" ON public.roles;
CREATE POLICY "roles readable by signed-in users" ON public.roles FOR SELECT TO authenticated USING (public.is_account_usable(auth.uid()));
DROP POLICY IF EXISTS "permissions readable by signed-in users" ON public.permissions;
CREATE POLICY "permissions readable by signed-in users" ON public.permissions FOR SELECT TO authenticated USING (public.is_account_usable(auth.uid()));
DROP POLICY IF EXISTS "role permissions readable by signed-in users" ON public.role_permissions;
CREATE POLICY "role permissions readable by signed-in users" ON public.role_permissions FOR SELECT TO authenticated USING (public.is_account_usable(auth.uid()));
DROP POLICY IF EXISTS "own roles or user management" ON public.user_roles;
CREATE POLICY "own roles or user management" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'users.view'));

DROP POLICY IF EXISTS "employees viewable with permission" ON public.employees;
CREATE POLICY "employees viewable with permission" ON public.employees FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'employees.view'));

DROP POLICY IF EXISTS "templates viewable by signed-in users" ON public.evaluation_templates;
CREATE POLICY "templates viewable by signed-in users" ON public.evaluation_templates FOR SELECT TO authenticated USING (public.is_account_usable(auth.uid()));
DROP POLICY IF EXISTS "criteria viewable by signed-in users" ON public.evaluation_criteria;
CREATE POLICY "criteria viewable by signed-in users" ON public.evaluation_criteria FOR SELECT TO authenticated USING (public.is_account_usable(auth.uid()));
DROP POLICY IF EXISTS "cycles viewable by signed-in users" ON public.evaluation_cycles;
CREATE POLICY "cycles viewable by signed-in users" ON public.evaluation_cycles FOR SELECT TO authenticated USING (public.is_account_usable(auth.uid()));

DROP POLICY IF EXISTS "evaluations viewable with permission" ON public.evaluations;
CREATE POLICY "evaluations viewable with permission" ON public.evaluations FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'evaluations.view_step1')
    OR public.has_permission(auth.uid(), 'president.view'));
DROP POLICY IF EXISTS "ratings viewable with permission" ON public.evaluation_ratings;
CREATE POLICY "ratings viewable with permission" ON public.evaluation_ratings FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'evaluations.view_step1')
    OR public.has_permission(auth.uid(), 'president.view'));
DROP POLICY IF EXISTS "evaluation events viewable with permission" ON public.evaluation_events;
CREATE POLICY "evaluation events viewable with permission" ON public.evaluation_events FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'evaluations.view_history'));

DROP POLICY IF EXISTS "audit logs viewable with permission" ON public.audit_logs;
CREATE POLICY "audit logs viewable with permission" ON public.audit_logs FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'audit.view'));
DROP POLICY IF EXISTS "login events viewable with permission" ON public.login_events;
CREATE POLICY "login events viewable with permission" ON public.login_events FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'audit.view'));
DROP POLICY IF EXISTS "password reset events viewable with permission" ON public.password_reset_events;
CREATE POLICY "password reset events viewable with permission" ON public.password_reset_events FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'audit.view'));

-- ============ SEED ============
INSERT INTO public.roles(code, name, description) VALUES
 ('ADMINISTRATOR','Administrator','Technical administration, access control and audit'),
 ('PRESIDENT','President','Executive evaluation authority'),
 ('HR','HR/Personnel','Manages annual evaluation cycles and QR links'),
 ('SUPERVISOR','Supervisor','Reviews employee assessments and submits to the President')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.permissions(code, module, description) VALUES
 ('users.view','User Management','View internal users'),
 ('users.manage','User Management','Create and edit internal users'),
 ('users.assign_roles','User Management','Assign roles to internal users'),
 ('users.reset_password','User Management','Trigger password resets and require password change'),
 ('users.revoke_sessions','User Management','Revoke user sessions'),
 ('roles.manage','Role Management','Configure roles'),
 ('permissions.manage','Permission Management','Configure role permissions'),
 ('employees.view','Employees','View employee records'),
 ('templates.manage','Templates','Manage evaluation templates'),
 ('cycles.view','Cycles','View evaluation cycles'),
 ('cycles.manage','Cycles','Create, update, activate, close and disable cycles'),
 ('cycles.manage_link','Cycles','Generate and regenerate the annual QR link'),
 ('evaluations.view_step1','Evaluations','View submitted employee Step 1 assessments'),
 ('evaluations.rate_supervisor','Evaluations','Enter supervisor ratings'),
 ('evaluations.submit_president','Evaluations','Submit an assessment to the President'),
 ('evaluations.reopen_supervisor','Evaluations','Reopen a submitted supervisor rating for correction'),
 ('evaluations.view_history','Evaluations','View evaluation audit history'),
 ('president.view','President','View supervisor-submitted evaluations'),
 ('president.step2','President','Complete President Step 2 (future phase)'),
 ('president.step3','President','Complete President Step 3 (future phase)'),
 ('evaluations.finalize','Evaluations','Finalize evaluations (future phase)'),
 ('reports.view','Reports','View reports (future phase)'),
 ('audit.view','Audit','View audit logs')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions(role_code, permission_code) VALUES
 ('ADMINISTRATOR','users.view'),('ADMINISTRATOR','users.manage'),('ADMINISTRATOR','users.assign_roles'),
 ('ADMINISTRATOR','users.reset_password'),('ADMINISTRATOR','users.revoke_sessions'),('ADMINISTRATOR','roles.manage'),
 ('ADMINISTRATOR','permissions.manage'),('ADMINISTRATOR','audit.view'),('ADMINISTRATOR','templates.manage'),
 ('ADMINISTRATOR','cycles.view'),
 ('HR','cycles.view'),('HR','cycles.manage'),('HR','cycles.manage_link'),('HR','employees.view'),
 ('HR','templates.manage'),('HR','evaluations.view_history'),
 ('SUPERVISOR','evaluations.view_step1'),('SUPERVISOR','evaluations.rate_supervisor'),
 ('SUPERVISOR','evaluations.submit_president'),('SUPERVISOR','employees.view'),('SUPERVISOR','cycles.view'),
 ('SUPERVISOR','evaluations.view_history'),
 ('PRESIDENT','president.view'),('PRESIDENT','employees.view'),('PRESIDENT','cycles.view'),
 ('PRESIDENT','evaluations.view_history')
ON CONFLICT DO NOTHING;

INSERT INTO public.evaluation_templates(id, name, description)
VALUES ('11111111-1111-4111-8111-111111111111','Performance Evaluation Factors','Official ten-factor performance evaluation template')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.evaluation_criteria(template_id, letter, title, description, position) VALUES
 ('11111111-1111-4111-8111-111111111111','A','QUALITY OF WORK','Consider the neatness, accuracy, and completeness of the employee''s work in relation to company standards.',1),
 ('11111111-1111-4111-8111-111111111111','B','QUANTITY OF WORK','Consider the volume of work done by the employee and the speed at which work was satisfactorily completed.',2),
 ('11111111-1111-4111-8111-111111111111','C','JOB KNOWLEDGE','Consider the employee''s skill, knowledge, and understanding of the details of regularly assigned work.',3),
 ('11111111-1111-4111-8111-111111111111','D','ABILITY TO LEARN','Consider the employee''s ability to learn new job procedures and methods and the speed at which the employee grasps instructions.',4),
 ('11111111-1111-4111-8111-111111111111','E','DEPENDABILITY','Consider the employee''s attendance, punctuality, and the seriousness with which the employee performs duties.',5),
 ('11111111-1111-4111-8111-111111111111','F','INITIATIVE','Consider the employee''s resourcefulness or ability to develop new approaches to problems as required by the job.',6),
 ('11111111-1111-4111-8111-111111111111','G','HUMAN RELATIONS/TEAMWORK','Consider the employee''s ability to get along with co-employees and clients and the employee''s sense of organizational loyalty.',7),
 ('11111111-1111-4111-8111-111111111111','H','COST CONSCIOUSNESS','Consider the employee''s attitude toward cost objectives in relation to work, efforts at preventing waste, and efforts at generating cost savings.',8),
 ('11111111-1111-4111-8111-111111111111','I','DISCIPLINE','Consider the employee''s conduct on the job, attitude toward company rules, and efforts at promoting harmonious relationships among others.',9),
 ('11111111-1111-4111-8111-111111111111','J','SAFETY CONSCIOUSNESS/CARE OF EQUIPMENT','Consider the manner in which the employee handles themselves, materials, and equipment in a work situation and the employee''s safety consciousness.',10)
ON CONFLICT (template_id, letter) DO NOTHING;