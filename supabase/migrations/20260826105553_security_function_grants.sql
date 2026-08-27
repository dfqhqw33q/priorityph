REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_account_usable(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.count_active_administrators() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_last_admin_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_last_admin_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_finalized_evaluation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_locked_rating() FROM PUBLIC, anon, authenticated;

-- Required by the row-level security policies, which evaluate as the signed-in role.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_account_usable(uuid) TO authenticated;