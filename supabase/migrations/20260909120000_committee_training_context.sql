ALTER TABLE public.training_records
  ADD COLUMN IF NOT EXISTS committee_recommendation text NOT NULL DEFAULT '';