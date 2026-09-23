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
