import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supervisorDraftSchema, queueFiltersSchema } from "./schemas";
import type { EvaluationDetail, EvaluationListItem } from "./domain";

const SUPERVISOR_QUEUE_STATUSES = [
  "SUBMITTED",
  "DRAFT",
  "RETURNED",
];

const PRESIDENT_QUEUE_STATUSES = ["FOR_APPROVAL"];

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
        SUPERVISOR_QUEUE_STATUSES.filter((status) => status !== "RETURNED"),
        data,
      ),
      listEvaluations(["RETURNED"], {
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
    const { requirePermission, loadEvaluationDetail, writeAudit, getActorRoles, validationError } =
      await import("./server-core.server");
    await requirePermission(context.userId, "evaluations.view_step1", "Supervisor Review");
    const detail = await loadEvaluationDetail(data.evaluationId);
    if (detail?.supervisor_user_id && detail.supervisor_user_id !== context.userId)
      throw validationError("This evaluation is assigned to another supervisor.");
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
    if (evaluation.status !== "SUBMITTED" && evaluation.status !== "DRAFT")
      throw validationError("This evaluation can no longer be edited");

    await upsertSupervisorRatings(data.evaluationId, data.ratings, context.userId, false);
    const { error } = await admin
      .from("evaluations")
      .update({
        status: "DRAFT",
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

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { dashboardStats } = await import("./server-core.server");
    return dashboardStats(context.userId);
  });
