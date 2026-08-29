import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  supervisorDraftSchema,
  supervisorSubmitSchema,
  reopenSchema,
  queueFiltersSchema,
} from "./schemas";
import type { EvaluationDetail, EvaluationListItem } from "./domain";

const SUPERVISOR_QUEUE_STATUSES = [
  "EMPLOYEE_SUBMITTED",
  "SUPERVISOR_DRAFT",
  "RETURNED_FOR_CORRECTION",
  "SUPERVISOR_SUBMITTED",
  "REVIEWING_SUPERVISOR_REVIEW",
  "PRESIDENT_REVIEW",
];

const PRESIDENT_QUEUE_STATUSES = [
  "PRESIDENT_APPROVAL",
  "SUPERVISOR_SUBMITTED",
  "PRESIDENT_REVIEW",
  "PRESIDENT_SUBMITTED",
];

/**
 * Supervisor queue. Every authorised Supervisor sees every eligible Step 1
 * submission — there is no employee/department assignment filtering.
 */
export const listSupervisorQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => queueFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<EvaluationListItem[]> => {
    const { requirePermission, listEvaluations, writeAudit, getActorRoles } =
      await import("./server-core.server");
    await requirePermission(context.userId, "evaluations.view_step1", "Supervisor Review");
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "SUPERVISOR_QUEUE_ACCESSED",
      module: "Supervisor Review",
      newValue: { filters: data },
    });
    const [current, returned] = await Promise.all([
      listEvaluations(
        SUPERVISOR_QUEUE_STATUSES.filter((status) => status !== "RETURNED_FOR_CORRECTION"),
        data,
      ),
      listEvaluations(["RETURNED_FOR_CORRECTION"], {
        ...data,
        correctionStage: "SUPERVISOR_DRAFT",
      }),
    ]);
    return [...current, ...returned].filter(
      (row) => !row.supervisor_user_id || row.supervisor_user_id === context.userId,
    );
  });

export const listPresidentQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => queueFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<EvaluationListItem[]> => {
    const { requirePermission, listEvaluations, writeAudit, getActorRoles } =
      await import("./server-core.server");
    await requirePermission(context.userId, "president.view", "President Review");
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "PRESIDENT_QUEUE_ACCESSED",
      module: "President Review",
      newValue: { filters: data },
    });
    return listEvaluations(PRESIDENT_QUEUE_STATUSES, data);
  });

export const listQueueFilterOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requirePermissionAny, queueFilterOptions } = await import("./server-core.server");
    await requirePermissionAny(
      context.userId,
      ["evaluations.view_step1", "president.view"],
      "Evaluation Review",
    );
    return queueFilterOptions();
  });

export const getSupervisorStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requirePermission, supervisorStats, recentActivity } =
      await import("./server-core.server");
    await requirePermission(context.userId, "evaluations.view_step1", "Supervisor Review");
    const [stats, activity] = await Promise.all([
      supervisorStats(),
      recentActivity(["Supervisor Review"]),
    ]);
    return { ...stats, activity };
  });

export const getEvaluation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ evaluationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<EvaluationDetail | null> => {
    const { requirePermissionAny, loadEvaluationDetail, writeAudit, getActorRoles } =
      await import("./server-core.server");
    await requirePermissionAny(
      context.userId,
      ["evaluations.view_step1", "president.view"],
      "Evaluation Review",
    );
    const detail = await loadEvaluationDetail(data.evaluationId);
    if (detail) {
      await writeAudit({
        actorUserId: context.userId,
        actorRole: (await getActorRoles(context.userId)).join(","),
        action: "EVALUATION_VIEWED",
        module: "Evaluation Review",
        entityType: "evaluation",
        entityId: data.evaluationId,
        evaluationId: data.evaluationId,
      });
    }
    return detail;
  });

export const saveSupervisorDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => supervisorDraftSchema.parse(input))
  .handler(async ({ data, context }) => {
    const {
      getAdmin,
      requirePermission,
      writeAudit,
      getActorRoles,
      validationError,
      assertVersion,
      upsertSupervisorRatings,
    } = await import("./server-core.server");
    await requirePermission(context.userId, "evaluations.rate_supervisor", "Supervisor Review");
    const admin = await getAdmin();
    const evaluation = await assertVersion(data.evaluationId, data.version);
    if (evaluation.status !== "EMPLOYEE_SUBMITTED" && evaluation.status !== "SUPERVISOR_DRAFT")
      throw validationError("This evaluation can no longer be edited");

    await upsertSupervisorRatings(data.evaluationId, data.ratings, context.userId, false);
    const { error } = await admin
      .from("evaluations")
      .update({
        status: "SUPERVISOR_DRAFT",
        supervisor_remarks: data.remarks,
        supervisor_user_id: context.userId,
      })
      .eq("id", data.evaluationId);
    if (error) throw validationError(error.message);

    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "SUPERVISOR_DRAFT_SAVED",
      module: "Supervisor Review",
      entityType: "evaluation",
      entityId: data.evaluationId,
      evaluationId: data.evaluationId,
      newValue: { ratings: data.ratings.length, remarks: data.remarks },
    });
    return { ok: true };
  });

export const submitToPresident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => supervisorSubmitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const {
      getAdmin,
      requirePermission,
      writeAudit,
      getActorRoles,
      validationError,
      assertVersion,
      upsertSupervisorRatings,
    } = await import("./server-core.server");
    await requirePermission(context.userId, "evaluations.submit_president", "Supervisor Review");
    const admin = await getAdmin();
    const evaluation = await assertVersion(data.evaluationId, data.version);
    if (evaluation.status !== "EMPLOYEE_SUBMITTED" && evaluation.status !== "SUPERVISOR_DRAFT")
      throw validationError("This evaluation has already been submitted");

    await upsertSupervisorRatings(data.evaluationId, data.ratings, context.userId, true);
    const { error } = await admin
      .from("evaluations")
      .update({
        status: "REVIEWING_SUPERVISOR_REVIEW",
        supervisor_remarks: data.remarks,
        supervisor_user_id: context.userId,
        supervisor_submitted_at: new Date().toISOString(),
      })
      .eq("id", data.evaluationId);
    if (error) throw validationError(error.message);

    await admin.from("evaluation_events").insert({
      evaluation_id: data.evaluationId,
      event_type: "SUPERVISOR_SUBMITTED",
      from_status: evaluation.status,
      to_status: "REVIEWING_SUPERVISOR_REVIEW",
      actor_user_id: context.userId,
    });
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "RATER_STEP2_SUBMITTED",
      module: "Rater Step 2",
      entityType: "evaluation",
      entityId: data.evaluationId,
      evaluationId: data.evaluationId,
      previousValue: { status: evaluation.status },
      newValue: { status: "REVIEWING_SUPERVISOR_REVIEW" },
    });
    return { ok: true };
  });

export const reopenSupervisorStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reopenSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, writeAudit, getActorRoles, validationError } =
      await import("./server-core.server");
    await requirePermission(context.userId, "evaluations.reopen_supervisor", "Supervisor Review");
    const admin = await getAdmin();
    const { data: evaluation } = await admin
      .from("evaluations")
      .select("id, status, is_finalized")
      .eq("id", data.evaluationId)
      .maybeSingle();
    if (!evaluation) throw validationError("Evaluation not found");
    if (evaluation.is_finalized) throw validationError("Finalized evaluations cannot be reopened");
    if (evaluation.status !== "SUPERVISOR_SUBMITTED")
      throw validationError("Only submitted supervisor assessments can be reopened");

    await admin
      .from("evaluation_ratings")
      .update({ is_locked: false })
      .eq("evaluation_id", data.evaluationId)
      .eq("evaluator_type", "SUPERVISOR");
    const { error } = await admin
      .from("evaluations")
      .update({ status: "SUPERVISOR_DRAFT", supervisor_submitted_at: null })
      .eq("id", data.evaluationId);
    if (error) throw validationError(error.message);

    await admin.from("evaluation_events").insert({
      evaluation_id: data.evaluationId,
      event_type: "SUPERVISOR_REOPENED",
      from_status: "SUPERVISOR_SUBMITTED",
      to_status: "SUPERVISOR_DRAFT",
      actor_user_id: context.userId,
      reason: data.reason,
    });
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "SUPERVISOR_REOPENED",
      module: "Supervisor Review",
      entityType: "evaluation",
      entityId: data.evaluationId,
      evaluationId: data.evaluationId,
      previousValue: { status: "SUPERVISOR_SUBMITTED" },
      newValue: { status: "SUPERVISOR_DRAFT" },
      reason: data.reason,
    });
    return { ok: true };
  });

export const markPresidentReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ evaluationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, writeAudit, getActorRoles } =
      await import("./server-core.server");
    await requirePermission(context.userId, "president.view", "President Review");
    const admin = await getAdmin();
    await admin
      .from("evaluations")
      .update({ status: "PRESIDENT_REVIEW", president_user_id: context.userId })
      .eq("id", data.evaluationId)
      .eq("status", "SUPERVISOR_SUBMITTED");
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "PRESIDENT_REVIEW_OPENED",
      module: "President Review",
      entityType: "evaluation",
      entityId: data.evaluationId,
      evaluationId: data.evaluationId,
    });
    return { ok: true };
  });

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { dashboardStats } = await import("./server-core.server");
    return dashboardStats(context.userId);
  });
