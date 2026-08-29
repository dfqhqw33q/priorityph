import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  committeeReviewSchema,
  personnelProcessingSchema,
  presidentApprovalSchema,
  raterStep2Schema,
  reviewingSupervisorReviewSchema,
} from "./schemas";
import type { EvaluationStatus } from "./domain";

const transitions: Partial<Record<EvaluationStatus, EvaluationStatus[]>> = {
  EMPLOYEE_SUBMITTED: ["SUPERVISOR_DRAFT", "SUPERVISOR_SUBMITTED"],
  SUPERVISOR_DRAFT: ["SUPERVISOR_DRAFT", "SUPERVISOR_SUBMITTED"],
  SUPERVISOR_SUBMITTED: ["REVIEWING_SUPERVISOR_REVIEW"],
  REVIEWING_SUPERVISOR_REVIEW: ["REVIEWING_SUPERVISOR_REVIEW", "PERSONNEL_PROCESSING"],
  PERSONNEL_PROCESSING: ["PERSONNEL_PROCESSING", "COMMITTEE_REVIEW"],
  COMMITTEE_REVIEW: ["COMMITTEE_REVIEW", "PRESIDENT_APPROVAL"],
  PRESIDENT_APPROVAL: ["FINALIZED", "RETURNED_FOR_CORRECTION"],
  RETURNED_FOR_CORRECTION: [
    "SUPERVISOR_DRAFT",
    "REVIEWING_SUPERVISOR_REVIEW",
    "PERSONNEL_PROCESSING",
    "COMMITTEE_REVIEW",
  ],
  RESUBMITTED: [
    "SUPERVISOR_DRAFT",
    "REVIEWING_SUPERVISOR_REVIEW",
    "PERSONNEL_PROCESSING",
    "COMMITTEE_REVIEW",
    "PRESIDENT_APPROVAL",
  ],
};

export const getPhase2Evaluation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        evaluationId: z.string().uuid(),
        stage: z.enum(["RATER", "REVIEWING_SUPERVISOR", "PERSONNEL", "COMMITTEE", "PRESIDENT"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, loadEvaluationDetail } =
      await import("./server-core.server");
    const permission = {
      RATER: "evaluations.step2",
      REVIEWING_SUPERVISOR: "evaluations.review_step3",
      PERSONNEL: "personnel.process",
      COMMITTEE: "committee.review",
      PRESIDENT: "president.approve",
    }[data.stage] as never;
    await requirePermission(context.userId, permission, `${data.stage} Review`);
    const detail = await loadEvaluationDetail(data.evaluationId);
    if (!detail) return null;
    const admin = await getAdmin();
    const { data: row } = await admin
      .from("evaluations")
      .select("status,version,is_finalized,correction_stage")
      .eq("id", data.evaluationId)
      .maybeSingle();
    const allowedStatus = {
      RATER: ["EMPLOYEE_SUBMITTED", "SUPERVISOR_DRAFT", "RETURNED_FOR_CORRECTION"],
      REVIEWING_SUPERVISOR: ["REVIEWING_SUPERVISOR_REVIEW", "RETURNED_FOR_CORRECTION"],
      PERSONNEL: ["PERSONNEL_PROCESSING", "RETURNED_FOR_CORRECTION"],
      COMMITTEE: ["COMMITTEE_REVIEW", "RETURNED_FOR_CORRECTION"],
      PRESIDENT: ["PRESIDENT_APPROVAL"],
    }[data.stage];
    const targetStatus =
      data.stage === "RATER"
        ? "SUPERVISOR_DRAFT"
        : data.stage === "REVIEWING_SUPERVISOR"
          ? "REVIEWING_SUPERVISOR_REVIEW"
          : data.stage === "PERSONNEL"
            ? "PERSONNEL_PROCESSING"
            : data.stage === "COMMITTEE"
              ? "COMMITTEE_REVIEW"
              : "PRESIDENT_APPROVAL";
    if (
      row &&
      (!allowedStatus.includes(row.status) ||
        (row.status === "RETURNED_FOR_CORRECTION" && row.correction_stage !== targetStatus))
    ) {
      throw (await import("./server-core.server")).validationError(
        "This evaluation is not assigned to this workflow stage",
      );
    }
    const stageTable = {
      REVIEWING_SUPERVISOR: "reviewing_supervisor_reviews",
      PERSONNEL: "personnel_processing",
      COMMITTEE: "committee_reviews",
    }[data.stage as "REVIEWING_SUPERVISOR" | "PERSONNEL" | "COMMITTEE"];
    let { data: stageRecord } = stageTable
      ? await admin
          .from(stageTable)
          .select("*")
          .eq("evaluation_id", data.evaluationId)
          .maybeSingle()
      : { data: null };
    if (stageTable && !stageRecord) {
      const claim = {
        REVIEWING_SUPERVISOR: {
          evaluation_id: data.evaluationId,
          reviewer_user_id: context.userId,
          status: "DRAFT",
        },
        PERSONNEL: {
          evaluation_id: data.evaluationId,
          personnel_user_id: context.userId,
          status: "DRAFT",
        },
        COMMITTEE: {
          evaluation_id: data.evaluationId,
          committee_user_id: context.userId,
          final_action: "RETAIN",
          status: "DRAFT",
        },
      }[data.stage as "REVIEWING_SUPERVISOR" | "PERSONNEL" | "COMMITTEE"];
      const { error } = await admin.from(stageTable).insert(claim as never);
      if (error && error.code !== "23505")
        throw (await import("./server-core.server")).validationError(error.message);
      const claimed = await admin
        .from(stageTable)
        .select("*")
        .eq("evaluation_id", data.evaluationId)
        .maybeSingle();
      stageRecord = claimed.data;
    }
    const ownerField = {
      REVIEWING_SUPERVISOR: "reviewer_user_id",
      PERSONNEL: "personnel_user_id",
      COMMITTEE: "committee_user_id",
    }[data.stage as "REVIEWING_SUPERVISOR" | "PERSONNEL" | "COMMITTEE"];
    if (
      stageRecord &&
      ownerField &&
      stageRecord[ownerField] &&
      stageRecord[ownerField] !== context.userId
    )
      throw (await import("./server-core.server")).validationError(
        "This evaluation is assigned to another workflow user",
      );
    return {
      ...detail,
      status: row?.status ?? detail.status,
      version: row?.version ?? detail.version,
      is_finalized: row?.is_finalized ?? detail.is_finalized,
      stageRecord,
    };
  });

export const listPhase2Queue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ stage: z.enum(["REVIEWING_SUPERVISOR", "PERSONNEL", "COMMITTEE", "PRESIDENT"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, listEvaluations } = await import("./server-core.server");
    const config = {
      REVIEWING_SUPERVISOR: {
        permission: "evaluations.review_step3" as const,
        statuses: ["REVIEWING_SUPERVISOR_REVIEW"],
      },
      PERSONNEL: { permission: "personnel.process" as const, statuses: ["PERSONNEL_PROCESSING"] },
      COMMITTEE: { permission: "committee.review" as const, statuses: ["COMMITTEE_REVIEW"] },
      PRESIDENT: { permission: "president.approve" as const, statuses: ["PRESIDENT_APPROVAL"] },
    }[data.stage];
    await requirePermission(context.userId, config.permission, `${data.stage} Review`);
    const filters = { search: "", year: null, division: "", section: "", status: null };
    const correctionStage =
      data.stage === "REVIEWING_SUPERVISOR"
        ? "REVIEWING_SUPERVISOR_REVIEW"
        : data.stage === "PERSONNEL"
          ? "PERSONNEL_PROCESSING"
          : data.stage === "COMMITTEE"
            ? "COMMITTEE_REVIEW"
            : undefined;
    const [current, returned] = await Promise.all([
      listEvaluations(config.statuses, filters),
      listEvaluations(["RETURNED_FOR_CORRECTION"], { ...filters, correctionStage }),
    ]);
    const rows = [...current, ...returned];
    const stageTable = {
      REVIEWING_SUPERVISOR: "reviewing_supervisor_reviews",
      PERSONNEL: "personnel_processing",
      COMMITTEE: "committee_reviews",
    }[data.stage];
    const ownerField = {
      REVIEWING_SUPERVISOR: "reviewer_user_id",
      PERSONNEL: "personnel_user_id",
      COMMITTEE: "committee_user_id",
    }[data.stage];
    const admin = await getAdmin();
    const { data: assignments } = await admin
      .from(stageTable)
      .select(`evaluation_id,${ownerField}`)
      .in(
        "evaluation_id",
        rows.map((row) => row.id),
      );
    const assigned = new Map(
      (assignments ?? []).map((assignment) => [assignment.evaluation_id, assignment[ownerField]]),
    );
    return rows.filter((row) => !assigned.get(row.id) || assigned.get(row.id) === context.userId);
  });

const notificationPermissionByStatus: Partial<Record<EvaluationStatus, string>> = {
  SUPERVISOR_DRAFT: "evaluations.step2",
  REVIEWING_SUPERVISOR_REVIEW: "evaluations.review_step3",
  PERSONNEL_PROCESSING: "personnel.process",
  COMMITTEE_REVIEW: "committee.review",
  PRESIDENT_APPROVAL: "president.approve",
  RETURNED_FOR_CORRECTION: "evaluations.correct",
  FINALIZED: "evaluations.view_history",
};

async function transition(
  evaluationId: string,
  expectedVersion: number,
  next: EvaluationStatus,
  actorUserId: string,
  action: string,
  reason = "",
  correctionStage: string | null = null,
) {
  const { getAdmin, requirePermission, writeAudit, getActorRoles, validationError } =
    await import("./server-core.server");
  const admin = await getAdmin();
  const { data: current } = await admin
    .from("evaluations")
    .select("id,status,version,is_finalized")
    .eq("id", evaluationId)
    .maybeSingle();
  if (!current || current.version !== expectedVersion)
    throw validationError("This evaluation changed in another session. Reload and try again.");
  if (current.is_finalized) throw validationError("Finalized evaluations cannot be modified");
  if (!(transitions[current.status as EvaluationStatus] ?? []).includes(next))
    throw validationError(`Invalid workflow transition from ${current.status} to ${next}`);
  const { error } = await admin
    .from("evaluations")
    .update({
      status: next,
      version: expectedVersion + 1,
      correction_reason: next === "RETURNED_FOR_CORRECTION" ? reason : undefined,
      correction_stage: next === "RETURNED_FOR_CORRECTION" ? correctionStage : null,
      is_finalized: next === "FINALIZED" ? true : undefined,
      finalized_by: next === "FINALIZED" ? actorUserId : undefined,
      finalized_at: next === "FINALIZED" ? new Date().toISOString() : undefined,
      finalization_reason: next === "FINALIZED" ? reason : undefined,
    } as never)
    .eq("id", evaluationId)
    .eq("version", expectedVersion);
  if (error) throw validationError(error.message);
  await admin.from("evaluation_events").insert({
    evaluation_id: evaluationId,
    event_type: action,
    from_status: current.status,
    to_status: next,
    actor_user_id: actorUserId,
    reason: reason || null,
  });
  await admin.from("notification_events").insert({
    evaluation_id: evaluationId,
    event_type: action,
    audience_permission:
      next === "RETURNED_FOR_CORRECTION" && correctionStage
        ? (notificationPermissionByStatus[correctionStage as EvaluationStatus] ??
          "evaluations.view_history")
        : (notificationPermissionByStatus[next] ?? "evaluations.view_history"),
    title:
      next === "RETURNED_FOR_CORRECTION"
        ? "Evaluation returned for correction"
        : "Evaluation workflow updated",
    body: reason || `An evaluation entered ${next.replaceAll("_", " ").toLowerCase()}.`,
    payload: { fromStatus: current.status, toStatus: next, reason, correctionStage },
    dedupe_key: `${evaluationId}:${action}:${expectedVersion}`,
  } as never);
  await writeAudit({
    actorUserId,
    actorRole: (await getActorRoles(actorUserId)).join(","),
    action,
    module: "Evaluation Workflow",
    entityType: "evaluation",
    entityId: evaluationId,
    evaluationId,
    previousValue: { status: current.status },
    newValue: { status: next },
  });
  return { ok: true };
}

async function saveStageSignature(
  evaluationId: string,
  stage: string,
  signature: { method: "DRAWN" | "UPLOAD" | "TYPED"; data: string },
  userId: string,
  version: number,
) {
  const { getAdmin, validationError } = await import("./server-core.server");
  const admin = await getAdmin();
  let storagePath: string | null = null;
  let signatureData: string | null = signature.data;
  if (signature.method === "UPLOAD") {
    const match = signature.data.match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw validationError("Signature upload must be a PNG or JPEG image");
    const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
    storagePath = `evaluations/${evaluationId}/signatures/${stage.toLowerCase()}.png`;
    const { error } = await admin.storage
      .from("employee-files")
      .upload(storagePath, bytes, { contentType: match[1], upsert: true });
    if (error) throw validationError("Could not store the stage signature");
    signatureData = null;
  }
  const { error } = await admin.from("evaluation_stage_signatures").upsert(
    {
      evaluation_id: evaluationId,
      stage,
      method: signature.method,
      storage_path: storagePath,
      signature_data: signatureData,
      signer_user_id: userId,
      source_version: version,
      signed_at: new Date().toISOString(),
    } as never,
    { onConflict: "evaluation_id,stage" },
  );
  if (error) throw validationError(error.message);
}

export const saveRaterStep2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => raterStep2Schema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, validationError } = await import("./server-core.server");
    await requirePermission(context.userId, "evaluations.step2", "Rater Step 2");
    const admin = await getAdmin();
    const { data: evaluation } = await admin
      .from("evaluations")
      .select("status,version,is_finalized,correction_stage")
      .eq("id", data.evaluationId)
      .maybeSingle();
    if (!evaluation || evaluation.version !== data.version || evaluation.is_finalized)
      throw validationError("This evaluation can no longer be edited");
    if (
      evaluation.status !== "EMPLOYEE_SUBMITTED" &&
      evaluation.status !== "SUPERVISOR_DRAFT" &&
      !(
        evaluation.status === "RETURNED_FOR_CORRECTION" &&
        evaluation.correction_stage === "SUPERVISOR_DRAFT"
      )
    )
      throw validationError("This evaluation is not available for Rater Step 2");
    const nextStatus = data.submit ? "SUPERVISOR_SUBMITTED" : "SUPERVISOR_DRAFT";
    if (!(transitions[evaluation.status as EvaluationStatus] ?? []).includes(nextStatus))
      throw validationError(
        `Invalid workflow transition from ${evaluation.status} to ${nextStatus}`,
      );
    if (data.submit && !data.signature)
      throw validationError("A Rater signature is required before submission");
    if (data.ratings.length > 0) {
      const { upsertSupervisorRatings } = await import("./server-core.server");
      await upsertSupervisorRatings(data.evaluationId, data.ratings, context.userId, data.submit);
    }
    const { error } = await admin
      .from("evaluations")
      .update({
        supervisor_step2_strengths: data.strengths,
        supervisor_step2_weaknesses: data.weaknesses,
        supervisor_step2_development: data.development,
        supervisor_step2_advancement: data.advancement,
        supervisor_step2_career_transfer: data.careerTransfer,
        supervisor_step2_recommendations: data.recommendations,
        supervisor_remarks: data.remarks,
        status: nextStatus,
        supervisor_user_id: context.userId,
        supervisor_step2_submitted_at: data.submit ? new Date().toISOString() : null,
        version: data.version + 1,
      } as never)
      .eq("id", data.evaluationId)
      .eq("version", data.version);
    if (error) throw validationError(error.message);
    await admin.from("evaluation_events").insert({
      evaluation_id: data.evaluationId,
      event_type: data.submit ? "RATER_STEP2_SUBMITTED" : "RATER_STEP2_DRAFT_SAVED",
      from_status: evaluation.status,
      to_status: nextStatus,
      actor_user_id: context.userId,
    });
    if (data.submit)
      await admin.from("notification_events").insert({
        evaluation_id: data.evaluationId,
        event_type: "RATER_STEP2_SUBMITTED",
        audience_permission: "evaluations.review_step3",
        title: "Rater Step 2 submitted",
        body: "An evaluation is ready for Reviewing Supervisor review.",
        dedupe_key: `${data.evaluationId}:RATER_STEP2_SUBMITTED:${data.version}`,
      } as never);
    if (data.signature)
      await saveStageSignature(
        data.evaluationId,
        "RATER_STEP2",
        data.signature!,
        context.userId,
        data.version,
      );
    return { ok: true, submitted: data.submit };
  });

export const enterReviewingSupervisorStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ evaluationId: z.string().uuid(), version: z.number().int().positive() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { requirePermission } = await import("./server-core.server");
    await requirePermission(context.userId, "evaluations.review_step3", "Reviewing Supervisor");
    return transition(
      data.evaluationId,
      data.version,
      "REVIEWING_SUPERVISOR_REVIEW",
      context.userId,
      "REVIEWING_SUPERVISOR_REVIEW_STARTED",
    );
  });

export const submitReviewingSupervisor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reviewingSupervisorReviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, validationError } = await import("./server-core.server");
    await requirePermission(context.userId, "evaluations.review_step3", "Reviewing Supervisor");
    if (data.submit && !data.signature)
      throw validationError("A Reviewing Supervisor signature is required before submission");
    const admin = await getAdmin();
    const { data: evaluation } = await admin
      .from("evaluations")
      .select("status,correction_stage")
      .eq("id", data.evaluationId)
      .maybeSingle();
    if (
      evaluation?.status === "RETURNED_FOR_CORRECTION" &&
      evaluation.correction_stage !== "REVIEWING_SUPERVISOR_REVIEW"
    )
      throw validationError("This evaluation is assigned to another correction stage");
    const result = await transition(
      data.evaluationId,
      data.version,
      data.submit ? "PERSONNEL_PROCESSING" : "REVIEWING_SUPERVISOR_REVIEW",
      context.userId,
      "REVIEWING_SUPERVISOR_SUBMITTED",
    );
    const { error: stageError } = await admin.from("reviewing_supervisor_reviews").upsert(
      {
        evaluation_id: data.evaluationId,
        reviewer_user_id: context.userId,
        comments: data.comments,
        recommendations: data.recommendations,
        status: data.submit ? "SUBMITTED" : "DRAFT",
        submitted_at: data.submit ? new Date().toISOString() : null,
        version: data.version,
      } as never,
      { onConflict: "evaluation_id" },
    );
    if (stageError) throw validationError(stageError.message);
    if (data.submit)
      await saveStageSignature(
        data.evaluationId,
        "REVIEWING_SUPERVISOR_STEP3",
        data.signature,
        context.userId,
        data.version,
      );
    return result;
  });

export const submitPersonnelProcessing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => personnelProcessingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, validationError } = await import("./server-core.server");
    await requirePermission(context.userId, "personnel.process", "Personnel Processing");
    if (data.submit && !data.signature)
      throw validationError("A Personnel Office signature is required before submission");
    const admin = await getAdmin();
    const { data: evaluation } = await admin
      .from("evaluations")
      .select("status,correction_stage")
      .eq("id", data.evaluationId)
      .maybeSingle();
    if (
      evaluation?.status === "RETURNED_FOR_CORRECTION" &&
      evaluation.correction_stage !== "PERSONNEL_PROCESSING"
    )
      throw validationError("This evaluation is assigned to another correction stage");
    const result = await transition(
      data.evaluationId,
      data.version,
      data.submit ? "COMMITTEE_REVIEW" : "PERSONNEL_PROCESSING",
      context.userId,
      "PERSONNEL_SUBMITTED",
    );
    const { error: stageError } = await admin.from("personnel_processing").upsert(
      {
        evaluation_id: data.evaluationId,
        personnel_user_id: context.userId,
        present_salary: data.presentSalary,
        last_increase_date: data.lastIncreaseDate,
        last_increase_nature: data.lastIncreaseNature,
        last_increase_amount: data.lastIncreaseAmount,
        total_points: data.totalPoints,
        adjective_rating: data.adjectiveRating,
        recommended_increase_bonus: data.recommendedIncreaseBonus,
        status: data.submit ? "SUBMITTED" : "DRAFT",
        submitted_at: data.submit ? new Date().toISOString() : null,
        version: data.version,
      } as never,
      { onConflict: "evaluation_id" },
    );
    if (stageError) throw validationError(stageError.message);
    if (data.submit)
      await saveStageSignature(
        data.evaluationId,
        "PERSONNEL",
        data.signature,
        context.userId,
        data.version,
      );
    return result;
  });

export const submitCommitteeReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => committeeReviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, validationError } = await import("./server-core.server");
    await requirePermission(context.userId, "committee.review", "Committee Review");
    if (data.submit && !data.signature)
      throw validationError("A Committee signature is required before submission");
    const admin = await getAdmin();
    const { data: evaluation } = await admin
      .from("evaluations")
      .select("status,correction_stage")
      .eq("id", data.evaluationId)
      .maybeSingle();
    if (
      evaluation?.status === "RETURNED_FOR_CORRECTION" &&
      evaluation.correction_stage !== "COMMITTEE_REVIEW"
    )
      throw validationError("This evaluation is assigned to another correction stage");
    const result = await transition(
      data.evaluationId,
      data.version,
      data.submit ? "PRESIDENT_APPROVAL" : "COMMITTEE_REVIEW",
      context.userId,
      "COMMITTEE_SUBMITTED",
    );
    const { error: stageError } = await admin.from("committee_reviews").upsert(
      {
        evaluation_id: data.evaluationId,
        committee_user_id: context.userId,
        final_action: data.finalAction,
        action_details: data.actionDetails,
        recommendation: data.recommendation,
        status: data.submit ? "SUBMITTED" : "DRAFT",
        submitted_at: data.submit ? new Date().toISOString() : null,
        version: data.version,
      } as never,
      { onConflict: "evaluation_id" },
    );
    if (stageError) throw validationError(stageError.message);
    if (data.submit)
      await saveStageSignature(
        data.evaluationId,
        "COMMITTEE",
        data.signature,
        context.userId,
        data.version,
      );
    return result;
  });

export const approveEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => presidentApprovalSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, validationError } = await import("./server-core.server");
    await requirePermission(context.userId, "president.approve", "President Approval");
    if (!data.approve && !data.reason)
      throw validationError("A reason is required when returning an evaluation");
    if (data.approve && !data.signature)
      throw validationError("A President signature is required for approval");
    const admin = await getAdmin();
    const { data: evaluation } = await admin
      .from("evaluations")
      .select("status")
      .eq("id", data.evaluationId)
      .maybeSingle();
    if (data.approve && evaluation?.status !== "PRESIDENT_APPROVAL")
      throw validationError("Committee review must be completed before President approval");
    if (data.approve)
      await saveStageSignature(
        data.evaluationId,
        "PRESIDENT",
        data.signature!,
        context.userId,
        data.version,
      );
    if (!data.approve && !data.correctionStage)
      throw validationError("Select the stage that must correct this evaluation");
    return transition(
      data.evaluationId,
      data.version,
      data.approve ? "FINALIZED" : "RETURNED_FOR_CORRECTION",
      context.userId,
      data.approve ? "PRESIDENT_APPROVED" : "PRESIDENT_RETURNED",
      data.reason,
      data.correctionStage ?? null,
    );
  });

export const resubmitForCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        evaluationId: z.string().uuid(),
        version: z.number().int().positive(),
        stage: z.enum([
          "SUPERVISOR_DRAFT",
          "REVIEWING_SUPERVISOR_REVIEW",
          "PERSONNEL_PROCESSING",
          "COMMITTEE_REVIEW",
        ]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, validationError } = await import("./server-core.server");
    await requirePermission(context.userId, "evaluations.correct", "Evaluation Correction");
    const admin = await getAdmin();
    const { data: evaluation } = await admin
      .from("evaluations")
      .select("status,correction_stage")
      .eq("id", data.evaluationId)
      .maybeSingle();
    if (
      evaluation?.status !== "RETURNED_FOR_CORRECTION" ||
      evaluation.correction_stage !== data.stage
    )
      throw validationError("This evaluation is not waiting for the selected re-review stage");
    return transition(
      data.evaluationId,
      data.version,
      data.stage,
      context.userId,
      "EVALUATION_RESUBMITTED",
    );
  });
