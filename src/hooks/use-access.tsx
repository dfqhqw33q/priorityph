import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getMyAccess, type AccessProfile } from "@/lib/access.functions";
import type { Permission } from "@/lib/domain";

export function useAccess() {
  const fetchAccess = useServerFn(getMyAccess);
  const query = useQuery<AccessProfile | null>({
    queryKey: ["access"],
    queryFn: () => fetchAccess(),
    staleTime: 60_000,
    retry: false,
  });

  const access = query.data ?? null;
  const can = (permission: Permission) => access?.permissions.includes(permission) ?? false;
  const canAny = (permissions: Permission[]) => permissions.some(can);

  return { access, can, canAny, isLoading: query.isLoading, refetch: query.refetch };
}
