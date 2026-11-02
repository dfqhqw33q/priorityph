import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdmin } from "@/lib/server-core.server";

export type MyPerformanceNotification = {
  id: string;
  title: string;
  message: string;
  eventType: string;
  createdAt: string;
  readAt: string | null;
  evaluationId: string | null;
  href: string | null;
};

export const getMyPerformanceNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyPerformanceNotification[]> => {
    const admin = await getAdmin();
    const [{ data: notifications, error }, { data: role, error: roleError }] = await Promise.all([
      admin
        .from("performance_notifications")
        .select("id, title, message, event_type, created_at, read_at, employee_evaluation_id")
        .eq("recipient_user_id", context.userId)
        .order("created_at", { ascending: false }),
      admin.from("user_roles").select("role").eq("user_id", context.userId).maybeSingle(),
    ]);
    if (error) throw new Error(`Could not load notifications: ${error.message}`);
    if (roleError) throw new Error(`Could not determine notification route: ${roleError.message}`);

    return (notifications ?? []).map((notification) => ({
      id: notification.id,
      title: notification.title,
      message: notification.message,
      eventType: notification.event_type,
      createdAt: notification.created_at,
      readAt: notification.read_at,
      evaluationId: notification.employee_evaluation_id,
      href: notification.employee_evaluation_id
        ? notificationHref(
            role?.role ?? "",
            notification.event_type,
            notification.employee_evaluation_id,
          )
        : null,
    }));
  });

export const markMyPerformanceNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ notificationId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const admin = await getAdmin();
    const { data: updated, error } = await admin
      .from("performance_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.notificationId)
      .eq("recipient_user_id", context.userId)
      .is("read_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Could not mark notification as read: ${error.message}`);
    if (!updated) {
      const { data: existing, error: existingError } = await admin
        .from("performance_notifications")
        .select("id")
        .eq("id", data.notificationId)
        .eq("recipient_user_id", context.userId)
        .maybeSingle();
      if (existingError)
        throw new Error(`Could not verify notification ownership: ${existingError.message}`);
      if (!existing) throw new Error("The requested notification could not be found.");
    }
    return { ok: true };
  });

function notificationHref(role: string, eventType: string, evaluationId: string): string {
  const encodedId = encodeURIComponent(evaluationId);
  if (role === "EMPLOYEE") {
    return ["EVALUATION_RETURNED", "HR_RETURNED"].includes(eventType)
      ? "/performance/self-evaluation"
      : `/performance/results/${encodedId}`;
  }
  if (role === "SUPERVISOR") return `/team/review/${encodedId}`;
  if (role === "DEPARTMENT_HEAD") return `/department/review/${encodedId}`;
  if (role === "HR") return `/hr/review/${encodedId}`;
  return "/notifications";
}
