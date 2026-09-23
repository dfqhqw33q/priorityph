import { useSyncExternalStore } from "react";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { getMyAccess, recordLoginEvent, type AccessProfile } from "@/lib/access.functions";
import type { Permission } from "@/lib/domain";

type AuthSnapshot = { userId: string | null; ready: boolean };

let authSnapshot: AuthSnapshot = { userId: null, ready: false };
let authSubscriptionStarted = false;
const authSubscribers = new Set<() => void>();
const INACTIVITY_TIMEOUT_MS = 3 * 60_000;
const TIMEOUT_WARNING_MS = 30_000;
const LAST_ACTIVITY_KEY = "phl-last-activity";
const STEP_UP_THRESHOLD_MS = 45_000;
let inactivityCleanup: (() => void) | null = null;
let inactivityUserId: string | null = null;
type SecuritySnapshot = { stepUpRequired: boolean; elevatedUntil: number | null };
let securitySnapshot: SecuritySnapshot = { stepUpRequired: false, elevatedUntil: null };
const securitySubscribers = new Set<() => void>();

function publishSecuritySnapshot(next: SecuritySnapshot) {
  if (
    next.stepUpRequired === securitySnapshot.stepUpRequired &&
    next.elevatedUntil === securitySnapshot.elevatedUntil
  )
    return;
  securitySnapshot = next;
  securitySubscribers.forEach((subscriber) => subscriber());
}

export function markStepUpSatisfied(expiresInSeconds: number) {
  publishSecuritySnapshot({
    stepUpRequired: false,
    elevatedUntil: Date.now() + expiresInSeconds * 1000,
  });
}

export function clearSecurityState() {
  publishSecuritySnapshot({ stepUpRequired: false, elevatedUntil: null });
}

function subscribeToSecurity(subscriber: () => void) {
  securitySubscribers.add(subscriber);
  return () => securitySubscribers.delete(subscriber);
}

function getSecuritySnapshot() {
  return securitySnapshot;
}

export function useSecurityStatus() {
  return useSyncExternalStore(subscribeToSecurity, getSecuritySnapshot, getSecuritySnapshot);
}

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

function startInactivityTimeout(
  userId: string,
  queryClient: ReturnType<typeof useQueryClient>,
  recordEvent: (input: { data: { event: "SESSION_EXPIRED" } }) => Promise<unknown>,
) {
  if (typeof window === "undefined") return;
  if (inactivityCleanup) inactivityCleanup();
  inactivityUserId = userId;
  let warningShown = false;
  let signingOut = false;
  const markActivity = () => {
    window.sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    warningShown = false;
    publishSecuritySnapshot({
      stepUpRequired: securitySnapshot.stepUpRequired,
      elevatedUntil: securitySnapshot.elevatedUntil,
    });
  };
  const activityEvents = [
    "mousedown",
    "keydown",
    "touchstart",
    "scroll",
    "pointerdown",
    "popstate",
    "hashchange",
  ];
  const onActivity = () => markActivity();
  const lastActivity = Number(window.sessionStorage.getItem(LAST_ACTIVITY_KEY));
  if (!Number.isFinite(lastActivity) || Date.now() - lastActivity >= INACTIVITY_TIMEOUT_MS)
    markActivity();
  activityEvents.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));
  const timer = window.setInterval(() => {
    const inactiveFor = Date.now() - Number(window.sessionStorage.getItem(LAST_ACTIVITY_KEY));
    if (inactiveFor >= STEP_UP_THRESHOLD_MS && inactiveFor < INACTIVITY_TIMEOUT_MS) {
      publishSecuritySnapshot({
        stepUpRequired: true,
        elevatedUntil: securitySnapshot.elevatedUntil,
      });
    }
    if (inactiveFor >= INACTIVITY_TIMEOUT_MS && !signingOut) {
      signingOut = true;
      void recordEvent({ data: { event: "SESSION_EXPIRED" } }).catch(() => undefined);
      void supabase.auth.signOut().finally(() => {
        queryClient.removeQueries({ queryKey: ["access", userId] });
        window.sessionStorage.removeItem(LAST_ACTIVITY_KEY);
        clearSecurityState();
        window.location.assign("/login");
      });
    } else if (inactiveFor >= INACTIVITY_TIMEOUT_MS - TIMEOUT_WARNING_MS && !warningShown) {
      warningShown = true;
      toast.warning("You will be signed out in 30 seconds due to inactivity.");
    }
  }, 1_000);
  inactivityCleanup = () => {
    window.clearInterval(timer);
    activityEvents.forEach((event) => window.removeEventListener(event, onActivity));
    inactivityCleanup = null;
    inactivityUserId = null;
  };
}

export function useAccess() {
  const { userId, ready: authReady } = useSyncExternalStore(
    subscribeToAuth,
    getAuthSnapshot,
    getAuthSnapshot,
  );
  const fetchAccess = useServerFn(getMyAccess);
  const recordEvent = useServerFn(recordLoginEvent);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (authReady && userId && inactivityUserId !== userId) {
      startInactivityTimeout(userId, queryClient, recordEvent);
    }
    if (authReady && !userId && inactivityCleanup) inactivityCleanup();
    if (authReady && !userId) clearSecurityState();
    return () => undefined;
  }, [authReady, queryClient, recordEvent, userId]);

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
