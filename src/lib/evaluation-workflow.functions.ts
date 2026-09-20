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
  SUBMITTED: ["DRAFT", "FOR_REVIEW"],
  DRAFT: ["DRAFT", "FOR_REVIEW"],
  FOR_REVIEW: ["FOR_REVIEW", "FOR_PROCESSING", "FOR_APPROVAL"],
  FOR_PROCESSING: ["FOR_PROCESSING", "FOR_REVIEW"],
  FOR_APPROVAL: ["FINALIZED", "RETURNED"],
  RETURNED: ["DRAFT", "FOR_REVIEW", "FOR_PROCESSING"],
};

type SerializableRecord = Record<string, string | number | boolean | null>;

export const getEvaluationStage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
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
    const { computeScore } = await import("./scoring.server");
    const permission = {
      RATER: "evaluations.step2",
      REVIEWING_SUPERVISOR: "evaluations.review_step3",
      PERSONNEL: "personnel.process",
      COMMITTEE: "committee.review",
      PRESIDENT: "president.approve",
    }[data.stage] as never;
    await requirePermission(context.userId, permission, `${data.stage} Review`);
    const [detail, score] = await Promise.all([
      loadEvaluationDetail(data.evaluationId),
      computeScore(data.evaluationId),
    ]);
    if (!detail) return null;
    const admin = await getAdmin();
    const allowedStatus = {
      RATER: ["SUBMITTED", "DRAFT", "RETURNED"],
      REVIEWING_SUPERVISOR: ["FOR_REVIEW", "RETURNED"],
      PERSONNEL: ["FOR_PROCESSING", "RETURNED"],
      COMMITTEE: ["FOR_REVIEW", "RETURNED"],
      PRESIDENT: ["FOR_APPROVAL", "RETURNED"],
    }[data.stage];
    const targetStatus =
      data.stage === "RATER"
        ? "DRAFT"
        : data.stage === "REVIEWING_SUPERVISOR"
          ? "FOR_REVIEW"
          : data.stage === "PERSONNEL"
            ? "FOR_PROCESSING"
            : data.stage === "COMMITTEE"
              ? "FOR_REVIEW"
              : "FOR_APPROVAL";
    let stageReady = true;
    if (
      detail.status === "FOR_REVIEW" &&
      (data.stage === "REVIEWING_SUPERVISOR" || data.stage === "COMMITTEE")
    ) {
      const { data: personnelRecord } = await admin
        .from("personnel_processing")
        .select("submitted_at")
        .eq("evaluation_id", data.evaluationId)
        .maybeSingle();
      stageReady =
        data.stage === "COMMITTEE"
          ? Boolean(personnelRecord?.submitted_at)
          : !personnelRecord?.submitted_at;
    }
    if (
      !allowedStatus.includes(detail.status) ||
      !stageReady ||
      (detail.status === "RETURNED" &&
        detail.correction_stage !==
          (
            {
              RATER: "SUPERVISOR_DRAFT",
              REVIEWING_SUPERVISOR: "REVIEWING_SUPERVISOR_REVIEW",
              PERSONNEL: "PERSONNEL_PROCESSING",
              COMMITTEE: "COMMITTEE_REVIEW",
              PRESIDENT: "PRESIDENT_APPROVAL",
            } as Record<string, string>
          )[data.stage])
    ) {
      throw (await import("./server-core.server")).validationError(
        "This evaluation is not assigned to this workflow stage",
      );
    }
    const stageTable = {
      REVIEWING_SUPERVISOR: "reviewing_supervisor_reviews",
      PERSONNEL: "personnel_processing",
      COMMITTEE: "committee_reviews",
    } as const;
    const stageTableName = stageTable[data.stage as keyof typeof stageTable];
    const stageResult = stageTableName
      ? await admin
          .from(stageTableName)
          .select("*")
          .eq("evaluation_id", data.evaluationId)
          .maybeSingle()
      : { data: null };
    let stageRecord = stageResult.data as unknown as SerializableRecord | null;
    if (stageTableName && !stageRecord) {
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
      const { error } = await admin.from(stageTableName).insert(claim as never);
      if (error && error.code !== "23505")
        throw (await import("./server-core.server")).validationError(error.message);
      const claimed = await admin
        .from(stageTableName)
        .select("*")
        .eq("evaluation_id", data.evaluationId)
        .maybeSingle();
      stageRecord = claimed.data as unknown as SerializableRecord | null;
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
    let stageSignature = null;
    if (data.stage !== "RATER") {
      const signatureStage = {
        REVIEWING_SUPERVISOR: "REVIEWING_SUPERVISOR_STEP3",
        PERSONNEL: "PERSONNEL",
        COMMITTEE: "COMMITTEE",
        PRESIDENT: "PRESIDENT",
      }[data.stage];
      const signature = await admin
        .from("evaluation_stage_signatures")
        .select("method, signature_data, storage_path, signed_at")
        .eq("evaluation_id", data.evaluationId)
        .eq("stage", signatureStage)
        .maybeSingle();
      stageSignature = signature.data;
      if (stageSignature?.storage_path) {
        const { data: signed } = await admin.storage
          .from("employee-files")
          .createSignedUrl(stageSignature.storage_path, 300);
        stageSignature = { ...stageSignature, signature_data: signed?.signedUrl ?? null };
      }
    }
    let accumulatedStages: Record<string, SerializableRecord | null> = {};
    if (["PERSONNEL", "COMMITTEE", "PRESIDENT"].includes(data.stage)) {
      const [reviewingSup, personnel, committee] = await Promise.all([
        admin
          .from("reviewing_supervisor_reviews")
          .select("*")
          .eq("evaluation_id", data.evaluationId)
          .maybeSingle(),
        admin
          .from("personnel_processing")
          .select("*")
          .eq("evaluation_id", data.evaluationId)
          .maybeSingle(),
        admin
          .from("committee_reviews")
          .select("*")
          .eq("evaluation_id", data.evaluationId)
          .maybeSingle(),
      ]);
      accumulatedStages = {
        reviewingSupervisorReview: reviewingSup.data as SerializableRecord | null,
        personnelProcessing: personnel.data as SerializableRecord | null,
        committeeReview: committee.data as SerializableRecord | null,
      };
    }
    return {
      ...detail,
      stageRecord,
      stageSignature,
      accumulatedStages,
      score,
    };
  });

export const listEvaluationStageQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ stage: z.enum(["REVIEWING_SUPERVISOR", "PERSONNEL", "COMMITTEE", "PRESIDENT"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, listEvaluations } = await import("./server-core.server");
    const config = {
      REVIEWING_SUPERVISOR: {
        permission: "evaluations.review_step3" as const,
        statuses: ["FOR_REVIEW"],
      },
      PERSONNEL: { permission: "personnel.process" as const, statuses: ["FOR_PROCESSING"] },
      COMMITTEE: { permission: "committee.review" as const, statuses: ["FOR_REVIEW"] },
      PRESIDENT: { permission: "president.approve" as const, statuses: ["FOR_APPROVAL"] },
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
            : data.stage === "PRESIDENT"
              ? "PRESIDENT_APPROVAL"
              : undefined;
    const [current, returned] = await Promise.all([
      listEvaluations(config.statuses, filters),
      listEvaluations(["RETURNED"], correctionStage ? { ...filters, correctionStage } : filters),
    ]);
    let rows = [...current, ...returned];
    if (rows.length === 0) return [];

    if (data.stage === "REVIEWING_SUPERVISOR" || data.stage === "COMMITTEE") {
      const admin = await getAdmin();
      const { data: personnelRows } = await admin
        .from("personnel_processing")
        .select("evaluation_id,submitted_at")
        .in(
          "evaluation_id",
          rows.map((row) => row.id),
        );
      const processed = new Set(
        (personnelRows ?? []).filter((row) => row.submitted_at).map((row) => row.evaluation_id),
      );
      rows = rows.filter((row) =>
        row.status === "RETURNED"
          ? true
          : data.stage === "COMMITTEE"
            ? processed.has(row.id)
            : !processed.has(row.id),
      );
    }

    const stageTable = {
      REVIEWING_SUPERVISOR: "reviewing_supervisor_reviews",
      PERSONNEL: "personnel_processing",
      COMMITTEE: "committee_reviews",
    } as const;
    const stageTableName = stageTable[data.stage as keyof typeof stageTable];
    const ownerField = {
      REVIEWING_SUPERVISOR: "reviewer_user_id",
      PERSONNEL: "personnel_user_id",
      COMMITTEE: "committee_user_id",
    } as const;
    const ownerFieldName = ownerField[data.stage as keyof typeof ownerField];

    if (!stageTableName || !ownerFieldName) return rows;

    const admin = await getAdmin();
    const { data: assignments } = await admin
      .from(stageTableName)
      .select("*")
      .in(
        "evaluation_id",
        rows.map((row) => row.id),
      );
    const assigned = new Map(
      ((assignments ?? []) as Array<Record<string, unknown>>).map((assignment) => [
        String(assignment["evaluation_id"]),
        assignment[ownerFieldName],
      ]),
    );
    return rows.filter((row) => !assigned.get(row.id) || assigned.get(row.id) === context.userId);
  });

const notificationPermissionByStatus: Partial<Record<EvaluationStatus, string>> = {
  DRAFT: "evaluations.step2",
  FOR_REVIEW: "evaluations.review_step3",
  FOR_PROCESSING: "personnel.process",
  FOR_APPROVAL: "president.approve",
  RETURNED: "evaluations.correct",
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
  createNotification = true,
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
  const { data: updatedEvaluation, error } = await admin
    .from("evaluations")
    .update({
      status: next,
      version: expectedVersion + 1,
      correction_reason: next === "RETURNED" ? reason : undefined,
      correction_stage: next === "RETURNED" ? correctionStage : null,
      is_finalized: next === "FINALIZED" ? true : undefined,
      finalized_by: next === "FINALIZED" ? actorUserId : undefined,
      finalized_at: next === "FINALIZED" ? new Date().toISOString() : undefined,
      finalization_reason: next === "FINALIZED" ? reason : undefined,
    } as never)
    .eq("id", evaluationId)
    .eq("version", expectedVersion)
    .select("id")
    .maybeSingle();
  if (error) throw validationError(error.message);
  if (!updatedEvaluation)
    throw validationError("This evaluation changed in another session. Reload and try again.");
  const eventWrite = admin.from("evaluation_events").insert({
    evaluation_id: evaluationId,
    event_type: action,
    from_status: current.status,
    to_status: next,
    actor_user_id: actorUserId,
    reason: reason || null,
  });
  const notificationWrite = createNotification
    ? admin.from("notification_events").insert({
        evaluation_id: evaluationId,
        event_type: action,
        audience_permission:
          next === "RETURNED" && correctionStage
            ? (notificationPermissionByStatus[
                correctionStage === "SUPERVISOR_DRAFT"
                  ? "DRAFT"
                  : correctionStage === "PERSONNEL_PROCESSING"
                    ? "FOR_PROCESSING"
                    : "FOR_REVIEW"
              ] ?? "evaluations.view_history")
            : (notificationPermissionByStatus[next] ?? "evaluations.view_history"),
        title:
          next === "DRAFT"
            ? "New Evaluation Submitted"
            : next === "FOR_REVIEW"
              ? "New Evaluation Submitted"
              : next === "FOR_PROCESSING"
                ? "Evaluation Ready for Processing"
                : next === "FOR_APPROVAL"
                  ? "Evaluation Ready for Review"
                  : next === "RETURNED"
                    ? "Evaluation Returned"
                    : next === "FINALIZED"
                      ? "Performance Evaluation Finalized"
                      : "Evaluation workflow updated",
        body:
          next === "DRAFT"
            ? "A new performance evaluation has been submitted to you for review and assessment."
            : next === "FOR_REVIEW"
              ? "A performance evaluation has been submitted to you for review and assessment."
              : next === "FOR_PROCESSING"
                ? "A completed performance evaluation is ready for Personnel processing."
                : next === "FOR_APPROVAL"
                  ? "A performance evaluation is ready for your Committee review and recommendation."
                  : next === "RETURNED"
                    ? "A performance evaluation has been returned to you for correction and resubmission."
                    : next === "FINALIZED"
                      ? "Your performance evaluation has been finalized and is now complete."
                      : reason ||
                        `An evaluation entered ${next.replaceAll("_", " ").toLowerCase()}.`,
        payload: { fromStatus: current.status, toStatus: next, reason, correctionStage },
        dedupe_key: `${evaluationId}:${action}:${expectedVersion}`,
      } as never)
    : Promise.resolve({ error: null });
  const auditWrite = getActorRoles(actorUserId).then((roles) =>
    writeAudit({
      actorUserId,
      actorRole: roles.join(","),
      action,
      module: "Evaluation Workflow",
      entityType: "evaluation",
      entityId: evaluationId,
      evaluationId,
      previousValue: { status: current.status },
      newValue: { status: next },
    }),
  );
  await Promise.all([eventWrite, notificationWrite, auditWrite]);
  if (next === "FINALIZED") {
    void (async () => {
      const { ensureDevelopmentRecordsForEvaluation } =
        await import("@/features/learning-management/development.functions");
      const {
        ensureTrainingRecommendationsForEvaluation,
        ensureTrainingRequirementForCommitteeDecision,
      } = await import("@/features/training-management/training.functions");
      const { ensureSuccessionProfileForEvaluation } =
        await import("@/features/succession-planning/succession.functions");
      const { ensureRecognitionCandidatesForEvaluation } =
        await import("@/features/social-recognition/recognition.functions");
      const { queueEmployeeFinalizedStep1Email } = await import("./public.functions");
      await Promise.all([
        ensureDevelopmentRecordsForEvaluation(evaluationId),
        ensureTrainingRecommendationsForEvaluation(evaluationId),
        ensureTrainingRequirementForCommitteeDecision(evaluationId),
        ensureSuccessionProfileForEvaluation(evaluationId),
        ensureRecognitionCandidatesForEvaluation(evaluationId),
        queueEmployeeFinalizedStep1Email(evaluationId),
      ]);
    })().catch((error) => {
      console.error("[evaluation-workflow] asynchronous finalization processing failed", error);
    });
  }
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
    const contentType = match[1];
    const encoded = match[2];
    if (!contentType || !encoded) throw validationError("Invalid signature image data");
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    storagePath = `evaluations/${evaluationId}/signatures/${stage.toLowerCase()}.png`;
    const { error } = await admin.storage
      .from("employee-files")
      .upload(storagePath, bytes, { contentType, upsert: true });
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

export const saveEvaluationSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        evaluationId: z.string().uuid(),
        version: z.number().int().positive(),
        stage: z.enum([
          "RATER_STEP2",
          "REVIEWING_SUPERVISOR_STEP3",
          "PERSONNEL",
          "COMMITTEE",
          "PRESIDENT",
        ]),
        signature: z.object({
          method: z.enum(["DRAWN", "UPLOAD"]),
          data: z.string().min(2).max(700_000),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, validationError } = await import("./server-core.server");
    const permissionByStage = {
      RATER_STEP2: "evaluations.rate_supervisor",
      REVIEWING_SUPERVISOR_STEP3: "evaluations.review_step3",
      PERSONNEL: "personnel.process",
      COMMITTEE: "committee.review",
      PRESIDENT: "president.approve",
    } as const;
    await requirePermission(context.userId, permissionByStage[data.stage], "Evaluation Signature");
    const admin = await getAdmin();
    const { data: evaluation } = await admin
      .from("evaluations")
      .select("version, is_finalized")
      .eq("id", data.evaluationId)
      .maybeSingle();
    if (!evaluation || evaluation.version !== data.version || evaluation.is_finalized)
      throw validationError("This evaluation can no longer be signed");
    await saveStageSignature(
      data.evaluationId,
      data.stage,
      data.signature,
      context.userId,
      data.version,
    );
    return { ok: true, signedAt: new Date().toISOString() };
  });

export const saveRaterStep2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => raterStep2Schema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, validationError, writeAudit, getActorRoles } =
      await import("./server-core.server");
    const { computeScore } = await import("./scoring.server");
    await requirePermission(context.userId, "evaluations.step2", "Rater Step 2");
    const admin = await getAdmin();
    const { data: evaluation } = await admin
      .from("evaluations")
      .select("status,version,is_finalized,correction_stage,supervisor_user_id")
      .eq("id", data.evaluationId)
      .maybeSingle();
    if (!evaluation || evaluation.version !== data.version || evaluation.is_finalized)
      throw validationError("This evaluation can no longer be edited");
    if (evaluation.supervisor_user_id && evaluation.supervisor_user_id !== context.userId)
      throw validationError("This evaluation is assigned to another supervisor");
    if (
      evaluation.status !== "SUBMITTED" &&
      evaluation.status !== "DRAFT" &&
      !(evaluation.status === "RETURNED" && evaluation.correction_stage === "SUPERVISOR_DRAFT")
    )
      throw validationError("This evaluation is not available for Rater Step 2");
    const nextStatus = data.submit ? "FOR_REVIEW" : "DRAFT";
    if (!(transitions[evaluation.status as EvaluationStatus] ?? []).includes(nextStatus))
      throw validationError(
        `Invalid workflow transition from ${evaluation.status} to ${nextStatus}`,
      );
    const workflowDate = new Date().toISOString().slice(0, 10);
    const submissionDate = data.submit ? data.date || workflowDate : data.date || "";
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
        supervisor_step2_overall_explanation: data.overallExplanation,
        supervisor_step2_effectiveness: data.effectiveness,
        supervisor_step2_development_potential: data.developmentPotential,
        supervisor_step2_advancement_outlook: data.advancementOutlook,
        supervisor_step2_growth_suggestions: data.growthSuggestions,
        supervisor_step2_transfer_interest: data.transferInterest,
        supervisor_step2_transfer_job: data.transferJob,
        supervisor_step2_transfer_where: data.transferWhere,
        supervisor_step2_transfer_qualified: data.transferQualified,
        supervisor_step2_other_comments: data.otherComments,
        supervisor_step2_date: submissionDate || null,
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
    const eventWrite = admin.from("evaluation_events").insert({
      evaluation_id: data.evaluationId,
      event_type: data.submit ? "RATER_STEP2_SUBMITTED" : "RATER_STEP2_DRAFT_SAVED",
      from_status: evaluation.status,
      to_status: nextStatus,
      actor_user_id: context.userId,
    });
    const auditWrite = getActorRoles(context.userId).then((roles) =>
      writeAudit({
      actorUserId: context.userId,
      actorRole: roles.join(","),
      action: data.submit ? "RATER_STEP2_SUBMITTED" : "RATER_STEP2_DRAFT_SAVED",
      module: "Evaluation Workflow",
      entityType: "evaluation",
      entityId: data.evaluationId,
      evaluationId: data.evaluationId,
      previousValue: { status: evaluation.status },
      newValue: { status: nextStatus },
      }),
    );
    const notificationWrite = data.submit
      ? admin.from("notification_events").insert({
        evaluation_id: data.evaluationId,
        event_type: "RATER_STEP2_SUBMITTED",
        audience_permission: "evaluations.review_step3",
        title: "New Evaluation Submitted",
        body: "A performance evaluation has been submitted to you for review and assessment.",
        dedupe_key: `${data.evaluationId}:RATER_STEP2_SUBMITTED:${data.version}`,
      } as never);
      : Promise.resolve({ error: null });
    const signatureWrite = data.signature
      ? saveStageSignature(
          data.evaluationId,
          "RATER_STEP2",
          data.signature,
          context.userId,
          data.version,
        )
      : Promise.resolve();
    await Promise.all([eventWrite, auditWrite, notificationWrite, signatureWrite]);
    return { ok: true, submitted: data.submit };
  });

export const enterReviewingSupervisorStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
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
      "FOR_REVIEW",
      context.userId,
      "REVIEWING_SUPERVISOR_REVIEW_STARTED",
    );
  });

export const submitReviewingSupervisor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => reviewingSupervisorReviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, validationError, upsertReviewingSupervisorRatings } =
      await import("./server-core.server");
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
      evaluation?.status === "RETURNED" &&
      evaluation.correction_stage !== "REVIEWING_SUPERVISOR_REVIEW"
    )
      throw validationError("This evaluation is assigned to another correction stage");
    if (data.ratings.length > 0)
      await upsertReviewingSupervisorRatings(
        data.evaluationId,
        data.ratings,
        context.userId,
        data.submit,
      );
    const workflowDate = new Date().toISOString().slice(0, 10);
    const submissionDate = data.submit ? data.date || workflowDate : data.date || "";

    const nextStatus: EvaluationStatus = data.submit ? "FOR_PROCESSING" : "FOR_REVIEW";

    const result = await transition(
      data.evaluationId,
      data.version,
      nextStatus,
      context.userId,
      "REVIEWING_SUPERVISOR_SUBMITTED",
      "",
      null,
      data.submit,
    );
    const stageWrite = admin.from("reviewing_supervisor_reviews").upsert(
      {
        evaluation_id: data.evaluationId,
        reviewer_user_id: context.userId,
        comments: data.comments,
        recommendations: data.recommendations,
        reviewing_supervisor_date: submissionDate || null,
        status: data.submit ? "SUBMITTED" : "DRAFT",
        submitted_at: data.submit ? new Date().toISOString() : null,
        version: data.version,
      } as never,
      { onConflict: "evaluation_id" },
    );
    const signatureWrite = data.signature
      ? saveStageSignature(
        data.evaluationId,
        "REVIEWING_SUPERVISOR_STEP3",
        data.signature,
        context.userId,
        data.version,
        )
      : Promise.resolve();
    const [{ error: stageError }] = await Promise.all([stageWrite, signatureWrite]);
    if (stageError) throw validationError(stageError.message);
    return result;
  });

export const submitPersonnelProcessing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => personnelProcessingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, validationError } = await import("./server-core.server");
    const { computeScore } = await import("./scoring.server");
    await requirePermission(context.userId, "personnel.process", "Personnel Processing");
    if (data.submit && !data.signature)
      throw validationError("A Personnel Office signature is required before submission");
    const score = await computeScore(data.evaluationId);
    if (
      data.submit &&
      (score.status !== "CALCULATED" || score.finalScore === null || !score.finalRatingLabel)
    )
      throw validationError(
        score.notes ||
          "Complete Employee, Supervisor, and Reviewing Supervisor ratings before submission",
      );
    const admin = await getAdmin();
    const { data: evaluation } = await admin
      .from("evaluations")
      .select("status,correction_stage")
      .eq("id", data.evaluationId)
      .maybeSingle();
    if (evaluation?.status === "RETURNED" && evaluation.correction_stage !== "PERSONNEL_PROCESSING")
      throw validationError("This evaluation is assigned to another correction stage");
    const workflowDate = new Date().toISOString().slice(0, 10);
    const submissionDate = data.submit
      ? data.lastIncreaseDate || workflowDate
      : data.lastIncreaseDate || null;
    const result = await transition(
      data.evaluationId,
      data.version,
      data.submit ? "FOR_REVIEW" : "FOR_PROCESSING",
      context.userId,
      "PERSONNEL_SUBMITTED",
      "",
      null,
      data.submit,
    );
    const stageWrite = admin.from("personnel_processing").upsert(
      {
        evaluation_id: data.evaluationId,
        personnel_user_id: context.userId,
        present_salary: data.presentSalary,
        last_increase_date: submissionDate,
        last_increase_nature: data.lastIncreaseNature,
        last_increase_amount: data.lastIncreaseAmount,
        total_points: score.finalScore,
        adjective_rating: score.finalRatingLabel ?? "",
        recommended_increase_bonus: data.recommendedIncreaseBonus,
        status: data.submit ? "SUBMITTED" : "DRAFT",
        submitted_at: data.submit ? new Date().toISOString() : null,
        version: data.version,
      } as never,
      { onConflict: "evaluation_id" },
    );
    const signatureWrite = data.submit
      ? saveStageSignature(
        data.evaluationId,
        "PERSONNEL",
        data.signature,
        context.userId,
        data.version,
        )
      : Promise.resolve();
    const [{ error: stageError }] = await Promise.all([stageWrite, signatureWrite]);
    if (stageError) throw validationError(stageError.message);
    return result;
  });

export const submitCommitteeReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => committeeReviewSchema.parse(input))
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
    if (evaluation?.status === "RETURNED" && evaluation.correction_stage !== "COMMITTEE_REVIEW")
      throw validationError("This evaluation is assigned to another correction stage");
    const result = await transition(
      data.evaluationId,
      data.version,
      data.submit ? "FOR_APPROVAL" : "FOR_REVIEW",
      context.userId,
      "COMMITTEE_SUBMITTED",
      "",
      null,
      data.submit,
    );
    const stageWrite = admin.from("committee_reviews").upsert(
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
    const signatureWrite = data.submit
      ? saveStageSignature(
        data.evaluationId,
        "COMMITTEE",
        data.signature,
        context.userId,
        data.version,
        )
      : Promise.resolve();
    const [{ error: stageError }] = await Promise.all([stageWrite, signatureWrite]);
    if (stageError) throw validationError(stageError.message);
    return result;
  });

export const approveEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => presidentApprovalSchema.parse(input))
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
    if (data.approve && evaluation?.status !== "FOR_APPROVAL")
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
      data.approve ? "FINALIZED" : "RETURNED",
      context.userId,
      data.approve ? "PRESIDENT_APPROVED" : "PRESIDENT_RETURNED",
      data.reason,
      data.correctionStage ?? null,
    );
  });

export const resubmitForCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
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
    if (evaluation?.status !== "RETURNED" || evaluation.correction_stage !== data.stage)
      throw validationError("This evaluation is not waiting for the selected re-review stage");
    const nextStatus: EvaluationStatus =
      data.stage === "SUPERVISOR_DRAFT"
        ? "DRAFT"
        : data.stage === "PERSONNEL_PROCESSING"
          ? "FOR_PROCESSING"
          : "FOR_REVIEW";
    return transition(
      data.evaluationId,
      data.version,
      nextStatus,
      context.userId,
      "EVALUATION_RESUBMITTED",
    );
  });
