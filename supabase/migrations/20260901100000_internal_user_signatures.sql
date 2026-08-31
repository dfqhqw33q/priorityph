-- Add signature support for all internal users (Supervisor, Reviewing Supervisor, HR, Committee, President)
-- Forward-only migration. Do not edit previously applied migrations.

CREATE TABLE IF NOT EXISTS public.internal_user_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('RATER_STEP2', 'REVIEWING_SUPERVISOR_STEP3', 'HR_REVIEW', 'COMMITTEE_REVIEW', 'PRESIDENT_STEP2', 'PRESIDENT_STEP3')),
  method text NOT NULL CHECK (method IN ('UPLOAD', 'DRAWN')),
  storage_path text,
  signature_data text,
  content_type text,
  file_size integer,
  signed_at timestamptz NOT NULL DEFAULT now(),
  source_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((method = 'UPLOAD' AND storage_path IS NOT NULL AND signature_data IS NULL)
      OR (method = 'DRAWN' AND signature_data IS NOT NULL AND storage_path IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_internal_user_signatures_evaluation 
  ON public.internal_user_signatures(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_internal_user_signatures_user 
  ON public.internal_user_signatures(user_id);
CREATE INDEX IF NOT EXISTS idx_internal_user_signatures_stage 
  ON public.internal_user_signatures(evaluation_id, stage);
CREATE UNIQUE INDEX IF NOT EXISTS uq_internal_user_signatures_eval_user_stage
  ON public.internal_user_signatures(evaluation_id, user_id, stage);

-- Add RLS policies for internal user signatures
ALTER TABLE public.internal_user_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view signatures for evaluations they have access to"
  ON public.internal_user_signatures
  FOR SELECT
  USING (
    public.has_permission(auth.uid(), 'evaluations.view_history') OR
    public.has_permission(auth.uid(), 'president.view') OR
    (user_id = auth.uid())
  );

CREATE POLICY "Users can insert their own signatures"
  ON public.internal_user_signatures
  FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.has_permission(auth.uid(), 'evaluations.step2'));

CREATE POLICY "Users can update their own signatures"
  ON public.internal_user_signatures
  FOR UPDATE
  USING (user_id = auth.uid() AND public.has_permission(auth.uid(), 'evaluations.step2'))
  WITH CHECK (user_id = auth.uid() AND public.has_permission(auth.uid(), 'evaluations.step2'));
