-- Evaluation workflow and scoring.
-- Consolidated from reviewed repository SQL modules; preserve dependency order.

-- BEGIN 20260826112311_president_review_workflow.sql
-- 2. Configurable President step templates
CREATE TABLE IF NOT EXISTS public.president_step_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step integer NOT NULL CHECK (step IN (2,3)),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.president_step_templates TO authenticated;
GRANT ALL ON public.president_step_templates TO service_role;
ALTER TABLE public.president_step_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "president step templates readable by signed-in users" ON public.president_step_templates;
CREATE POLICY "president step templates readable by signed-in users" ON public.president_step_templates FOR SELECT TO authenticated
  USING (public.is_account_usable(auth.uid()));
DROP TRIGGER IF EXISTS trg_president_step_templates_updated ON public.president_step_templates;
CREATE TRIGGER trg_president_step_templates_updated BEFORE UPDATE ON public.president_step_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.president_step_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.president_step_templates(id) ON DELETE CASCADE,
  position integer NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  help_text text NOT NULL DEFAULT '',
  input_type text NOT NULL DEFAULT 'LONG_TEXT'
    CHECK (input_type IN ('TEXT','LONG_TEXT','SINGLE_CHOICE','YES_NO')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, code)
);
GRANT SELECT ON public.president_step_items TO authenticated;
GRANT ALL ON public.president_step_items TO service_role;
ALTER TABLE public.president_step_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "president step items readable by signed-in users" ON public.president_step_items;
CREATE POLICY "president step items readable by signed-in users" ON public.president_step_items FOR SELECT TO authenticated
  USING (public.is_account_usable(auth.uid()));
DROP TRIGGER IF EXISTS trg_president_step_items_updated ON public.president_step_items;
CREATE TRIGGER trg_president_step_items_updated BEFORE UPDATE ON public.president_step_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. President responses per evaluation
CREATE TABLE IF NOT EXISTS public.president_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.president_step_items(id) ON DELETE CASCADE,
  step integer NOT NULL CHECK (step IN (2,3)),
  value_text text NOT NULL DEFAULT '',
  is_locked boolean NOT NULL DEFAULT false,
  responded_by uuid REFERENCES public.internal_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_id, item_id)
);
GRANT SELECT ON public.president_responses TO authenticated;
GRANT ALL ON public.president_responses TO service_role;
ALTER TABLE public.president_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "president responses viewable with permission" ON public.president_responses;
CREATE POLICY "president responses viewable with permission" ON public.president_responses FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'president.view')
      OR public.has_permission(auth.uid(),'evaluations.view_history'));
DROP TRIGGER IF EXISTS trg_president_responses_updated ON public.president_responses;
CREATE TRIGGER trg_president_responses_updated BEFORE UPDATE ON public.president_responses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.protect_locked_president_response()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.is_locked AND NEW.is_locked THEN
    RAISE EXCEPTION 'Locked President responses cannot be modified';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_protect_locked_president_response ON public.president_responses;
CREATE TRIGGER trg_protect_locked_president_response BEFORE UPDATE ON public.president_responses
  FOR EACH ROW EXECUTE FUNCTION public.protect_locked_president_response();

CREATE INDEX IF NOT EXISTS idx_president_responses_evaluation ON public.president_responses(evaluation_id);

-- 4. Submission timestamps on evaluations
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS president_step2_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS president_step3_submitted_at timestamptz;

-- 5. President role gains its step permissions
INSERT INTO public.role_permissions (role_code, permission_code) VALUES
  ('PRESIDENT','president.step2'),
  ('PRESIDENT','president.step3'),
  ('PRESIDENT','evaluations.view_step1')
ON CONFLICT DO NOTHING;

-- 6. Seed the official Step 2 and Step 3 templates
INSERT INTO public.president_step_templates (id, step, title, description) VALUES
 ('22222222-2222-4222-8222-222222222222', 2, 'Step Two: Conclusions and Comments',
  'CONFIDENTIAL: NOT TO BE SHOWN TO RATEE. Develop conclusions and comments.'),
 ('33333333-3333-4333-8333-333333333333', 3, 'Step Three: Reviewed by the Reviewing Supervisor',
  'Comments and recommendations of the Reviewing Supervisor / Division Head.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.president_step_items (template_id, position, code, label, help_text, input_type, options, is_required) VALUES
 ('22222222-2222-4222-8222-222222222222', 1, 'S2_OVERALL_EXPLANATION',
  'If the overall rating is excellent or poor, explain why the employee was rated such, or support the rating with specific incidents.',
  '', 'LONG_TEXT', '[]'::jsonb, false),
 ('22222222-2222-4222-8222-222222222222', 2, 'S2_STRENGTHS',
  'Principal strengths of the employee', '', 'LONG_TEXT', '[]'::jsonb, true),
 ('22222222-2222-4222-8222-222222222222', 3, 'S2_WEAKNESSES',
  'Principal weaknesses of the employee', '', 'LONG_TEXT', '[]'::jsonb, true),
 ('22222222-2222-4222-8222-222222222222', 4, 'S2_EFFECTIVENESS',
  'To be more effective on the present job, the employee should:', '', 'LONG_TEXT', '[]'::jsonb, true),
 ('22222222-2222-4222-8222-222222222222', 5, 'S2_DEVELOPMENT_POTENTIAL',
  'The employee''s development potential on the present job is:', '', 'SINGLE_CHOICE',
  '["Very marked growth expected on present job","Considerable improvement expected on present job","Only moderate improvement ahead on present job","Likely to maintain present performance level on present job","Likely to become less effective on present job"]'::jsonb, true),
 ('22222222-2222-4222-8222-222222222222', 6, 'S2_ADVANCEMENT_OUTLOOK',
  'The employee''s advancement outlook is:', '', 'SINGLE_CHOICE',
  '["Promising. Should be able to advance to jobs several levels beyond his present one.","Fairly promising. Should be able to advance to a job in the next higher level.","Present job or jobs within the same grade level represent his advancement.","Employee has difficulty in advancing to his job ceiling.","Employee should be transferred. Not suited to this job; would fit better in some other job."]'::jsonb, true),
 ('22222222-2222-4222-8222-222222222222', 7, 'S2_GROWTH_SUGGESTIONS',
  'Suggest ways to accelerate the employee''s growth and development.', '', 'LONG_TEXT', '[]'::jsonb, true),
 ('22222222-2222-4222-8222-222222222222', 8, 'S2_TRANSFER_INTEREST',
  'Has the employee expressed any interest in assuming another job or transferring to another company / division / department / section?',
  '', 'SINGLE_CHOICE', '["Yes","No","Not aware"]'::jsonb, true),
 ('22222222-2222-4222-8222-222222222222', 9, 'S2_TRANSFER_DETAILS',
  'If yes: what job, where, and is the employee qualified?', 'Leave blank if not applicable.', 'LONG_TEXT', '[]'::jsonb, false),
 ('22222222-2222-4222-8222-222222222222', 10, 'S2_OTHER_COMMENTS',
  'Other comments and recommendations', '', 'LONG_TEXT', '[]'::jsonb, false)
ON CONFLICT (template_id, code) DO NOTHING;

INSERT INTO public.president_step_items (template_id, position, code, label, help_text, input_type, options, is_required) VALUES
 ('33333333-3333-4333-8333-333333333333', 1, 'S3_REVIEW_COMMENTS',
  'Comments and recommendations of the Reviewing Supervisor / Division Head',
  '', 'LONG_TEXT', '[]'::jsonb, true),
 ('33333333-3333-4333-8333-333333333333', 2, 'S3_FINAL_ACTION',
  'Final action recommended', '', 'SINGLE_CHOICE',
  '["Retain in present job","Transfer","Promote","Increase salary","Others (training required, etc.)"]'::jsonb, true),
 ('33333333-3333-4333-8333-333333333333', 3, 'S3_FINAL_ACTION_DETAIL',
  'Details for the recommended final action', 'For example the target position, transfer destination, increase amount or required training.',
  'LONG_TEXT', '[]'::jsonb, false),
 ('33333333-3333-4333-8333-333333333333', 4, 'S3_ADJECTIVE_RATING',
  'Adjective rating for this period', 'Configurable placeholder â€” final scoring is computed in a later phase.', 'TEXT', '[]'::jsonb, false),
 ('33333333-3333-4333-8333-333333333333', 5, 'S3_RECOMMENDED_INCREASE',
  'Recommended increase / bonus', 'Configurable placeholder.', 'TEXT', '[]'::jsonb, false)
ON CONFLICT (template_id, code) DO NOTHING;
-- END 20260826112311_president_review_workflow.sql

-- BEGIN 20260826114232_scoring_notifications_and_finalization.sql
-- Scoring rule status
DO $$ BEGIN
  CREATE TYPE public.scoring_rule_status AS ENUM ('DRAFT','ACTIVE','RETIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.weighting_mode AS ENUM ('EQUAL','WEIGHTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.calculation_status AS ENUM ('PENDING','CALCULATED','INVALID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ scoring_rules ============
CREATE TABLE IF NOT EXISTS public.scoring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  template_id uuid NOT NULL REFERENCES public.evaluation_templates(id),
  status public.scoring_rule_status NOT NULL DEFAULT 'DRAFT',
  factor_weighting public.weighting_mode NOT NULL DEFAULT 'EQUAL',
  required_factor_weight_total numeric(8,3) NOT NULL DEFAULT 100,
  employee_weight numeric(8,3) NOT NULL DEFAULT 0,
  supervisor_weight numeric(8,3) NOT NULL DEFAULT 100,
  rounding_decimals integer NOT NULL DEFAULT 2,
  show_employee_average boolean NOT NULL DEFAULT true,
  show_supervisor_average boolean NOT NULL DEFAULT true,
  show_president_result boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES public.internal_users(id),
  activated_at timestamptz,
  activated_by uuid REFERENCES public.internal_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);

GRANT SELECT ON public.scoring_rules TO authenticated;
GRANT ALL ON public.scoring_rules TO service_role;
ALTER TABLE public.scoring_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scoring rules readable by signed-in users" ON public.scoring_rules;
CREATE POLICY "scoring rules readable by signed-in users" ON public.scoring_rules FOR SELECT TO authenticated
  USING (public.is_account_usable(auth.uid()));

DROP TRIGGER IF EXISTS trg_scoring_rules_updated ON public.scoring_rules;
CREATE TRIGGER trg_scoring_rules_updated BEFORE UPDATE ON public.scoring_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- only one ACTIVE rule per template
CREATE UNIQUE INDEX IF NOT EXISTS scoring_rules_one_active_per_template
  ON public.scoring_rules (template_id) WHERE status = 'ACTIVE';

-- ============ scoring_rule_factor_weights ============
CREATE TABLE IF NOT EXISTS public.scoring_rule_factor_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.scoring_rules(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL REFERENCES public.evaluation_criteria(id),
  weight numeric(8,3) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_id, criterion_id)
);

GRANT SELECT ON public.scoring_rule_factor_weights TO authenticated;
GRANT ALL ON public.scoring_rule_factor_weights TO service_role;
ALTER TABLE public.scoring_rule_factor_weights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "factor weights readable by signed-in users" ON public.scoring_rule_factor_weights;
CREATE POLICY "factor weights readable by signed-in users" ON public.scoring_rule_factor_weights FOR SELECT TO authenticated
  USING (public.is_account_usable(auth.uid()));

-- ============ scoring_rule_bands ============
CREATE TABLE IF NOT EXISTS public.scoring_rule_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.scoring_rules(id) ON DELETE CASCADE,
  label text NOT NULL,
  min_score numeric(8,3) NOT NULL,
  max_score numeric(8,3) NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.scoring_rule_bands TO authenticated;
GRANT ALL ON public.scoring_rule_bands TO service_role;
ALTER TABLE public.scoring_rule_bands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rating bands readable by signed-in users" ON public.scoring_rule_bands;
CREATE POLICY "rating bands readable by signed-in users" ON public.scoring_rule_bands FOR SELECT TO authenticated
  USING (public.is_account_usable(auth.uid()));

-- ============ evaluation_scores ============
CREATE TABLE IF NOT EXISTS public.evaluation_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL UNIQUE REFERENCES public.evaluations(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.scoring_rules(id),
  rule_version integer,
  employee_average numeric(10,4),
  supervisor_average numeric(10,4),
  president_average numeric(10,4),
  final_score numeric(10,4),
  final_rating_label text,
  calculation_status public.calculation_status NOT NULL DEFAULT 'PENDING',
  calculation_notes text NOT NULL DEFAULT '',
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_locked boolean NOT NULL DEFAULT false,
  calculated_at timestamptz,
  calculated_by uuid REFERENCES public.internal_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.evaluation_scores TO authenticated;
GRANT ALL ON public.evaluation_scores TO service_role;
ALTER TABLE public.evaluation_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scores viewable with permission" ON public.evaluation_scores;
CREATE POLICY "scores viewable with permission" ON public.evaluation_scores FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'scores.view')
    OR public.has_permission(auth.uid(), 'president.view')
  );

DROP TRIGGER IF EXISTS trg_evaluation_scores_updated ON public.evaluation_scores;
CREATE TRIGGER trg_evaluation_scores_updated BEFORE UPDATE ON public.evaluation_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ notification_events ============
CREATE TABLE IF NOT EXISTS public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid REFERENCES public.evaluations(id) ON DELETE CASCADE,
  cycle_id uuid REFERENCES public.evaluation_cycles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  audience_permission text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notification_events TO authenticated;
GRANT ALL ON public.notification_events TO service_role;
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications viewable with evaluation access" ON public.notification_events;
CREATE POLICY "notifications viewable with evaluation access" ON public.notification_events FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'evaluations.view_step1')
    OR public.has_permission(auth.uid(), 'president.view')
    OR public.has_permission(auth.uid(), 'cycles.view')
  );

-- ============ finalization columns ============
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS finalized_by uuid REFERENCES public.internal_users(id),
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalization_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS correction_reason text NOT NULL DEFAULT '';

-- ============ permissions ============
INSERT INTO public.permissions (code, module, description) VALUES
  ('scoring.manage', 'Scoring', 'Create, edit and activate scoring rule configurations'),
  ('scores.view', 'Scoring', 'View calculated evaluation scores and final ratings'),
  ('evaluations.correct', 'Evaluations', 'Return a finalized evaluation for authorised correction')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_code, permission_code) VALUES
  ('ADMINISTRATOR', 'scoring.manage'),
  ('ADMINISTRATOR', 'scores.view'),
  ('HR', 'scoring.manage'),
  ('HR', 'scores.view'),
  ('PRESIDENT', 'scores.view'),
  ('PRESIDENT', 'evaluations.correct'),
  ('ADMINISTRATOR', 'evaluations.correct'),
  ('SUPERVISOR', 'scores.view')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_code, permission_code) VALUES
  ('HR', 'reports.view'),
  ('PRESIDENT', 'evaluations.finalize')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_rule_id uuid;
  v_template uuid := '11111111-1111-4111-8111-111111111111';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.evaluation_templates WHERE id = v_template) THEN
    RETURN;
  END IF;

  SELECT id INTO v_rule_id FROM public.scoring_rules
   WHERE template_id = v_template AND name = 'Default Performance Scoring';

  IF v_rule_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.scoring_rules WHERE template_id = v_template AND status = 'ACTIVE') THEN
      RETURN;
    END IF;
    INSERT INTO public.scoring_rules
      (name, version, template_id, status, factor_weighting, required_factor_weight_total,
       employee_weight, supervisor_weight, rounding_decimals, notes, activated_at)
    VALUES
      ('Default Performance Scoring', 1, v_template, 'ACTIVE', 'EQUAL', 100,
       0, 100, 2, 'Seeded default configuration: equal factor weighting on the approved 1-5 scale.', now())
    RETURNING id INTO v_rule_id;
  END IF;

  INSERT INTO public.scoring_rule_factor_weights (rule_id, criterion_id, weight)
  SELECT v_rule_id, c.id, 10
    FROM public.evaluation_criteria c
   WHERE c.template_id = v_template
  ON CONFLICT (rule_id, criterion_id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.scoring_rule_bands WHERE rule_id = v_rule_id) THEN
    INSERT INTO public.scoring_rule_bands (rule_id, label, min_score, max_score, position) VALUES
      (v_rule_id, 'Poor', 1.00, 1.49, 1),
      (v_rule_id, 'Fair', 1.50, 2.49, 2),
      (v_rule_id, 'Satisfactory', 2.50, 3.49, 3),
      (v_rule_id, 'Very Satisfactory', 3.50, 4.49, 4),
      (v_rule_id, 'Outstanding', 4.50, 5.00, 5);
  END IF;
END $$;


-- END 20260826114232_scoring_notifications_and_finalization.sql

-- BEGIN 20260827130000_ai_assistance_fields.sql
-- Advisory AI output belongs to the existing annual evaluation record.
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS ai_analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_source_version integer;

GRANT SELECT ON public.evaluations TO authenticated;
-- END 20260827130000_ai_assistance_fields.sql

-- BEGIN 20260828110100_phase2_stage_records_and_permissions.sql
-- Phase 2: stage records, permissions, and finalized-record protection.
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS supervisor_step2_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS supervisor_step2_strengths text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS supervisor_step2_weaknesses text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS supervisor_step2_development text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS supervisor_step2_advancement text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS supervisor_step2_career_transfer text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS supervisor_step2_recommendations text NOT NULL DEFAULT '';

ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS supervisor_step2_overall_explanation text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS supervisor_step2_effectiveness text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS supervisor_step2_development_potential text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS supervisor_step2_advancement_outlook text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS supervisor_step2_growth_suggestions text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS supervisor_step2_transfer_interest text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS supervisor_step2_transfer_job text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS supervisor_step2_transfer_where text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS supervisor_step2_transfer_qualified text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS supervisor_step2_other_comments text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS supervisor_step2_date date;

ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS correction_stage text;
ALTER TABLE public.evaluations DROP CONSTRAINT IF EXISTS evaluations_correction_stage_check;
ALTER TABLE public.evaluations ADD CONSTRAINT evaluations_correction_stage_check
  CHECK (correction_stage IS NULL OR correction_stage IN (
    'SUPERVISOR_DRAFT', 'REVIEWING_SUPERVISOR_REVIEW', 'PERSONNEL_PROCESSING', 'COMMITTEE_REVIEW'
  ));

CREATE TABLE IF NOT EXISTS public.evaluation_stage_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE RESTRICT,
  stage text NOT NULL CHECK (stage IN ('EMPLOYEE_STEP1','RATER_STEP2','REVIEWING_SUPERVISOR_STEP3','PERSONNEL','COMMITTEE','PRESIDENT')),
  method text NOT NULL CHECK (method IN ('UPLOAD','DRAWN','TYPED')), storage_path text, signature_data text,
  signer_user_id uuid REFERENCES public.internal_users(id) ON DELETE RESTRICT, signed_at timestamptz NOT NULL DEFAULT now(), source_version integer NOT NULL DEFAULT 1,
  UNIQUE (evaluation_id, stage), CHECK ((method = 'UPLOAD' AND storage_path IS NOT NULL AND signature_data IS NULL) OR (method IN ('DRAWN','TYPED') AND signature_data IS NOT NULL AND storage_path IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_stage_signatures_evaluation ON public.evaluation_stage_signatures(evaluation_id);

CREATE TABLE IF NOT EXISTS public.reviewing_supervisor_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), evaluation_id uuid NOT NULL UNIQUE REFERENCES public.evaluations(id) ON DELETE RESTRICT,
  reviewer_user_id uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT, comments text NOT NULL DEFAULT '', recommendations text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('DRAFT','SUBMITTED')) DEFAULT 'DRAFT', submitted_at timestamptz, reviewing_supervisor_date date, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.personnel_processing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), evaluation_id uuid NOT NULL UNIQUE REFERENCES public.evaluations(id) ON DELETE RESTRICT,
  personnel_user_id uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT, present_salary numeric(14,2), last_increase_date date, last_increase_nature text NOT NULL DEFAULT '', last_increase_amount numeric(14,2), total_points numeric(8,2), adjective_rating text NOT NULL DEFAULT '', recommended_increase_bonus text NOT NULL DEFAULT '', status text NOT NULL CHECK (status IN ('DRAFT','SUBMITTED')) DEFAULT 'DRAFT', submitted_at timestamptz, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.committee_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), evaluation_id uuid NOT NULL UNIQUE REFERENCES public.evaluations(id) ON DELETE RESTRICT,
  committee_user_id uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT, final_action text NOT NULL CHECK (final_action IN ('RETAIN','TRANSFER','PROMOTE','INCREASE_SALARY','TRAINING_REQUIRED','OTHER')), action_details text NOT NULL DEFAULT '', recommendation text NOT NULL DEFAULT '', status text NOT NULL CHECK (status IN ('DRAFT','SUBMITTED')) DEFAULT 'DRAFT', submitted_at timestamptz, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.roles(code, name, description) VALUES ('REVIEWING_SUPERVISOR','Reviewing Supervisor / Division Head','Completes Step 3 review'), ('COMMITTEE','Performance Evaluation Committee','Reviews complete files and recommends final action') ON CONFLICT (code) DO NOTHING;
INSERT INTO public.permissions(code, module, description) VALUES ('evaluations.step2','Evaluations','Complete Rater Step 2'), ('evaluations.review_step3','Evaluations','Complete Reviewing Supervisor Step 3'), ('personnel.process','Personnel','Process salary and evaluation result information'), ('committee.review','Committee','Review evaluations and recommend final action'), ('president.approve','President','Approve or return completed evaluation files') ON CONFLICT (code) DO NOTHING;
INSERT INTO public.role_permissions(role_code, permission_code) VALUES ('SUPERVISOR','evaluations.step2'), ('REVIEWING_SUPERVISOR','evaluations.review_step3'), ('HR','personnel.process'), ('COMMITTEE','committee.review'), ('PRESIDENT','president.approve') ON CONFLICT DO NOTHING;

GRANT SELECT ON public.evaluation_stage_signatures, public.reviewing_supervisor_reviews, public.personnel_processing, public.committee_reviews TO authenticated;
GRANT ALL ON public.evaluation_stage_signatures, public.reviewing_supervisor_reviews, public.personnel_processing, public.committee_reviews TO service_role;
ALTER TABLE public.evaluation_stage_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviewing_supervisor_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personnel_processing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committee_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stage signatures viewable with history" ON public.evaluation_stage_signatures FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'evaluations.view_history'));
CREATE POLICY "reviewing records viewable with history" ON public.reviewing_supervisor_reviews FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'evaluations.view_history'));
CREATE POLICY "personnel records viewable with history" ON public.personnel_processing FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'evaluations.view_history'));
CREATE POLICY "committee records viewable with history" ON public.committee_reviews FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'evaluations.view_history'));

CREATE OR REPLACE FUNCTION public.prevent_finalized_phase2_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.evaluations e WHERE e.id = OLD.evaluation_id AND e.is_finalized) THEN RAISE EXCEPTION 'Finalized workflow records cannot be modified'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_stage_signature_finalized ON public.evaluation_stage_signatures;
CREATE TRIGGER trg_stage_signature_finalized BEFORE UPDATE OR DELETE ON public.evaluation_stage_signatures FOR EACH ROW EXECUTE FUNCTION public.prevent_finalized_phase2_mutation();
DROP TRIGGER IF EXISTS trg_reviewing_supervisor_finalized ON public.reviewing_supervisor_reviews;
CREATE TRIGGER trg_reviewing_supervisor_finalized BEFORE UPDATE OR DELETE ON public.reviewing_supervisor_reviews FOR EACH ROW EXECUTE FUNCTION public.prevent_finalized_phase2_mutation();
DROP TRIGGER IF EXISTS trg_personnel_finalized ON public.personnel_processing;
CREATE TRIGGER trg_personnel_finalized BEFORE UPDATE OR DELETE ON public.personnel_processing FOR EACH ROW EXECUTE FUNCTION public.prevent_finalized_phase2_mutation();
DROP TRIGGER IF EXISTS trg_committee_finalized ON public.committee_reviews;
CREATE TRIGGER trg_committee_finalized BEFORE UPDATE OR DELETE ON public.committee_reviews FOR EACH ROW EXECUTE FUNCTION public.prevent_finalized_phase2_mutation();

DROP POLICY IF EXISTS "notifications viewable with evaluation access" ON public.notification_events;
CREATE POLICY "notifications viewable with evaluation access" ON public.notification_events FOR SELECT TO authenticated
USING (
  public.has_permission(auth.uid(), 'evaluations.view_step1')
  OR public.has_permission(auth.uid(), 'president.view')
  OR public.has_permission(auth.uid(), 'cycles.view')
  OR public.has_permission(auth.uid(), 'evaluations.review_step3')
  OR public.has_permission(auth.uid(), 'personnel.process')
  OR public.has_permission(auth.uid(), 'committee.review')
  OR public.has_permission(auth.uid(), 'president.approve')
);

UPDATE public.evaluations
SET status = 'REVIEWING_SUPERVISOR_REVIEW'
WHERE status = 'SUPERVISOR_SUBMITTED';
-- END 20260828110100_phase2_stage_records_and_permissions.sql

