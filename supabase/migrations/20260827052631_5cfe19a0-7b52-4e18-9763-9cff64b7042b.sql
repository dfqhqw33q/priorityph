ALTER TYPE public.evaluation_status ADD VALUE IF NOT EXISTS 'READY_FOR_FINALIZATION';
ALTER TYPE public.evaluation_status ADD VALUE IF NOT EXISTS 'RETURNED_FOR_CORRECTION';

DO $$ BEGIN
  CREATE TYPE public.scoring_rule_status AS ENUM ('DRAFT','ACTIVE','RETIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.weighting_mode AS ENUM ('EQUAL','WEIGHTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.calculation_status AS ENUM ('PENDING','CALCULATED','INVALID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

CREATE UNIQUE INDEX IF NOT EXISTS scoring_rules_one_active_per_template
  ON public.scoring_rules (template_id) WHERE status = 'ACTIVE';

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

ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS finalized_by uuid REFERENCES public.internal_users(id),
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalization_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS correction_reason text NOT NULL DEFAULT '';

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