import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdmin, requirePermission } from "@/lib/server-core.server";
import type { Json } from "@/integrations/supabase/types";

type RatingSnapshot = {
  categoryId: string;
  rating: number | null;
  comments: string;
  evidence: string;
};

function isJsonRecord(value: Json | undefined): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRatingSnapshot(value: Json): RatingSnapshot[] {
  const rows = Array.isArray(value)
    ? value
    : isJsonRecord(value) && Array.isArray(value["ratings"])
      ? value["ratings"]
      : [];
  return rows.flatMap((item) => {
    if (!isJsonRecord(item)) return [];
    const categoryId = item["categoryId"];
    const rating = item["rating"];
    const comments = item["comments"];
    const evidence = item["evidence"];
    if (
      typeof categoryId !== "string" ||
      !(typeof rating === "number" || rating === null) ||
      typeof comments !== "string" ||
      typeof evidence !== "string"
    )
      return [];
    return [{ categoryId, rating, comments, evidence }];
  });
}

const queueInputSchema = z.object({
  lane: z.enum([
    "DEPARTMENT_PENDING",
    "DEPARTMENT_APPROVED",
    "DEPARTMENT_RETURNED",
    "DEPARTMENT_HISTORY",
    "HR_PENDING",
    "HR_RETURNED",
    "HR_FINALIZED",
  ]),
});
const employeeHistorySchema = z.object({});

const decisionSchema = z.object({
  evaluationId: z.string().uuid(),
  decision: z.enum(["APPROVE", "RETURN"]),
  reason: z.string().trim().max(4000).optional(),
});

const hrDecisionSchema = z.object({
  evaluationId: z.string().uuid(),
  decision: z.enum(["FINALIZE", "RETURN"]),
  reason: z.string().trim().max(4000).optional(),
  responsibleParty: z.enum(["EMPLOYEE", "SUPERVISOR", "DEPARTMENT_HEAD"]).optional(),
  checklist: z
    .object({
      employee_record: z.boolean(),
      department: z.boolean(),
      supervisor: z.boolean(),
      department_head: z.boolean(),
      evaluation_period: z.boolean(),
      profile_version: z.boolean(),
      required_ratings: z.boolean(),
      required_evidence: z.boolean(),
      department_head_approval: z.boolean(),
      no_open_corrections: z.boolean(),
    })
    .optional(),
});
const reopenSchema = z.object({
  evaluationId: z.string().uuid(),
  responsibleParty: z.enum(["EMPLOYEE", "SUPERVISOR"]),
  reason: z.string().trim().min(1).max(4000),
});

type WorkflowLane = z.infer<typeof queueInputSchema>["lane"];
type WorkflowRow = {
  id: string;
  status: string;
  submitted_at: string | null;
  weighted_score: number | null;
  employee_id: string;
  evaluation_period_id: string;
  department_id: string | null;
  department_head_user_id: string | null;
  assigned_supervisor_user_id: string | null;
  finalized_at: string | null;
  employee_name_snapshot: string;
  employee_number_snapshot: string;
  job_title_snapshot: string;
  department_label_snapshot: string;
};

function laneStatuses(lane: WorkflowLane): string[] {
  switch (lane) {
    case "DEPARTMENT_PENDING":
      return ["PENDING_DEPARTMENT_HEAD_APPROVAL"];
    case "DEPARTMENT_APPROVED":
      return ["PENDING_HR_VALIDATION", "FINALIZED"];
    case "DEPARTMENT_RETURNED":
      return ["RETURNED_BY_DEPARTMENT_HEAD"];
    case "DEPARTMENT_HISTORY":
      return [
        "PENDING_HR_VALIDATION",
        "RETURNED_BY_HR",
        "FINALIZED",
        "RETURNED_BY_DEPARTMENT_HEAD",
      ];
    case "HR_PENDING":
      return ["PENDING_HR_VALIDATION"];
    case "HR_RETURNED":
      return ["RETURNED_BY_HR"];
    case "HR_FINALIZED":
      return ["FINALIZED"];
  }
}

function requiredPermission(lane: WorkflowLane): string {
  if (lane.startsWith("DEPARTMENT_")) {
    return lane === "DEPARTMENT_APPROVED" || lane === "DEPARTMENT_HISTORY"
      ? "performance.department_history.view"
      : "performance.department_approval.view";
  }
  return lane === "HR_FINALIZED" ? "performance.history.view" : "performance.hr_validation.view";
}

export type PerformanceApprovalQueueRow = {
  id: string;
  reference: string;
  employeeName: string;
  employeeNumber: string;
  position: string;
  department: string;
  supervisorName: string;
  departmentHeadName: string;
  periodName: string;
  status: string;
  employeeScore: number | null;
  supervisorScore: number | null;
  submittedAt: string | null;
  departmentHeadApprovedAt: string | null;
  finalizedAt: string | null;
};

export const getMyPerformanceEvaluations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => employeeHistorySchema.parse(input ?? {}))
  .handler(async ({ context }) => {
    const admin = await getAdmin();
    const { data: role, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (roleError) throw new Error(`Could not verify employee access: ${roleError.message}`);
    if (role?.role !== "EMPLOYEE")
      throw new Error("Only an Employee can view personal evaluation history.");
    const { data: employee, error: employeeError } = await admin
      .from("employees")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (employeeError) throw new Error(`Could not load employee record: ${employeeError.message}`);
    if (!employee) throw new Error("Your account is not linked to an employee record.");
    const { data: evaluations, error } = await admin
      .from("employee_evaluations")
      .select("id, evaluation_period_id, status, submitted_at, weighted_score, finalized_at")
      .eq("employee_id", employee.id)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(`Could not load your evaluation history: ${error.message}`);
    if (!evaluations?.length) return [];
    const periodIds = [
      ...new Set(evaluations.map((evaluation) => evaluation.evaluation_period_id)),
    ];
    const evaluationIds = evaluations.map((evaluation) => evaluation.id);
    const [{ data: periods, error: periodError }, { data: supervisorScores, error: scoreError }] =
      await Promise.all([
        admin.from("evaluation_periods").select("id, name").in("id", periodIds),
        admin
          .from("supervisor_evaluations")
          .select("employee_evaluation_id, weighted_score")
          .in("employee_evaluation_id", evaluationIds),
      ]);
    if (periodError)
      throw new Error(`Could not load your evaluation period names: ${periodError.message}`);
    if (scoreError) throw new Error(`Could not load Supervisor scores: ${scoreError.message}`);
    const periodNames = new Map((periods ?? []).map((period) => [period.id, period.name]));
    const scores = new Map(
      (supervisorScores ?? []).map((row) => [row.employee_evaluation_id, row.weighted_score]),
    );
    return evaluations.map((evaluation) => ({
      id: evaluation.id,
      reference: evaluation.id.slice(0, 8).toUpperCase(),
      periodName: periodNames.get(evaluation.evaluation_period_id) ?? "Unknown period",
      status: evaluation.status,
      employeeScore: evaluation.weighted_score,
      supervisorScore: scores.get(evaluation.id) ?? null,
      submittedAt: evaluation.submitted_at,
      finalizedAt: evaluation.finalized_at,
    }));
  });

export const getPerformanceApprovalQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => queueInputSchema.parse(input))
  .handler(async ({ context, data }): Promise<PerformanceApprovalQueueRow[]> => {
    await requirePermission(context.userId, requiredPermission(data.lane));
    const admin = await getAdmin();
    let query = admin
      .from("employee_evaluations")
      .select(
        "id, status, submitted_at, weighted_score, employee_id, evaluation_period_id, department_id, department_head_user_id, assigned_supervisor_user_id, finalized_at, employee_name_snapshot, employee_number_snapshot, job_title_snapshot, department_label_snapshot",
      )
      .in("status", laneStatuses(data.lane))
      .order("updated_at", { ascending: false });
    if (data.lane.startsWith("DEPARTMENT_"))
      query = query.eq("department_head_user_id", context.userId);

    const { data: evaluations, error } = await query;
    if (error) throw new Error(`Could not load approval queue: ${error.message}`);
    if (!evaluations?.length) return [];

    const rows = evaluations as WorkflowRow[];
    const periodIds = [...new Set(rows.map((row) => row.evaluation_period_id))];
    const departmentIds = [
      ...new Set(rows.map((row) => row.department_id).filter((id): id is string => Boolean(id))),
    ];
    const evaluationIds = rows.map((row) => row.id);
    const relatedUserIds = [
      ...new Set(
        rows.flatMap((row) =>
          [row.assigned_supervisor_user_id, row.department_head_user_id].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      ),
    ];
    const [
      { data: periods, error: periodError },
      { data: departments, error: departmentError },
      { data: supervisorAssessments, error: supervisorError },
      { data: users, error: usersError },
      { data: approvals, error: approvalError },
    ] = await Promise.all([
      admin.from("evaluation_periods").select("id, name").in("id", periodIds),
      departmentIds.length
        ? admin.from("performance_departments").select("id, label").in("id", departmentIds)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("supervisor_evaluations")
        .select("employee_evaluation_id, weighted_score")
        .in("employee_evaluation_id", evaluationIds),
      relatedUserIds.length
        ? admin.from("internal_users").select("id, full_name").in("id", relatedUserIds)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("performance_workflow_events")
        .select("employee_evaluation_id, occurred_at")
        .in("employee_evaluation_id", evaluationIds)
        .eq("action", "DEPARTMENT_HEAD_APPROVED")
        .order("occurred_at", { ascending: false }),
    ]);
    if (periodError) throw new Error(`Could not load evaluation periods: ${periodError.message}`);
    if (departmentError)
      throw new Error(`Could not load evaluation departments: ${departmentError.message}`);
    if (supervisorError)
      throw new Error(`Could not load supervisor scores: ${supervisorError.message}`);
    if (usersError) throw new Error(`Could not load reviewer names: ${usersError.message}`);
    if (approvalError)
      throw new Error(`Could not load Department Head approval dates: ${approvalError.message}`);

    const periodById = new Map((periods ?? []).map((period) => [period.id, period.name]));
    const departmentById = new Map(
      (departments ?? []).map((department) => [department.id, department.label]),
    );
    const supervisorByEvaluation = new Map(
      (supervisorAssessments ?? []).map((assessment) => [
        assessment.employee_evaluation_id,
        assessment.weighted_score,
      ]),
    );
    const userById = new Map((users ?? []).map((user) => [user.id, user.full_name]));
    const approvedAtByEvaluation = new Map<string, string>();
    for (const approval of approvals ?? []) {
      if (!approvedAtByEvaluation.has(approval.employee_evaluation_id))
        approvedAtByEvaluation.set(approval.employee_evaluation_id, approval.occurred_at);
    }

    return rows.flatMap((evaluation) => {
      return [
        {
          id: evaluation.id,
          reference: evaluation.id.slice(0, 8).toUpperCase(),
          employeeName: evaluation.employee_name_snapshot || "Unknown employee",
          employeeNumber: evaluation.employee_number_snapshot || "Unknown ID",
          position: evaluation.job_title_snapshot || "Not specified",
          department:
            evaluation.department_label_snapshot ||
            (evaluation.department_id
              ? (departmentById.get(evaluation.department_id) ?? "Not specified")
              : "Not specified"),
          supervisorName: evaluation.assigned_supervisor_user_id
            ? (userById.get(evaluation.assigned_supervisor_user_id) ?? "Unassigned")
            : "Unassigned",
          departmentHeadName: evaluation.department_head_user_id
            ? (userById.get(evaluation.department_head_user_id) ?? "Unassigned")
            : "Unassigned",
          periodName: periodById.get(evaluation.evaluation_period_id) ?? "Unknown period",
          status: evaluation.status,
          employeeScore: evaluation.weighted_score,
          supervisorScore: supervisorByEvaluation.get(evaluation.id) ?? null,
          submittedAt: evaluation.submitted_at,
          departmentHeadApprovedAt: approvedAtByEvaluation.get(evaluation.id) ?? null,
          finalizedAt: evaluation.finalized_at,
        },
      ];
    });
  });

export type PerformanceApprovalDetail = PerformanceApprovalQueueRow & {
  profileName: string;
  profileVersion: number;
  employeeRatings: {
    ratings: Record<string, number | null>;
    comments: Record<string, string>;
    evidence: Record<string, string>;
  };
  supervisorRatings: {
    ratings: Record<string, number | null>;
    comments: Record<string, string>;
    evidence: Record<string, string>;
  };
  categories: Array<{ id: string; name: string; weight: number; requiresEvidence: boolean }>;
  supervisorOverallComments: string;
  submissionHistory: Array<{
    stage: "Employee" | "Supervisor";
    submissionNumber: number;
    submittedAt: string;
    submittedBy: string;
    weightedScore: number;
    ratings: Array<RatingSnapshot & { categoryName: string }>;
  }>;
  history: Array<{
    actorName: string;
    role: string;
    action: string;
    previousStatus: string;
    newStatus: string;
    reason: string | null;
    occurredAt: string;
  }>;
};

export const getPerformanceApprovalDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        evaluationId: z.string().uuid(),
        lane: z.enum(["DEPARTMENT", "HR", "EMPLOYEE"]),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<PerformanceApprovalDetail> => {
    if (data.lane === "DEPARTMENT")
      await requirePermission(context.userId, "performance.department_approval.view");
    else if (data.lane === "HR")
      await requirePermission(context.userId, "performance.hr_validation.view");
    const admin = await getAdmin();
    const { data: row, error } = await admin
      .from("employee_evaluations")
      .select(
        "id, employee_id, evaluation_period_id, template_id, template_version_snapshot, status, submitted_at, weighted_score, department_id, department_head_user_id, assigned_supervisor_user_id, finalized_at, employee_name_snapshot, employee_number_snapshot, job_title_snapshot, department_label_snapshot",
      )
      .eq("id", data.evaluationId)
      .maybeSingle();
    if (error) throw new Error(`Could not load evaluation: ${error.message}`);
    if (!row) throw new Error("The requested evaluation could not be found.");
    if (data.lane === "DEPARTMENT" && row.department_head_user_id !== context.userId)
      throw new Error("This evaluation is outside your authorized department.");
    if (data.lane === "EMPLOYEE") {
      const { data: employee, error: employeeError } = await admin
        .from("employees")
        .select("id")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (employeeError)
        throw new Error(`Could not verify employee ownership: ${employeeError.message}`);
      if (!employee || employee.id !== row.employee_id)
        throw new Error("This evaluation does not belong to your employee account.");
    }

    const [
      { data: employee, error: employeeError },
      { data: department, error: departmentError },
      { data: period, error: periodError },
      { data: profile, error: profileError },
      { data: categories, error: categoryError },
      { data: employeeRatings, error: employeeRatingsError },
      { data: supervisor, error: supervisorError },
      { data: history, error: historyError },
      { data: legacyHistory, error: legacyHistoryError },
      { data: employeeSubmissions, error: employeeSubmissionsError },
    ] = await Promise.all([
      admin
        .from("employees")
        .select("id, employee_number, full_name, job_title, division, section")
        .eq("id", row.employee_id)
        .single(),
      row.department_id
        ? admin
            .from("performance_departments")
            .select("label")
            .eq("id", row.department_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      admin.from("evaluation_periods").select("name").eq("id", row.evaluation_period_id).single(),
      admin.from("evaluation_templates").select("name, version").eq("id", row.template_id).single(),
      admin
        .from("evaluation_template_categories")
        .select("id, name, weight")
        .eq("template_id", row.template_id)
        .order("position"),
      admin
        .from("employee_evaluation_ratings")
        .select("category_id, rating, comments, evidence")
        .eq("employee_evaluation_id", row.id),
      admin
        .from("supervisor_evaluations")
        .select("id, status, weighted_score, overall_comments, supervisor_user_id")
        .eq("employee_evaluation_id", row.id)
        .maybeSingle(),
      admin
        .from("performance_workflow_events")
        .select(
          "actor_user_id, actor_role, action, previous_status, new_status, reason, occurred_at",
        )
        .eq("employee_evaluation_id", row.id)
        .order("occurred_at", { ascending: true }),
      admin
        .from("evaluation_audit_logs")
        .select("actor_user_id, action, previous_value, new_value, occurred_at")
        .eq("employee_evaluation_id", row.id)
        .in("action", [
          "SELF_EVALUATION_SUBMITTED",
          "SELF_EVALUATION_RESUBMITTED",
          "SELF_EVALUATION_DRAFT_SAVED",
        ])
        .order("occurred_at", { ascending: true }),
      admin
        .from("employee_evaluation_submissions")
        .select(
          "submission_number, submitted_at, submitted_by, weighted_score, assessment_snapshot",
        )
        .eq("employee_evaluation_id", row.id)
        .order("submission_number"),
    ]);
    if (employeeError) throw new Error(`Could not load employee details: ${employeeError.message}`);
    if (departmentError)
      throw new Error(`Could not load the saved department: ${departmentError.message}`);
    if (periodError) throw new Error(`Could not load evaluation period: ${periodError.message}`);
    if (profileError) throw new Error(`Could not load evaluation profile: ${profileError.message}`);
    if (categoryError)
      throw new Error(`Could not load evaluation categories: ${categoryError.message}`);
    if (employeeRatingsError)
      throw new Error(`Could not load employee assessment: ${employeeRatingsError.message}`);
    if (supervisorError)
      throw new Error(`Could not load supervisor assessment: ${supervisorError.message}`);
    if (historyError) throw new Error(`Could not load approval history: ${historyError.message}`);
    if (legacyHistoryError)
      throw new Error(`Could not load original evaluation history: ${legacyHistoryError.message}`);
    if (employeeSubmissionsError)
      throw new Error(
        `Could not load Employee submission snapshots: ${employeeSubmissionsError.message}`,
      );

    const categoryRows = categories ?? [];
    const { data: evidenceRequirements, error: evidenceError } = categoryRows.length
      ? await admin
          .from("evaluation_evidence_requirements")
          .select("category_id, is_required")
          .in(
            "category_id",
            categoryRows.map((category) => category.id),
          )
      : { data: [], error: null };
    if (evidenceError)
      throw new Error(`Could not load evidence requirements: ${evidenceError.message}`);
    const supervisorRatingsResult = supervisor
      ? await admin
          .from("supervisor_evaluation_ratings")
          .select("category_id, rating, comments, evidence")
          .eq("supervisor_evaluation_id", supervisor.id)
      : { data: [], error: null };
    const supervisorSubmissionsResult = supervisor
      ? await admin
          .from("supervisor_evaluation_submissions")
          .select(
            "submission_number, submitted_at, submitted_by, weighted_score, assessment_snapshot",
          )
          .eq("supervisor_evaluation_id", supervisor.id)
          .order("submission_number")
      : { data: [], error: null };
    if (supervisorRatingsResult.error)
      throw new Error(
        `Could not load supervisor ratings: ${supervisorRatingsResult.error.message}`,
      );
    if (supervisorSubmissionsResult.error)
      throw new Error(
        `Could not load Supervisor submission snapshots: ${supervisorSubmissionsResult.error.message}`,
      );
    const submissionActorIds = [
      ...(employeeSubmissions ?? []).map((submission) => submission.submitted_by),
      ...(supervisorSubmissionsResult.data ?? []).map((submission) => submission.submitted_by),
    ];

    const actorIds = [
      ...new Set(
        [...(history ?? []), ...(legacyHistory ?? [])]
          .flatMap((event) => (event.actor_user_id ? [event.actor_user_id] : []))
          .concat(submissionActorIds),
      ),
    ];
    const actorResult = actorIds.length
      ? await admin.from("internal_users").select("id, full_name").in("id", actorIds)
      : { data: [], error: null };
    if (actorResult.error)
      throw new Error(`Could not load approval actors: ${actorResult.error.message}`);
    const actorNames = new Map(
      (actorResult.data ?? []).map((actor) => [actor.id, actor.full_name]),
    );

    const mapRatings = (
      ratings: Array<{
        category_id: string;
        rating: number | null;
        comments: string;
        evidence: string;
      }> | null,
    ) => {
      const byId = new Map((ratings ?? []).map((rating) => [rating.category_id, rating]));
      return {
        ratings: Object.fromEntries(
          categoryRows.map((category) => [category.id, byId.get(category.id)?.rating ?? null]),
        ),
        comments: Object.fromEntries(
          categoryRows.map((category) => [category.id, byId.get(category.id)?.comments ?? ""]),
        ),
        evidence: Object.fromEntries(
          categoryRows.map((category) => [category.id, byId.get(category.id)?.evidence ?? ""]),
        ),
      };
    };

    const supervisorName = row.assigned_supervisor_user_id
      ? await admin
          .from("internal_users")
          .select("full_name")
          .eq("id", row.assigned_supervisor_user_id)
          .maybeSingle()
      : { data: null, error: null };
    const headName = row.department_head_user_id
      ? await admin
          .from("internal_users")
          .select("full_name")
          .eq("id", row.department_head_user_id)
          .maybeSingle()
      : { data: null, error: null };
    if (supervisorName.error || headName.error)
      throw new Error("Could not verify the assigned reviewers.");

    return {
      id: row.id,
      reference: row.id.slice(0, 8).toUpperCase(),
      employeeName: row.employee_name_snapshot || employee.full_name,
      employeeNumber: row.employee_number_snapshot || employee.employee_number,
      position: row.job_title_snapshot || employee.job_title || "Not specified",
      department: row.department_label_snapshot || department?.label || "Not specified",
      supervisorName: supervisorName.data?.full_name ?? "Unassigned",
      departmentHeadName: headName.data?.full_name ?? "Unassigned",
      periodName: period.name,
      status: row.status,
      employeeScore: row.weighted_score,
      supervisorScore: supervisor?.weighted_score ?? null,
      submittedAt: row.submitted_at,
      departmentHeadApprovedAt:
        [...(history ?? [])].reverse().find((event) => event.action === "DEPARTMENT_HEAD_APPROVED")
          ?.occurred_at ?? null,
      finalizedAt: row.finalized_at,
      profileName: profile.name,
      profileVersion: row.template_version_snapshot,
      employeeRatings: mapRatings(employeeRatings),
      supervisorRatings: mapRatings(supervisorRatingsResult.data),
      categories: categoryRows.map((category) => ({
        id: category.id,
        name: category.name,
        weight: Number(category.weight),
        requiresEvidence: (evidenceRequirements ?? []).some(
          (requirement) => requirement.category_id === category.id && requirement.is_required,
        ),
      })),
      supervisorOverallComments: supervisor?.overall_comments ?? "",
      submissionHistory: [
        ...(employeeSubmissions ?? []).map((submission) => ({
          stage: "Employee" as const,
          submissionNumber: submission.submission_number,
          submittedAt: submission.submitted_at,
          submittedBy: actorNames.get(submission.submitted_by) ?? "Former user",
          weightedScore: submission.weighted_score,
          ratings: readRatingSnapshot(submission.assessment_snapshot).map((snapshot) => ({
            ...snapshot,
            categoryName:
              categoryRows.find((category) => category.id === snapshot.categoryId)?.name ??
              "Unknown category",
          })),
        })),
        ...(supervisorSubmissionsResult.data ?? []).map((submission) => ({
          stage: "Supervisor" as const,
          submissionNumber: submission.submission_number,
          submittedAt: submission.submitted_at,
          submittedBy: actorNames.get(submission.submitted_by) ?? "Former user",
          weightedScore: submission.weighted_score,
          ratings: readRatingSnapshot(submission.assessment_snapshot).map((snapshot) => ({
            ...snapshot,
            categoryName:
              categoryRows.find((category) => category.id === snapshot.categoryId)?.name ??
              "Unknown category",
          })),
        })),
      ].sort((left, right) => left.submittedAt.localeCompare(right.submittedAt)),
      history: [
        ...(history ?? []).map((event) => ({
          actorName: event.actor_user_id
            ? (actorNames.get(event.actor_user_id) ?? "Former user")
            : "System",
          role: event.actor_role,
          action: event.action,
          previousStatus: event.previous_status,
          newStatus: event.new_status,
          reason: event.reason,
          occurredAt: event.occurred_at,
        })),
        ...(legacyHistory ?? []).map((event) => {
          const previousStatus =
            event.previous_value &&
            typeof event.previous_value === "object" &&
            "status" in event.previous_value
              ? String(event.previous_value["status"] ?? "")
              : "";
          const newStatus =
            event.new_value && typeof event.new_value === "object" && "status" in event.new_value
              ? String(event.new_value["status"] ?? "")
              : "";
          return {
            actorName: event.actor_user_id
              ? (actorNames.get(event.actor_user_id) ?? "Former user")
              : "System",
            role: event.action.startsWith("SELF_EVALUATION") ? "EMPLOYEE" : "SUPERVISOR",
            action: event.action,
            previousStatus,
            newStatus,
            reason: null,
            occurredAt: event.occurred_at,
          };
        }),
      ].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)),
    };
  });

export const decideDepartmentHeadEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => decisionSchema.parse(input))
  .handler(async ({ context, data }) => {
    if (data.decision === "RETURN" && !data.reason)
      throw new Error("A reason is required when returning an evaluation.");
    await requirePermission(
      context.userId,
      data.decision === "APPROVE"
        ? "performance.department_approval.approve"
        : "performance.department_approval.return",
    );
    const admin = await getAdmin();
    const { data: status, error } = await admin.rpc("department_head_decide_performance", {
      _evaluation_id: data.evaluationId,
      _actor_user_id: context.userId,
      _decision: data.decision,
      _reason: data.reason ?? null,
    });
    if (error) throw new Error(`Could not record the Department Head decision: ${error.message}`);
    return { status: String(status) };
  });

export const decideHrEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => hrDecisionSchema.parse(input))
  .handler(async ({ context, data }) => {
    if (data.decision === "RETURN" && (!data.reason || !data.responsibleParty))
      throw new Error("A correction reason and responsible reviewer are required.");
    if (
      data.decision === "FINALIZE" &&
      (!data.checklist || Object.values(data.checklist).some((checked) => !checked))
    )
      throw new Error("Complete every HR validation checklist item before finalizing.");
    await requirePermission(
      context.userId,
      data.decision === "FINALIZE"
        ? "performance.hr_validation.finalize"
        : "performance.hr_validation.return",
    );
    const admin = await getAdmin();
    const { data: status, error } = await admin.rpc("hr_decide_performance", {
      _evaluation_id: data.evaluationId,
      _actor_user_id: context.userId,
      _decision: data.decision,
      _reason: data.reason ?? null,
      _responsible_party: data.responsibleParty ?? null,
      _checklist: data.checklist ?? {},
    });
    if (error) throw new Error(`Could not record the HR decision: ${error.message}`);
    return { status: String(status) };
  });

export const reopenPerformanceEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => reopenSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requirePermission(context.userId, "performance.reopen");
    const admin = await getAdmin();
    const { data: status, error } = await admin.rpc("reopen_performance_evaluation", {
      _evaluation_id: data.evaluationId,
      _actor_user_id: context.userId,
      _responsible_party: data.responsibleParty,
      _reason: data.reason,
    });
    if (error) throw new Error(`Could not reopen the finalized evaluation: ${error.message}`);
    return { status: String(status) };
  });
