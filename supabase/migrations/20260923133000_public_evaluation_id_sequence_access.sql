-- Evaluation inserts allocate their public ID through a trigger. Keep the
-- sequence table private while allowing the trusted server role to access it.
ALTER TABLE public.evaluation_id_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evaluation id sequence service access"
  ON public.evaluation_id_sequences;
CREATE POLICY "evaluation id sequence service access"
  ON public.evaluation_id_sequences
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.evaluation_id_sequences TO service_role;
