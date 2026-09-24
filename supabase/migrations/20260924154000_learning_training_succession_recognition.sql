CREATE TABLE IF NOT EXISTS public.development_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  source_evaluation_id uuid REFERENCES public.evaluations(id) ON DELETE SET NULL,
  source_key text NOT NULL DEFAULT gen_random_uuid()::text,
  development_need text NOT NULL CHECK (length(btrim(development_need)) > 0),
  development_activity text NOT NULL CHECK (development_activity IN ('Coaching', 'Mentoring', 'Self-Development', 'External Learning', 'External Training')),
  status text NOT NULL DEFAULT 'Recommended' CHECK (status IN ('Recommended', 'Ongoing', 'Completed')),
  record_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text NOT NULL DEFAULT '',
  is_system_generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_evaluation_id, source_key)
);

CREATE INDEX IF NOT EXISTS idx_development_records_employee ON public.development_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_development_records_status ON public.development_records(status);
CREATE INDEX IF NOT EXISTS idx_development_records_activity ON public.development_records(development_activity);

DROP TRIGGER IF EXISTS trg_development_records_updated ON public.development_records;
CREATE TRIGGER trg_development_records_updated BEFORE UPDATE ON public.development_records
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.permissions(code, module, description)
VALUES
  ('learning.view', 'Learning Management', 'View development records'),
  ('learning.manage', 'Learning Management', 'Create and maintain development records')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions(role_code, permission_code)
VALUES ('HR', 'learning.view'), ('HR', 'learning.manage')
ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.development_records TO authenticated;
ALTER TABLE public.development_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HR can view development records" ON public.development_records;
CREATE POLICY "HR can view development records" ON public.development_records
FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'learning.view'));

DROP POLICY IF EXISTS "HR can create development records" ON public.development_records;
CREATE POLICY "HR can create development records" ON public.development_records
FOR INSERT TO authenticated
WITH CHECK (public.has_permission(auth.uid(), 'learning.manage'));

DROP POLICY IF EXISTS "HR can update development records" ON public.development_records;
CREATE POLICY "HR can update development records" ON public.development_records
FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'learning.manage'))
WITH CHECK (public.has_permission(auth.uid(), 'learning.manage'));
CREATE TABLE IF NOT EXISTS public.training_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  source_evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE RESTRICT,
  training_title text NOT NULL CHECK (length(btrim(training_title)) > 0),
  related_competency text NOT NULL DEFAULT '',
  source text NOT NULL CHECK (source IN ('Gemini recommendation', 'Performance Evaluation', 'Competency Gap')),
  recommendation text NOT NULL CHECK (length(btrim(recommendation)) > 0),
  status text NOT NULL DEFAULT 'Recommended' CHECK (status = 'Recommended'),
  source_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_evaluation_id, source_key)
);

CREATE TABLE IF NOT EXISTS public.training_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  source_evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE RESTRICT,
  training_title text NOT NULL CHECK (length(btrim(training_title)) > 0),
  provider text NOT NULL DEFAULT '',
  training_date date,
  status text NOT NULL DEFAULT 'Required' CHECK (status IN ('Required', 'Approved', 'Completed')),
  related_competency text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  source_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_evaluation_id, source_key)
);

CREATE INDEX IF NOT EXISTS idx_training_recommendations_employee ON public.training_recommendations(employee_id);
CREATE INDEX IF NOT EXISTS idx_training_records_employee ON public.training_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_training_records_status ON public.training_records(status);

DROP TRIGGER IF EXISTS trg_training_recommendations_updated ON public.training_recommendations;
CREATE TRIGGER trg_training_recommendations_updated BEFORE UPDATE ON public.training_recommendations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_training_records_updated ON public.training_records;
CREATE TRIGGER trg_training_records_updated BEFORE UPDATE ON public.training_records
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.permissions(code, module, description)
VALUES
  ('training.view', 'Training Management', 'View training recommendations and records'),
  ('training.manage', 'Training Management', 'Maintain third-party training records')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions(role_code, permission_code)
VALUES ('HR', 'training.view'), ('HR', 'training.manage')
ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.training_recommendations, public.training_records TO authenticated;
ALTER TABLE public.training_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR can view training recommendations" ON public.training_recommendations
FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'training.view'));
CREATE POLICY "HR can view training records" ON public.training_records
FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'training.view'));
CREATE POLICY "HR can manage training records" ON public.training_records
FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), 'training.manage'));
CREATE POLICY "HR can update training records" ON public.training_records
FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'training.manage'))
WITH CHECK (public.has_permission(auth.uid(), 'training.manage'));
CREATE TABLE IF NOT EXISTS public.succession_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE RESTRICT,
  source_evaluation_id uuid NOT NULL UNIQUE REFERENCES public.evaluations(id) ON DELETE RESTRICT,
  development_potential text NOT NULL DEFAULT '',
  advancement_outlook text NOT NULL DEFAULT '',
  career_interest text NOT NULL DEFAULT '',
  transfer_interest text NOT NULL DEFAULT '',
  desired_job text NOT NULL DEFAULT '',
  desired_location text NOT NULL DEFAULT '',
  qualification text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_succession_profiles_employee ON public.succession_profiles(employee_id);

DROP TRIGGER IF EXISTS trg_succession_profiles_updated ON public.succession_profiles;
CREATE TRIGGER trg_succession_profiles_updated BEFORE UPDATE ON public.succession_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.permissions(code, module, description)
VALUES
  ('succession.view', 'Succession Planning', 'View Career and Succession Profiles'),
  ('succession.manage', 'Succession Planning', 'Maintain Career and Succession Profile notes')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions(role_code, permission_code)
VALUES
  ('HR', 'succession.view'),
  ('HR', 'succession.manage'),
  ('PRESIDENT', 'succession.view'),
  ('ADMINISTRATOR', 'succession.view')
ON CONFLICT DO NOTHING;

GRANT SELECT, UPDATE ON public.succession_profiles TO authenticated;
ALTER TABLE public.succession_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized management can view succession profiles" ON public.succession_profiles
FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'succession.view'));

CREATE POLICY "Authorized HR can update succession profiles" ON public.succession_profiles
FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'succession.manage'))
WITH CHECK (public.has_permission(auth.uid(), 'succession.manage'));
CREATE TABLE IF NOT EXISTS public.recognition_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  source_evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE RESTRICT,
  recognition_type text NOT NULL CHECK (recognition_type IN ('Highest Rated Employee', 'Most Improved Employee', 'Outstanding Performance', 'Other Recognition')),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by uuid REFERENCES public.internal_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text NOT NULL DEFAULT '',
  source_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_evaluation_id, source_key)
);

CREATE TABLE IF NOT EXISTS public.recognition_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL UNIQUE REFERENCES public.recognition_candidates(id) ON DELETE RESTRICT,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  source_evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE RESTRICT,
  recognition_type text NOT NULL CHECK (recognition_type IN ('Highest Rated Employee', 'Most Improved Employee', 'Outstanding Performance', 'Other Recognition')),
  reason text NOT NULL,
  recognition_date date NOT NULL DEFAULT CURRENT_DATE,
  approved_by uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'APPROVED' CHECK (status = 'APPROVED'),
  certificate_generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recognition_candidates_employee ON public.recognition_candidates(employee_id);
CREATE INDEX IF NOT EXISTS idx_recognition_candidates_status ON public.recognition_candidates(status);
CREATE INDEX IF NOT EXISTS idx_recognition_records_employee ON public.recognition_records(employee_id);

DROP TRIGGER IF EXISTS trg_recognition_candidates_updated ON public.recognition_candidates;
CREATE TRIGGER trg_recognition_candidates_updated BEFORE UPDATE ON public.recognition_candidates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_recognition_records_updated ON public.recognition_records;
CREATE TRIGGER trg_recognition_records_updated BEFORE UPDATE ON public.recognition_records
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.permissions(code, module, description)
VALUES
  ('recognition.view', 'Social Recognition', 'View recognition candidates and history'),
  ('recognition.manage', 'Social Recognition', 'Review and approve recognition candidates')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions(role_code, permission_code)
VALUES
  ('HR', 'recognition.view'), ('HR', 'recognition.manage'),
  ('PRESIDENT', 'recognition.view'), ('PRESIDENT', 'recognition.manage'),
  ('ADMINISTRATOR', 'recognition.view'), ('ADMINISTRATOR', 'recognition.manage')
ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.recognition_candidates, public.recognition_records TO authenticated;
ALTER TABLE public.recognition_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recognition_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Management can view recognition candidates" ON public.recognition_candidates
FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'recognition.view'));
CREATE POLICY "Management can review recognition candidates" ON public.recognition_candidates
FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), 'recognition.manage'));
CREATE POLICY "Management can update recognition candidates" ON public.recognition_candidates
FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'recognition.manage'))
WITH CHECK (public.has_permission(auth.uid(), 'recognition.manage'));
CREATE POLICY "Management can view recognition records" ON public.recognition_records
FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'recognition.view'));
CREATE POLICY "Management can create recognition records" ON public.recognition_records
FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), 'recognition.manage'));
CREATE POLICY "Management can update recognition records" ON public.recognition_records
FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'recognition.manage'))
WITH CHECK (public.has_permission(auth.uid(), 'recognition.manage'));
ALTER TABLE public.training_records
  ADD COLUMN IF NOT EXISTS committee_recommendation text NOT NULL DEFAULT '';
ALTER TABLE public.development_records
  DROP CONSTRAINT IF EXISTS development_records_development_activity_check;

ALTER TABLE public.development_records
  ADD CONSTRAINT development_records_development_activity_check
  CHECK (development_activity IN ('Coaching', 'Mentoring', 'Self-Development', 'External Learning', 'External Training', 'Not specified'));
