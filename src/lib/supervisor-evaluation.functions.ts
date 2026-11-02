import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeRole } from "@/lib/domain";
import {
  calculateWeightedScore,
  type EvaluationTemplate,
  type TemplateCategory,
} from "@/lib/performance-management";

const supervisorEvaluationSchema = z.object({
  evaluationId: z.string().uuid(),
  action: z.enum(["DRAFT", "SUBMIT"]),
  ratings: z.record(z.string(), z.union([z.number().int().min(1).max(5), z.null()])),
  comments: z.record(z.string(), z.string().max(4000)),
  evidence: z.record(z.string(), z.string().max(4000)),
});
const returnEmployeeSchema = z.object({
  evaluationId: z.string().uuid(),
  reason: z.string().trim().min(1).max(4000),
});

export type SupervisorEvaluationDetail = {
  evaluation: {
    id: string;
    status: string;
    submittedAt: string | null;
    weightedScore: number | null;
  };
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    position: string;
    department: string;
  };
  periodName: string;
  template: EvaluationTemplate;
  employeeRatings: {
    ratings: Record<string, number | null>;
    comments: Record<string, string>;
    evidence: Record<string, string>;
  };
  supervisorEvaluation: {
    id: string;
    status: string;
    submittedAt: string | null;
    weightedScore: number | null;
    ratings: Record<string, number | null>;
    comments: Record<string, string>;
    evidence: Record<string, string>;
  } | null;
};

async function requireSupervisor(
  admin: Awaited<ReturnType<typeof getAdminClient>>,
  userId: string,
) {
  const { data: roleRows, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(`Could not verify account role: ${error.message}`);
  const roles = (roleRows ?? []).map((row) => normalizeRole(row.role));
  if (roles.length !== 1 || roles[0] !== "SUPERVISOR")
    throw new Error("Only an account with the Supervisor role can review evaluations.");
}

async function getAdminClient() {
  const { getAdmin } = await import("@/lib/server-core.server");
  return getAdmin();
}

async function getAssignedEvaluation(
  admin: Awaited<ReturnType<typeof getAdminClient>>,
  supervisorUserId: string,
  evaluationId: string,
) {
  const { data: evaluation, error: evaluationError } = await admin
    .from("employee_evaluations")
    .select(
      "id, employee_id, evaluation_period_id, template_id, status, submitted_at, weighted_score, assigned_supervisor_user_id, department_id, department_head_user_id",
    )
    .eq("id", evaluationId)
    .maybeSingle();
  if (evaluationError)
    throw new Error(`Could not load the employee evaluation: ${evaluationError.message}`);
  if (!evaluation) throw new Error("The requested evaluation could not be found.");

  const { data: employee, error: employeeError } = await admin
    .from("employees")
    .select(
      "id, employee_number, full_name, job_title, division, section, employment_status, user_id, assigned_supervisor_user_id",
    )
    .eq("id", evaluation.employee_id)
    .maybeSingle();
  if (employeeError)
    throw new Error(`Could not verify the employee assignment: ${employeeError.message}`);
  if (
    !employee ||
    (evaluation.assigned_supervisor_user_id ?? employee.assigned_supervisor_user_id) !==
      supervisorUserId
  ) {
    throw new Error("This evaluation is not assigned to your Supervisor account.");
  }

  return { evaluation, employee };
}

async function loadEvaluationTemplate(
  admin: Awaited<ReturnType<typeof getAdminClient>>,
  templateId: string,
): Promise<EvaluationTemplate> {
  const { data: templateRow, error: templateError } = await admin
    .from("evaluation_templates")
    .select("id, name, job_position_id, version, effective_from")
    .eq("id", templateId)
    .maybeSingle();
  if (templateError)
    throw new Error(`Could not load the evaluation template: ${templateError.message}`);
  if (!templateRow) throw new Error("The evaluation template for this record is unavailable.");

  const { data: categories, error: categoryError } = await admin
    .from("evaluation_template_categories")
    .select("id, name, weight, position")
    .eq("template_id", templateId)
    .order("position", { ascending: true });
  if (categoryError)
    throw new Error(`Could not load evaluation categories: ${categoryError.message}`);
  if (!categories || categories.length !== 8)
    throw new Error("The evaluation template must contain exactly eight categories.");

  const categoryIds = categories.map((category) => category.id);
  const [{ data: indicators, error: indicatorError }, { data: evidence, error: evidenceError }] =
    await Promise.all([
      admin
        .from("evaluation_indicators")
        .select("category_id, label, position")
        .in("category_id", categoryIds)
        .order("position", { ascending: true }),
      admin
        .from("evaluation_evidence_requirements")
        .select("category_id, description, position")
        .in("category_id", categoryIds)
        .order("position", { ascending: true }),
    ]);
  if (indicatorError)
    throw new Error(`Could not load performance indicators: ${indicatorError.message}`);
  if (evidenceError)
    throw new Error(`Could not load supporting evidence guidance: ${evidenceError.message}`);

  const templateCategories: TemplateCategory[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    weight: Number(category.weight),
    indicators: (indicators ?? [])
      .filter((indicator) => indicator.category_id === category.id)
      .map((indicator) => indicator.label),
    evidence: (evidence ?? [])
      .filter((item) => item.category_id === category.id)
      .map((item) => item.description),
  }));
  const weightTotal = templateCategories.reduce((total, category) => total + category.weight, 0);
  if (Math.abs(weightTotal - 100) >= 0.0001)
    throw new Error("Evaluation category weights must total exactly 100%.");

  return {
    id: templateRow.id,
    name: templateRow.name,
    jobPosition: "",
    version: templateRow.version,
    effectiveDate: templateRow.effective_from ?? "",
    categories: templateCategories,
  };
}

function ratingMaps(
  categories: TemplateCategory[],
  ratings: Array<{
    category_id: string;
    rating: number | null;
    comments: string;
    evidence: string;
  }>,
) {
  const byCategory = new Map(ratings.map((rating) => [rating.category_id, rating]));
  return {
    ratings: Object.fromEntries(
      categories.map((category) => [category.id, byCategory.get(category.id)?.rating ?? null]),
    ),
    comments: Object.fromEntries(
      categories.map((category) => [category.id, byCategory.get(category.id)?.comments ?? ""]),
    ),
    evidence: Object.fromEntries(
      categories.map((category) => [category.id, byCategory.get(category.id)?.evidence ?? ""]),
    ),
  };
}

export const getSupervisorEvaluationDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ evaluationId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }): Promise<SupervisorEvaluationDetail> => {
    const admin = await getAdminClient();
    await requireSupervisor(admin, context.userId);

    const { evaluation, employee } = await getAssignedEvaluation(
      admin,
      context.userId,
      data.evaluationId,
    );
    if (
      ![
        "SUBMITTED",
        "PENDING_SUPERVISOR_REVIEW",
        "SUPERVISOR_IN_PROGRESS",
        "SUPERVISOR_SUBMITTED",
        "RETURNED_BY_DEPARTMENT_HEAD",
        "RETURNED_BY_HR",
        "REOPENED",
        "PENDING_DEPARTMENT_HEAD_APPROVAL",
        "PENDING_HR_VALIDATION",
        "FINALIZED",
        "COMPLETED",
      ].includes(evaluation.status)
    ) {
      throw new Error("The employee must submit this evaluation before Supervisor review.");
    }
    if (evaluation.status === "RETURNED_BY_HR" || evaluation.status === "REOPENED") {
      const { data: returnEvent, error: returnError } = await admin
        .from("performance_workflow_events")
        .select("responsible_user_id")
        .eq("employee_evaluation_id", evaluation.id)
        .in("action", ["HR_RETURNED", "HR_CORRECTION_REASSIGNED", "EVALUATION_REOPENED"])
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (returnError)
        throw new Error(`Could not verify the correction assignment: ${returnError.message}`);
      if (returnEvent?.responsible_user_id !== context.userId)
        throw new Error("This HR correction was assigned to a different reviewer.");
    }

    const [template, periodResult, employeeRatingsResult, supervisorEvaluationResult] =
      await Promise.all([
        loadEvaluationTemplate(admin, evaluation.template_id),
        admin
          .from("evaluation_periods")
          .select("name")
          .eq("id", evaluation.evaluation_period_id)
          .single(),
        admin
          .from("employee_evaluation_ratings")
          .select("category_id, rating, comments, evidence")
          .eq("employee_evaluation_id", evaluation.id),
        admin
          .from("supervisor_evaluations")
          .select("id, status, submitted_at, weighted_score, supervisor_user_id")
          .eq("employee_evaluation_id", evaluation.id)
          .maybeSingle(),
      ]);
    if (periodResult.error)
      throw new Error(`Could not load evaluation period: ${periodResult.error.message}`);
    if (employeeRatingsResult.error)
      throw new Error(`Could not load employee ratings: ${employeeRatingsResult.error.message}`);
    if (supervisorEvaluationResult.error)
      throw new Error(
        `Could not load Supervisor ratings: ${supervisorEvaluationResult.error.message}`,
      );

    const supervisorEvaluation = supervisorEvaluationResult.data;
    const { data: supervisorRatings, error: supervisorRatingsError } = supervisorEvaluation
      ? await admin
          .from("supervisor_evaluation_ratings")
          .select("category_id, rating, comments, evidence")
          .eq("supervisor_evaluation_id", supervisorEvaluation.id)
      : { data: [], error: null };
    if (supervisorRatingsError)
      throw new Error(
        `Could not load your saved Supervisor ratings: ${supervisorRatingsError.message}`,
      );
    if (
      supervisorEvaluation &&
      supervisorEvaluation.supervisor_user_id !== context.userId &&
      !["SUBMITTED", "COMPLETED"].includes(supervisorEvaluation.status)
    ) {
      throw new Error(
        "An in-progress Supervisor evaluation belongs to another Supervisor account.",
      );
    }

    return {
      evaluation: {
        id: evaluation.id,
        status: evaluation.status,
        submittedAt: evaluation.submitted_at,
        weightedScore: evaluation.weighted_score,
      },
      employee: {
        id: employee.id,
        employeeNumber: employee.employee_number,
        fullName: employee.full_name,
        position: employee.job_title || "Not specified",
        department:
          [employee.division, employee.section].filter((part) => part.trim()).join(" / ") ||
          "Not specified",
      },
      periodName: periodResult.data.name,
      template: { ...template, jobPosition: employee.job_title || "Not specified" },
      employeeRatings: ratingMaps(template.categories, employeeRatingsResult.data ?? []),
      supervisorEvaluation: supervisorEvaluation
        ? {
            id: supervisorEvaluation.id,
            status: supervisorEvaluation.status,
            submittedAt: supervisorEvaluation.submitted_at,
            weightedScore: supervisorEvaluation.weighted_score,
            ...ratingMaps(template.categories, supervisorRatings ?? []),
          }
        : null,
    };
  });

export const saveSupervisorEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => supervisorEvaluationSchema.parse(input))
  .handler(async ({ context, data }) => {
    const admin = await getAdminClient();
    await requireSupervisor(admin, context.userId);
    const { evaluation } = await getAssignedEvaluation(admin, context.userId, data.evaluationId);
    if (
      ![
        "SUBMITTED",
        "PENDING_SUPERVISOR_REVIEW",
        "SUPERVISOR_IN_PROGRESS",
        "RETURNED_BY_DEPARTMENT_HEAD",
        "RETURNED_BY_HR",
        "REOPENED",
      ].includes(evaluation.status)
    ) {
      throw new Error("This evaluation is not available for Supervisor scoring.");
    }
    if (evaluation.status === "RETURNED_BY_HR" || evaluation.status === "REOPENED") {
      const { data: returnEvent, error: returnError } = await admin
        .from("performance_workflow_events")
        .select("responsible_user_id")
        .eq("employee_evaluation_id", evaluation.id)
        .in("action", ["HR_RETURNED", "HR_CORRECTION_REASSIGNED", "EVALUATION_REOPENED"])
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (returnError)
        throw new Error(`Could not verify the correction assignment: ${returnError.message}`);
      if (returnEvent?.responsible_user_id !== context.userId)
        throw new Error("This HR correction was assigned to a different reviewer.");
    }

    const template = await loadEvaluationTemplate(admin, evaluation.template_id);
    const categoryIds = new Set(template.categories.map((category) => category.id));
    const inputCategoryIds = new Set([
      ...Object.keys(data.ratings),
      ...Object.keys(data.comments),
      ...Object.keys(data.evidence),
    ]);
    if ([...inputCategoryIds].some((id) => !categoryIds.has(id)))
      throw new Error("The evaluation contains an unknown category.");

    const { data: currentSupervisorEvaluation, error: currentError } = await admin
      .from("supervisor_evaluations")
      .select("id, status, supervisor_user_id")
      .eq("employee_evaluation_id", evaluation.id)
      .maybeSingle();
    if (currentError)
      throw new Error(`Could not load your Supervisor evaluation: ${currentError.message}`);
    if (
      currentSupervisorEvaluation &&
      ["SUBMITTED", "COMPLETED"].includes(currentSupervisorEvaluation.status)
    )
      throw new Error("Your submitted Supervisor evaluation is locked.");
    if (
      currentSupervisorEvaluation &&
      currentSupervisorEvaluation.supervisor_user_id !== context.userId
    )
      throw new Error("This in-progress evaluation belongs to another Supervisor account.");

    const { data: currentRatings, error: currentRatingsError } = currentSupervisorEvaluation
      ? await admin
          .from("supervisor_evaluation_ratings")
          .select("category_id, rating, comments, evidence")
          .eq("supervisor_evaluation_id", currentSupervisorEvaluation.id)
      : { data: [], error: null };
    if (currentRatingsError)
      throw new Error(
        `Could not load your saved Supervisor ratings: ${currentRatingsError.message}`,
      );
    const previousByCategory = new Map(
      (currentRatings ?? []).map((rating) => [rating.category_id, rating]),
    );
    const mergedRatings = Object.fromEntries(
      template.categories.map((category) => [
        category.id,
        data.ratings[category.id] ?? previousByCategory.get(category.id)?.rating ?? null,
      ]),
    );
    const score = calculateWeightedScore(template, mergedRatings);
    if (!score.templateValid) throw new Error("The evaluation category weights are invalid.");
    if (data.action === "SUBMIT" && score.score === null)
      throw new Error(
        "Select a valid rating from 1 to 5 for all eight categories before submitting.",
      );

    if (evaluation.status !== "SUPERVISOR_IN_PROGRESS") {
      const { error: transitionError } = await admin
        .from("employee_evaluations")
        .update({ status: "SUPERVISOR_IN_PROGRESS" })
        .eq("id", evaluation.id);
      if (transitionError)
        throw new Error(`Could not start Supervisor review: ${transitionError.message}`);
    }

    let supervisorEvaluationId = currentSupervisorEvaluation?.id;
    if (!supervisorEvaluationId) {
      const { data: inserted, error: insertError } = await admin
        .from("supervisor_evaluations")
        .insert({
          employee_evaluation_id: evaluation.id,
          supervisor_user_id: context.userId,
          status: "IN_PROGRESS",
        })
        .select("id")
        .single();
      if (insertError)
        throw new Error(`Could not start your Supervisor evaluation: ${insertError.message}`);
      supervisorEvaluationId = inserted.id;
    }

    const ratingRows = template.categories.map((category) => {
      const previous = previousByCategory.get(category.id);
      return {
        supervisor_evaluation_id: supervisorEvaluationId,
        category_id: category.id,
        rating: data.ratings[category.id] ?? previous?.rating ?? null,
        comments: data.comments[category.id] ?? previous?.comments ?? "",
        evidence: data.evidence[category.id] ?? previous?.evidence ?? "",
      };
    });

    const { error: ratingsError } = await admin
      .from("supervisor_evaluation_ratings")
      .upsert(ratingRows, { onConflict: "supervisor_evaluation_id,category_id" });
    if (ratingsError)
      throw new Error(`Could not save your Supervisor ratings: ${ratingsError.message}`);

    let status = "IN_PROGRESS";
    let submittedAt: string | null = null;
    if (data.action === "SUBMIT") {
      const { data: workflowStatus, error: workflowError } = await admin.rpc(
        "submit_supervisor_performance",
        {
          _evaluation_id: evaluation.id,
          _actor_user_id: context.userId,
          _weighted_score: score.score!,
          _assessment_snapshot: {
            overallComments: "",
            ratings: ratingRows.map((row) => ({
              categoryId: row.category_id,
              rating: row.rating,
              comments: row.comments,
              evidence: row.evidence,
            })),
          },
        },
      );
      if (workflowError)
        throw new Error(`Could not submit the Supervisor evaluation: ${workflowError.message}`);
      status = workflowStatus;
      submittedAt = new Date().toISOString();
    } else {
      const { error: supervisorUpdateError } = await admin
        .from("supervisor_evaluations")
        .update({ status: "IN_PROGRESS", weighted_score: null, submitted_at: null })
        .eq("id", supervisorEvaluationId);
      if (supervisorUpdateError)
        throw new Error(
          `Could not save your Supervisor evaluation: ${supervisorUpdateError.message}`,
        );
    }

    return {
      status,
      weightedScore: data.action === "SUBMIT" ? score.score : null,
      submittedAt,
    };
  });

export const returnSelfEvaluationToEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => returnEmployeeSchema.parse(input))
  .handler(async ({ context, data }) => {
    const admin = await getAdminClient();
    await requireSupervisor(admin, context.userId);
    const { evaluation } = await getAssignedEvaluation(admin, context.userId, data.evaluationId);
    if (["RETURNED_BY_HR", "REOPENED"].includes(evaluation.status)) {
      const { data: correctionEvent, error } = await admin
        .from("performance_workflow_events")
        .select("responsible_user_id")
        .eq("employee_evaluation_id", evaluation.id)
        .in("action", ["HR_RETURNED", "HR_CORRECTION_REASSIGNED", "EVALUATION_REOPENED"])
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Could not verify the correction assignment: ${error.message}`);
      if (correctionEvent?.responsible_user_id !== context.userId)
        throw new Error("This correction was assigned to a different reviewer.");
    }
    const { data: status, error } = await admin.rpc("supervisor_return_self_evaluation", {
      _evaluation_id: data.evaluationId,
      _actor_user_id: context.userId,
      _reason: data.reason,
    });
    if (error) throw new Error(`Could not return the self-evaluation: ${error.message}`);
    return { status };
  });
