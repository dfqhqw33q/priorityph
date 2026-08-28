-- Phase 2 corrective migration: persist the stage selected for re-review.
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS correction_stage text;

ALTER TABLE public.evaluations
  DROP CONSTRAINT IF EXISTS evaluations_correction_stage_check;

ALTER TABLE public.evaluations
  ADD CONSTRAINT evaluations_correction_stage_check
  CHECK (correction_stage IS NULL OR correction_stage IN (
    'SUPERVISOR_DRAFT',
    'REVIEWING_SUPERVISOR_REVIEW',
    'PERSONNEL_PROCESSING',
    'COMMITTEE_REVIEW'
  ));