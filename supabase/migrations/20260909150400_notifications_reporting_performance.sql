CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_event_id uuid NOT NULL REFERENCES public.notification_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
  ON public.user_notifications(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.fan_out_notification_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_notifications(notification_event_id, user_id)
  SELECT NEW.id, u.id
  FROM public.internal_users u
  WHERE u.is_active AND NOT u.is_locked
    AND public.has_permission(u.id, NEW.audience_permission)
  ON CONFLICT (notification_event_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fan_out_notification_event ON public.notification_events;
CREATE TRIGGER trg_fan_out_notification_event
AFTER INSERT ON public.notification_events
FOR EACH ROW EXECUTE FUNCTION public.fan_out_notification_event();

GRANT SELECT, UPDATE ON public.user_notifications TO authenticated;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications" ON public.user_notifications
FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update their own notifications" ON public.user_notifications
FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

INSERT INTO public.user_notifications(notification_event_id, user_id)
SELECT ne.id, u.id
FROM public.notification_events ne
JOIN public.internal_users u
  ON u.is_active AND NOT u.is_locked AND public.has_permission(u.id, ne.audience_permission)
ON CONFLICT (notification_event_id, user_id) DO NOTHING;
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
CREATE OR REPLACE FUNCTION public.get_evaluation_score_summary()
RETURNS TABLE(final_rating_label text, score_count bigint, score_total numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(final_rating_label, 'Unrated') AS final_rating_label,
    COUNT(*)::bigint AS score_count,
    COALESCE(SUM(final_score), 0)::numeric AS score_total
  FROM public.evaluation_scores
  WHERE calculation_status = 'CALCULATED'
  GROUP BY final_rating_label;
$$;

REVOKE ALL ON FUNCTION public.get_evaluation_score_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_evaluation_score_summary() TO service_role;
