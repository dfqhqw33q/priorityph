-- Digital 201 File access and history query indexes.
INSERT INTO public.permissions(code, module, description)
VALUES ('evaluations.view_201', 'Digital 201 File', 'View authorized employee Digital 201 Files')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions(role_code, permission_code)
VALUES ('HR', 'evaluations.view_201'), ('PRESIDENT', 'evaluations.view_201')
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_evaluations_employee_created
  ON public.evaluations(employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ratings_evaluation_criterion_type
  ON public.evaluation_ratings(evaluation_id, criterion_id, evaluator_type);

CREATE INDEX IF NOT EXISTS idx_audit_employee_occurred
  ON public.audit_logs(employee_id, occurred_at DESC)
  WHERE employee_id IS NOT NULL;
