-- Targeted indexes for the existing evaluation queues, history views and audit feeds.
-- These indexes do not change workflow behavior or access rules.
CREATE INDEX IF NOT EXISTS idx_evaluations_queue_status_submitted
  ON public.evaluations(status, employee_submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_evaluations_cycle_status
  ON public.evaluations(cycle_id, status);

CREATE INDEX IF NOT EXISTS idx_evaluations_employee_status_finalized
  ON public.evaluations(employee_id, status, finalized_at DESC);

CREATE INDEX IF NOT EXISTS idx_ratings_evaluation_type_criterion
  ON public.evaluation_ratings(evaluation_id, evaluator_type, criterion_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_module_occurred
  ON public.audit_logs(module, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_events_permission_occurred
  ON public.notification_events(audience_permission, occurred_at DESC);
