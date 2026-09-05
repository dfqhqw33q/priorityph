-- Correlation IDs supplied by retry-safe AI actions must be unique.
-- Existing audit rows use generated UUID correlation IDs, so this partial
-- index preserves nullable legacy rows while protecting action retries.
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_logs_correlation_id_unique
  ON public.audit_logs (correlation_id)
  WHERE correlation_id IS NOT NULL;