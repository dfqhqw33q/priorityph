-- Normalize records created by the retired Supervisor-to-President workflow.
UPDATE public.evaluations
SET status = 'REVIEWING_SUPERVISOR_REVIEW'
WHERE status = 'SUPERVISOR_SUBMITTED';