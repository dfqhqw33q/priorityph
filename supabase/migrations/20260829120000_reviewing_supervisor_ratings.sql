-- Add an independent rating set for the Reviewing Supervisor / Division Head.
ALTER TYPE public.evaluator_type ADD VALUE IF NOT EXISTS 'REVIEWING_SUPERVISOR';
ALTER TABLE public.reviewing_supervisor_reviews
  ADD COLUMN IF NOT EXISTS reviewing_supervisor_date date;