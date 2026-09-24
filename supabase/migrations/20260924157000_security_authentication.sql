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

ALTER TABLE public.security_elevations
  ADD COLUMN IF NOT EXISTS action_key text NOT NULL DEFAULT 'legacy';

CREATE INDEX IF NOT EXISTS idx_security_elevations_action
  ON public.security_elevations(user_id, session_id, action_key, expires_at);

CREATE TABLE IF NOT EXISTS public.security_sessions (
  user_id uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_security_sessions_expiry
  ON public.security_sessions(expires_at);

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

ALTER TABLE public.security_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_sessions, public.rate_limit_buckets FROM PUBLIC, authenticated;
GRANT ALL ON public.security_sessions, public.rate_limit_buckets TO service_role;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _bucket_key text,
  _window_seconds integer,
  _max_attempts integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_attempts integer;
BEGIN
  INSERT INTO public.rate_limit_buckets(bucket_key, window_started_at, attempts)
  VALUES (_bucket_key, now(), 1)
  ON CONFLICT (bucket_key) DO UPDATE
  SET
    window_started_at = CASE
      WHEN public.rate_limit_buckets.window_started_at <= now() - make_interval(secs => _window_seconds)
      THEN now()
      ELSE public.rate_limit_buckets.window_started_at
    END,
    attempts = CASE
      WHEN public.rate_limit_buckets.window_started_at <= now() - make_interval(secs => _window_seconds)
      THEN 1
      ELSE public.rate_limit_buckets.attempts + 1
    END
  RETURNING attempts INTO current_attempts;

  RETURN current_attempts <= _max_attempts;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_security_session(
  _user_id uuid,
  _session_id text,
  _timeout_seconds integer DEFAULT 180
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.security_sessions(user_id, session_id, last_activity_at, expires_at)
  VALUES (_user_id, _session_id, now(), now() + make_interval(secs => _timeout_seconds))
  ON CONFLICT (user_id, session_id) DO UPDATE
  SET last_activity_at = now(), expires_at = now() + make_interval(secs => _timeout_seconds);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.session_is_active(
  _user_id uuid,
  _session_id text,
  _timeout_seconds integer DEFAULT 180
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.security_sessions
    WHERE user_id = _user_id
      AND session_id = _session_id
      AND expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.consume_step_up(
  _user_id uuid,
  _session_id text,
  _action_key text,
  _fresh boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  elevation public.security_elevations;
BEGIN
  SELECT * INTO elevation
  FROM public.security_elevations
  WHERE user_id = _user_id
    AND session_id = _session_id
    AND action_key = _action_key
    AND expires_at > now()
  FOR UPDATE;

  IF elevation.user_id IS NULL THEN RETURN false; END IF;
  IF _fresh THEN
    DELETE FROM public.security_elevations
    WHERE user_id = _user_id AND session_id = _session_id AND action_key = _action_key;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_security_session(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.session_is_active(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_step_up(uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.touch_security_session(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.session_is_active(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_step_up(uuid, text, text, boolean) TO service_role;

CREATE TABLE IF NOT EXISTS public.security_idempotency_requests (
  request_key uuid PRIMARY KEY,
  action text NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE CASCADE,
  resource_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_idempotency_actor_action
  ON public.security_idempotency_requests(actor_user_id, action, created_at DESC);

ALTER TABLE public.security_idempotency_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_idempotency_requests FROM PUBLIC, authenticated;
GRANT ALL ON public.security_idempotency_requests TO service_role;

CREATE TABLE IF NOT EXISTS public.system_settings (
  id text PRIMARY KEY,
  email_otp_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.internal_users(id)
);

INSERT INTO public.system_settings (id, email_otp_enabled)
VALUES ('auth', true)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_system_settings_updated ON public.system_settings;
CREATE TRIGGER trg_system_settings_updated
BEFORE UPDATE ON public.system_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_settings FROM anon, authenticated;
GRANT ALL ON public.system_settings TO service_role;
