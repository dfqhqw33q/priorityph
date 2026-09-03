import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { getMyAccess, type AccessProfile } from "@/lib/access.functions";
import type { Permission } from "@/lib/domain";

export function useAccess() {
  const fetchAccess = useServerFn(getMyAccess);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUserId(data.session?.user.id ?? null);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUserId(session?.user.id ?? null);
      setAuthReady(true);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const query = useQuery<AccessProfile | null>({
    queryKey: ["access", userId],
    queryFn: () => fetchAccess(),
    staleTime: 60_000,
    retry: 2,
    enabled: authReady && userId !== null,
  });

  const access = query.data ?? null;
  const can = (permission: Permission) => access?.permissions.includes(permission) ?? false;
  const canAny = (permissions: Permission[]) => permissions.some(can);

  return {
    access,
    can,
    canAny,
    isLoading: !authReady || query.isPending || query.isFetching,
    isError: query.isError,
    refetch: query.refetch,
  };
}
