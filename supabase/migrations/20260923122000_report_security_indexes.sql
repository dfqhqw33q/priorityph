CREATE INDEX IF NOT EXISTS idx_audit_logs_evaluation_id
  ON public.audit_logs(evaluation_id);

CREATE INDEX IF NOT EXISTS idx_notification_events_evaluation_id
  ON public.notification_events(evaluation_id);

DROP POLICY IF EXISTS "notifications viewable with evaluation access" ON public.notification_events;
CREATE POLICY "notifications viewable through user notification ownership"
ON public.notification_events
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_notifications un
    WHERE un.notification_event_id = notification_events.id
      AND un.user_id = auth.uid()
  )
);