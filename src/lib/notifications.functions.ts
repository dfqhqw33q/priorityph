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
    STEP1_SUBMITTED:
      "A new performance evaluation has been submitted to you for review and assessment.",
    EMPLOYEE_STEP1_SUBMITTED:
      "Your performance evaluation has been submitted successfully and is now being reviewed.",
    RATER_STEP2_SUBMITTED:
      "A performance evaluation has been submitted to you for review and assessment.",
    REVIEWING_SUPERVISOR_SUBMITTED:
      "A completed performance evaluation is ready for Personnel processing.",
    PERSONNEL_SUBMITTED:
      "A performance evaluation is ready for your Committee review and recommendation.",
    COMMITTEE_SUBMITTED:
      "A performance evaluation is ready for your review and final approval.",
    SUPERVISOR_SUBMITTED_TO_PRESIDENT:
      "A performance evaluation has been submitted to you for review and assessment.",
    PRESIDENT_RETURNED:
      "A performance evaluation has been returned for further review and correction.",
    EVALUATION_RETURNED:
      "A performance evaluation has been returned to you for correction and resubmission.",
    EVALUATION_FINALIZED: "Your performance evaluation has been finalized and is now complete.",
    EVALUATION_FINALIZED_FOR_EMPLOYEE:
      "Your performance evaluation has been finalized and is now complete.",
    DEVELOPMENT_RECORD_CREATED:
      "A new employee development record has been created from a finalized performance evaluation.",
    TRAINING_RECOMMENDATION_CREATED: "A training recommendation is available for review.",
    TRAINING_REQUIREMENT_CREATED:
      "A training requirement has been identified for an employee and is ready for review.",
    SUCCESSION_PROFILE_UPDATED:
      "A Career & Succession profile has been updated from a finalized performance evaluation.",
    RECOGNITION_CANDIDATE_CREATED:
      "An employee has been identified as a recognition candidate and is ready for review.",
    RECOGNITION_APPROVED: "An employee recognition has been approved successfully.",
  };
  return messages[eventType] ?? "A workflow action requires your attention.";
}

function titleFor(eventType: string): string | null {
  const titles: Record<string, string> = {
    STEP1_SUBMITTED: "New Evaluation Submitted",
    EMPLOYEE_STEP1_SUBMITTED: "Evaluation Submitted",
    RATER_STEP2_SUBMITTED: "New Evaluation Submitted",
    REVIEWING_SUPERVISOR_SUBMITTED: "Evaluation Ready for Processing",
    PERSONNEL_SUBMITTED: "Evaluation Ready for Review",
    COMMITTEE_SUBMITTED: "Evaluation Awaiting Approval",
    SUPERVISOR_SUBMITTED_TO_PRESIDENT: "New Evaluation Submitted",
    PRESIDENT_RETURNED: "Evaluation Returned",
    EVALUATION_RETURNED: "Evaluation Returned",
    EVALUATION_FINALIZED: "Performance Evaluation Finalized",
    EVALUATION_FINALIZED_FOR_EMPLOYEE: "Performance Evaluation Finalized",
    DEVELOPMENT_RECORD_CREATED: "Development Record Created",
    TRAINING_RECOMMENDATION_CREATED: "Training Recommendation",
    TRAINING_REQUIREMENT_CREATED: "Training Required",
    SUCCESSION_PROFILE_UPDATED: "Career & Succession Update",
    RECOGNITION_CANDIDATE_CREATED: "Recognition Candidate",
    RECOGNITION_APPROVED: "Recognition Approved",
  };
  return titles[eventType] ?? null;
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
    title: titleFor(eventType) ?? event?.title ?? "Workflow notification",
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
    z
      .object({
        limit: z.number().int().min(1).max(100).default(50),
        notificationId: z.string().uuid().nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getAdmin } = await import("./server-core.server");
    const admin = await getAdmin();
    let query = admin
      .from("user_notifications")
      .select(
        "id, notification_event_id, read_at, created_at, notification_events(id, event_type, title, occurred_at, evaluation_id)",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (data.notificationId) query = query.eq("id", data.notificationId);
    const { data: rows, error } = await query.limit(data.limit);
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
