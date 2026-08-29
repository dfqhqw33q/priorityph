-- Store the complete original Supervisor Step 2 form.
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