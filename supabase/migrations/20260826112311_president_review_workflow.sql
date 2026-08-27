-- 1. New workflow status
ALTER TYPE public.evaluation_status ADD VALUE IF NOT EXISTS 'PRESIDENT_SUBMITTED';

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
  'Adjective rating for this period', 'Configurable placeholder — final scoring is computed in a later phase.', 'TEXT', '[]'::jsonb, false),
 ('33333333-3333-4333-8333-333333333333', 5, 'S3_RECOMMENDED_INCREASE',
  'Recommended increase / bonus', 'Configurable placeholder.', 'TEXT', '[]'::jsonb, false)
ON CONFLICT (template_id, code) DO NOTHING;
