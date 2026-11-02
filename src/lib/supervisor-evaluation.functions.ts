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
      "id, employee_id, evaluation_period_id, template_id, status, submitted_at, weighted_score",
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
    employee.employment_status !== "ACTIVE" ||
    employee.assigned_supervisor_user_id !== supervisorUserId
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
        "COMPLETED",
      ].includes(evaluation.status)
    ) {
      throw new Error("The employee must submit this evaluation before Supervisor review.");
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
    const { evaluation, employee } = await getAssignedEvaluation(
      admin,
      context.userId,
      data.evaluationId,
    );
    if (
      !["SUBMITTED", "PENDING_SUPERVISOR_REVIEW", "SUPERVISOR_IN_PROGRESS"].includes(
        evaluation.status,
      )
    ) {
      throw new Error("This evaluation is not available for Supervisor scoring.");
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

    const submittedAt = data.action === "SUBMIT" ? new Date().toISOString() : null;
    const { error: supervisorUpdateError } = await admin
      .from("supervisor_evaluations")
      .update({
        status: data.action === "SUBMIT" ? "SUBMITTED" : "IN_PROGRESS",
        weighted_score: data.action === "SUBMIT" ? score.score : null,
        submitted_at: submittedAt,
      })
      .eq("id", supervisorEvaluationId);
    if (supervisorUpdateError)
      throw new Error(
        `Could not update your Supervisor evaluation: ${supervisorUpdateError.message}`,
      );

    if (data.action === "SUBMIT") {
      const { error: evaluationUpdateError } = await admin
        .from("employee_evaluations")
        .update({ status: "SUPERVISOR_SUBMITTED" })
        .eq("id", evaluation.id);
      if (evaluationUpdateError)
        throw new Error(
          `Supervisor ratings were saved, but status could not be updated: ${evaluationUpdateError.message}`,
        );

      const { error: auditError } = await admin.from("evaluation_audit_logs").insert({
        employee_evaluation_id: evaluation.id,
        actor_user_id: context.userId,
        action: "SUPERVISOR_EVALUATION_SUBMITTED",
        previous_value: { status: evaluation.status },
        new_value: { status: "SUPERVISOR_SUBMITTED", weighted_score: score.score },
      });
      if (auditError)
        throw new Error(
          `Supervisor evaluation was submitted, but audit logging failed: ${auditError.message}`,
        );

      if (employee.user_id) {
        const { error: notificationError } = await admin.from("performance_notifications").insert({
          recipient_user_id: employee.user_id,
          employee_evaluation_id: evaluation.id,
          event_type: "SUPERVISOR_SUBMITTED",
          title: "Supervisor evaluation submitted",
          message: `Your supervisor completed the evaluation for ${evaluation.id}.`,
        });
        if (notificationError)
          throw new Error(
            `Supervisor evaluation was submitted, but employee notification failed: ${notificationError.message}`,
          );
      }
    }

    return {
      status: data.action === "SUBMIT" ? "SUPERVISOR_SUBMITTED" : "IN_PROGRESS",
      weightedScore: data.action === "SUBMIT" ? score.score : null,
      submittedAt,
    };
  });
