-- Phase 2: stage records, permissions, and finalized-record protection.
-- Forward-only migration. Do not edit previously applied migrations.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'REVIEWING_SUPERVISOR';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'COMMITTEE';
ALTER TYPE public.evaluation_status ADD VALUE IF NOT EXISTS 'REVIEWING_SUPERVISOR_REVIEW';
ALTER TYPE public.evaluation_status ADD VALUE IF NOT EXISTS 'PERSONNEL_PROCESSING';
ALTER TYPE public.evaluation_status ADD VALUE IF NOT EXISTS 'COMMITTEE_REVIEW';
ALTER TYPE public.evaluation_status ADD VALUE IF NOT EXISTS 'PRESIDENT_APPROVAL';
ALTER TYPE public.evaluation_status ADD VALUE IF NOT EXISTS 'RESUBMITTED';
ALTER TYPE public.evaluator_type ADD VALUE IF NOT EXISTS 'REVIEWING_SUPERVISOR';

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
