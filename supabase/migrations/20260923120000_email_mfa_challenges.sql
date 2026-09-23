CREATE TABLE IF NOT EXISTS public.email_mfa_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  otp_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_email_mfa_challenges_expiry
  ON public.email_mfa_challenges(expires_at);

ALTER TABLE public.email_mfa_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_mfa_challenges FROM anon, authenticated;
GRANT ALL ON public.email_mfa_challenges TO service_role;

