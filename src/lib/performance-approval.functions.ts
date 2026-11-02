import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdmin, hasPermission, requirePermission } from "@/lib/server-core.server";

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

export const getPerformanceApprovalQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => queueInputSchema.parse(input))
  .handler(async ({ context, data }): Promise<PerformanceApprovalQueueRow[]> => {
    await requirePermission(context.userId, requiredPermission(data.lane));
    const admin = await getAdmin();
    let query = admin
      .from("employee_evaluations")
      .select(
        "id, status, submitted_at, weighted_score, employee_id, evaluation_period_id, department_id, department_head_user_id, assigned_supervisor_user_id, finalized_at",
      )
      .in("status", laneStatuses(data.lane))
      .order("updated_at", { ascending: false });
    if (data.lane.startsWith("DEPARTMENT_"))
      query = query.eq("department_head_user_id", context.userId);

    const { data: evaluations, error } = await query;
    if (error) throw new Error(`Could not load approval queue: ${error.message}`);
    if (!evaluations?.length) return [];

    const rows = evaluations as WorkflowRow[];
    const employeeIds = [...new Set(rows.map((row) => row.employee_id))];
    const periodIds = [...new Set(rows.map((row) => row.evaluation_period_id))];
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
      { data: employees, error: employeeError },
      { data: periods, error: periodError },
      { data: supervisorAssessments, error: supervisorError },
      { data: users, error: usersError },
      { data: approvals, error: approvalError },
    ] = await Promise.all([
      admin
        .from("employees")
        .select("id, employee_number, full_name, job_title, division, section")
        .in("id", employeeIds),
      admin.from("evaluation_periods").select("id, name").in("id", periodIds),
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
        .eq("action", "DEPARTMENT_HEAD_APPROVED"),
    ]);
    if (employeeError)
      throw new Error(`Could not load evaluation employees: ${employeeError.message}`);
    if (periodError) throw new Error(`Could not load evaluation periods: ${periodError.message}`);
    if (supervisorError)
      throw new Error(`Could not load supervisor scores: ${supervisorError.message}`);
    if (usersError) throw new Error(`Could not load reviewer names: ${usersError.message}`);
    if (approvalError)
      throw new Error(`Could not load Department Head approval dates: ${approvalError.message}`);

    const employeeById = new Map((employees ?? []).map((employee) => [employee.id, employee]));
    const periodById = new Map((periods ?? []).map((period) => [period.id, period.name]));
    const supervisorByEvaluation = new Map(
      (supervisorAssessments ?? []).map((assessment) => [
        assessment.employee_evaluation_id,
        assessment.weighted_score,
      ]),
    );
    const userById = new Map((users ?? []).map((user) => [user.id, user.full_name]));
    const approvedAtByEvaluation = new Map(
      (approvals ?? []).map((approval) => [approval.employee_evaluation_id, approval.occurred_at]),
    );

    return rows.flatMap((evaluation) => {
      const employee = employeeById.get(evaluation.employee_id);
      if (!employee) return [];
      return [
        {
          id: evaluation.id,
          reference: evaluation.id.slice(0, 8).toUpperCase(),
          employeeName: employee.full_name,
          employeeNumber: employee.employee_number,
          position: employee.job_title || "Not specified",
          department:
            [employee.division, employee.section].filter(Boolean).join(" / ") || "Not specified",
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
  categories: Array<{ id: string; name: string; weight: number }>;
  supervisorOverallComments: string;
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
        lane: z.enum(["DEPARTMENT", "HR"]),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<PerformanceApprovalDetail> => {
    await requirePermission(
      context.userId,
      data.lane === "DEPARTMENT"
        ? "performance.department_approval.view"
        : "performance.hr_validation.view",
    );
    const admin = await getAdmin();
    const { data: row, error } = await admin
      .from("employee_evaluations")
      .select(
        "id, employee_id, evaluation_period_id, template_id, status, submitted_at, weighted_score, department_id, department_head_user_id, assigned_supervisor_user_id, finalized_at",
      )
      .eq("id", data.evaluationId)
      .maybeSingle();
    if (error) throw new Error(`Could not load evaluation: ${error.message}`);
    if (!row) throw new Error("The requested evaluation could not be found.");
    if (data.lane === "DEPARTMENT" && row.department_head_user_id !== context.userId)
      throw new Error("This evaluation is outside your authorized department.");

    const [
      { data: employee, error: employeeError },
      { data: period, error: periodError },
      { data: profile, error: profileError },
      { data: categories, error: categoryError },
      { data: employeeRatings, error: employeeRatingsError },
      { data: supervisor, error: supervisorError },
      { data: history, error: historyError },
    ] = await Promise.all([
      admin
        .from("employees")
        .select("id, employee_number, full_name, job_title, division, section")
        .eq("id", row.employee_id)
        .single(),
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
    ]);
    if (employeeError) throw new Error(`Could not load employee details: ${employeeError.message}`);
    if (periodError) throw new Error(`Could not load evaluation period: ${periodError.message}`);
    if (profileError) throw new Error(`Could not load evaluation profile: ${profileError.message}`);
    if (categoryError)
      throw new Error(`Could not load evaluation categories: ${categoryError.message}`);
    if (employeeRatingsError)
      throw new Error(`Could not load employee assessment: ${employeeRatingsError.message}`);
    if (supervisorError)
      throw new Error(`Could not load supervisor assessment: ${supervisorError.message}`);
    if (historyError) throw new Error(`Could not load approval history: ${historyError.message}`);

    const categoryRows = categories ?? [];
    const supervisorRatingsResult = supervisor
      ? await admin
          .from("supervisor_evaluation_ratings")
          .select("category_id, rating, comments, evidence")
          .eq("supervisor_evaluation_id", supervisor.id)
      : { data: [], error: null };
    if (supervisorRatingsResult.error)
      throw new Error(
        `Could not load supervisor ratings: ${supervisorRatingsResult.error.message}`,
      );

    const actorIds = [...new Set((history ?? []).flatMap((event) => event.actor_user_id ?? []))];
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
      employeeName: employee.full_name,
      employeeNumber: employee.employee_number,
      position: employee.job_title || "Not specified",
      department:
        [employee.division, employee.section].filter(Boolean).join(" / ") || "Not specified",
      supervisorName: supervisorName.data?.full_name ?? "Unassigned",
      departmentHeadName: headName.data?.full_name ?? "Unassigned",
      periodName: period.name,
      status: row.status,
      employeeScore: row.weighted_score,
      supervisorScore: supervisor?.weighted_score ?? null,
      submittedAt: row.submitted_at,
      departmentHeadApprovedAt:
        (history ?? []).find((event) => event.action === "DEPARTMENT_HEAD_APPROVED")?.occurred_at ??
        null,
      finalizedAt: row.finalized_at,
      profileName: profile.name,
      profileVersion: profile.version,
      employeeRatings: mapRatings(employeeRatings),
      supervisorRatings: mapRatings(supervisorRatingsResult.data),
      categories: categoryRows.map((category) => ({
        id: category.id,
        name: category.name,
        weight: Number(category.weight),
      })),
      supervisorOverallComments: supervisor?.overall_comments ?? "",
      history: (history ?? []).map((event) => ({
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
    const { data: status, error } = await admin.rpc(
      "department_head_decide_performance" as never,
      {
        _evaluation_id: data.evaluationId,
        _actor_user_id: context.userId,
        _decision: data.decision,
        _reason: data.reason ?? null,
      } as never,
    );
    if (error) throw new Error(`Could not record the Department Head decision: ${error.message}`);
    return { status: String(status) };
  });

export const decideHrEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => hrDecisionSchema.parse(input))
  .handler(async ({ context, data }) => {
    if (data.decision === "RETURN" && (!data.reason || !data.responsibleParty))
      throw new Error("A correction reason and responsible reviewer are required.");
    await requirePermission(
      context.userId,
      data.decision === "FINALIZE"
        ? "performance.hr_validation.finalize"
        : "performance.hr_validation.return",
    );
    const admin = await getAdmin();
    const { data: status, error } = await admin.rpc(
      "hr_decide_performance" as never,
      {
        _evaluation_id: data.evaluationId,
        _actor_user_id: context.userId,
        _decision: data.decision,
        _reason: data.reason ?? null,
        _responsible_party: data.responsibleParty ?? null,
      } as never,
    );
    if (error) throw new Error(`Could not record the HR decision: ${error.message}`);
    return { status: String(status) };
  });

export async function assertWorkflowPermission(userId: string, permission: string): Promise<void> {
  if (!(await hasPermission(userId, permission)))
    throw new Error("You are not authorized to access this performance workflow.");
}
