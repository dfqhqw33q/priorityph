-- Phase 2 corrective migration: allow each stage owner to read workflow notifications.
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