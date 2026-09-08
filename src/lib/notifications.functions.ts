import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AppNotification = {
  id: string;
  eventId: string;
  eventType: string;
  title: string;
  message: string;
  occurredAt: string;
  readAt: string | null;
  evaluationId: string | null;
  targetPath: string | null;
};

function messageFor(eventType: string): string {
  const messages: Record<string, string> = {
    STEP1_SUBMITTED: "A performance evaluation requires supervisor review.",
    EMPLOYEE_STEP1_SUBMITTED: "A performance evaluation requires supervisor review.",
    SUPERVISOR_SUBMITTED: "A performance evaluation requires reviewing supervisor action.",
    PERSONNEL_SUBMITTED: "A performance evaluation requires Committee review.",
    COMMITTEE_SUBMITTED: "A performance evaluation requires President action.",
    SUPERVISOR_SUBMITTED_TO_PRESIDENT:
      "A performance evaluation requires reviewing supervisor action.",
    PERSONNEL_SUBMITTED: "A performance evaluation requires Committee review.",
    COMMITTEE_SUBMITTED: "A performance evaluation requires President action.",
    PRESIDENT_RETURNED: "A performance evaluation was returned for correction.",
    EVALUATION_FINALIZED: "A performance evaluation has been finalized.",
    EVALUATION_FINALIZED_FOR_EMPLOYEE: "Your performance evaluation has been finalized.",
    DEVELOPMENT_RECORD_CREATED: "A development record is ready for HR tracking.",
    TRAINING_RECOMMENDATION_CREATED: "A training recommendation is ready for review.",
    TRAINING_REQUIREMENT_CREATED: "An official training requirement is ready for review.",
    SUCCESSION_PROFILE_UPDATED: "A Career and Succession Profile is ready for review.",
    RECOGNITION_CANDIDATE_CREATED: "A recognition candidate is ready for review.",
    RECOGNITION_APPROVED: "A recognition candidate was approved.",
  };
  return messages[eventType] ?? "A workflow action requires your attention.";
}

function targetFor(eventType: string, evaluationId: string | null): string | null {
  if (!evaluationId) return null;
  if (eventType === "EMPLOYEE_STEP1_SUBMITTED" || eventType === "STEP1_SUBMITTED")
    return `/supervisor/evaluations/${evaluationId}`;
  if (eventType.includes("SUPERVISOR")) return `/reviewing-supervisor/evaluations/${evaluationId}`;
  if (eventType.includes("PERSONNEL")) return `/personnel/evaluations/${evaluationId}`;
  if (eventType.includes("COMMITTEE")) return `/committee/evaluations/${evaluationId}`;
  if (eventType.includes("PRESIDENT") || eventType === "EVALUATION_FINALIZED")
    return `/president/evaluations/${evaluationId}`;
  return `/hr/evaluation-history/${evaluationId}`;
}

function mapNotification(row: Record<string, unknown>): AppNotification {
  const event = row["notification_events"] as {
    id?: string;
    event_type?: string;
    title?: string;
    occurred_at?: string;
    evaluation_id?: string | null;
  } | null;
  const eventType = event?.event_type ?? "WORKFLOW_UPDATE";
  const evaluationId = event?.evaluation_id ?? null;
  return {
    id: String(row["id"]),
    eventId: String(event?.id ?? row["notification_event_id"]),
    eventType,
    title: event?.title ?? "Workflow notification",
    message: messageFor(eventType),
    occurredAt: String(event?.occurred_at ?? row["created_at"]),
    readAt: (row["read_at"] as string | null) ?? null,
    evaluationId,
    targetPath: targetFor(eventType, evaluationId),
  };
}

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).default(50) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getAdmin } = await import("./server-core.server");
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("user_notifications")
      .select(
        "id, notification_event_id, read_at, created_at, notification_events(id, event_type, title, occurred_at, evaluation_id)",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((row) => mapNotification(row as unknown as Record<string, unknown>));
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin } = await import("./server-core.server");
    const admin = await getAdmin();
    const { error } = await admin
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getAdmin } = await import("./server-core.server");
    const admin = await getAdmin();
    const { error } = await admin
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
