-- Aggregate report summary in PostgreSQL instead of transferring every score row.
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
