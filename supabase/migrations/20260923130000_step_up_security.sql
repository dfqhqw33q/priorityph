CREATE TABLE IF NOT EXISTS public.security_elevations (
  user_id uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  elevated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_security_elevations_expiry
  ON public.security_elevations(expires_at);

ALTER TABLE public.security_elevations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_elevations FROM PUBLIC, authenticated;
GRANT ALL ON public.security_elevations TO service_role;

CREATE OR REPLACE FUNCTION public.clear_expired_security_elevations()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.security_elevations WHERE expires_at <= now();
$$;

REVOKE ALL ON FUNCTION public.clear_expired_security_elevations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_expired_security_elevations() TO service_role;
