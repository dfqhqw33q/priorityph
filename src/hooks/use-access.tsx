import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { getMyAccess, type AccessProfile } from "@/lib/access.functions";
import type { Permission } from "@/lib/domain";

type AuthSnapshot = { userId: string | null; ready: boolean };

let authSnapshot: AuthSnapshot = { userId: null, ready: false };
let authSubscriptionStarted = false;
const authSubscribers = new Set<() => void>();

export function getAuthSession() {
  return supabase.auth.getSession();
}

function publishAuthSnapshot(next: AuthSnapshot) {
  if (next.userId === authSnapshot.userId && next.ready === authSnapshot.ready) return;
  authSnapshot = next;
  authSubscribers.forEach((subscriber) => subscriber());
}

function ensureAuthSubscription() {
  if (authSubscriptionStarted) return;
  authSubscriptionStarted = true;
  void getAuthSession().then(({ data }) => {
    publishAuthSnapshot({ userId: data.session?.user.id ?? null, ready: true });
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    publishAuthSnapshot({ userId: session?.user.id ?? null, ready: true });
  });
}

function subscribeToAuth(subscriber: () => void) {
  ensureAuthSubscription();
  authSubscribers.add(subscriber);
  return () => authSubscribers.delete(subscriber);
}

function getAuthSnapshot() {
  return authSnapshot;
}

export function useAccess() {
  const { userId, ready: authReady } = useSyncExternalStore(
    subscribeToAuth,
    getAuthSnapshot,
    getAuthSnapshot,
  );
  const fetchAccess = useServerFn(getMyAccess);

  const query = useQuery<AccessProfile | null>({
    queryKey: ["access", userId],
    queryFn: () => fetchAccess(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: authReady && userId !== null,
  });

  const access = query.data ?? null;
  const can = (permission: Permission) => access?.permissions.includes(permission) ?? false;
  const canAny = (permissions: Permission[]) => permissions.some(can);

  return {
    access,
    can,
    canAny,
    isLoading: !authReady || query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  };
}
