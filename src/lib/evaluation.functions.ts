import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EvaluationTemplate, TemplateCategory } from "@/lib/performance-management";
import { normalizeRole } from "@/lib/domain";
import type { AdminClient } from "@/lib/server-core.server";

export type EvaluationFramework = {
  template: EvaluationTemplate | null;
  period: {
    id: string;
    name: string;
    startsOn: string;
    endsOn: string;
    submissionDeadline: string | null;
  } | null;
  position: string;
  evaluation: {
    id: string;
    status: string;
    weightedScore: number | null;
    submittedAt: string | null;
    ratings: Record<string, number | null>;
    comments: Record<string, string>;
    evidence: Record<string, string>;
  } | null;
};

async function requireEmployeeRole(admin: AdminClient, userId: string): Promise<void> {
  const { data: roleRows, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(`Could not verify account role: ${error.message}`);
  const roles = (roleRows ?? []).map((row) => normalizeRole(row.role));
  if (roles.length !== 1 || roles[0] !== "EMPLOYEE") {
    throw new Error("Only an Employee account can access the employee evaluation framework.");
  }
}

export const getMyEvaluationFramework = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EvaluationFramework> => {
    const { getAdmin } = await import("@/lib/server-core.server");
    const admin = await getAdmin();
    await requireEmployeeRole(admin, context.userId);

    const { data: employee, error: employeeError } = await admin
      .from("employees")
      .select("id, job_title, job_position_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (employeeError)
      throw new Error(`Could not load your employee position: ${employeeError.message}`);
    if (!employee) throw new Error("Your account is not linked to an employee record.");

    let positionId = employee.job_position_id;
    let positionName = employee.job_title;
    if (!positionId) {
      const { data: position, error } = await admin
        .from("job_positions")
        .select("id, name")
        .ilike("name", employee.job_title)
        .maybeSingle();
      if (error) throw new Error(`Could not resolve your job position: ${error.message}`);
      if (position) {
        positionId = position.id;
        positionName = position.name;
      }
    } else {
      const { data: position, error } = await admin
        .from("job_positions")
        .select("name")
        .eq("id", positionId)
        .maybeSingle();
      if (error) throw new Error(`Could not load your job position: ${error.message}`);
      positionName = position?.name ?? employee.job_title;
    }

    const today = new Date().toISOString().slice(0, 10);
    const [
      { data: activePeriods, error: periodsError },
      { data: templates, error: templateError },
    ] = await Promise.all([
      admin
        .from("evaluation_periods")
        .select("id, name, starts_on, ends_on, submission_deadline")
        .eq("status", "ACTIVE")
        .lte("starts_on", today)
        .gte("ends_on", today)
        .order("starts_on", { ascending: false })
        .limit(1),
      positionId
        ? admin
            .from("evaluation_templates")
            .select("id, name, job_position_id, version, effective_from, effective_to, status")
            .eq("job_position_id", positionId)
            .eq("status", "ACTIVE")
            .order("version", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (periodsError)
      throw new Error(`Could not load active evaluation periods: ${periodsError.message}`);
    if (templateError)
      throw new Error(`Could not load your evaluation template: ${templateError.message}`);

    const { data: possibleCorrection, error: correctionLoadError } = await admin
      .from("employee_evaluations")
      .select("id, status, weighted_score, submitted_at, evaluation_period_id, template_id")
      .eq("employee_id", employee.id)
      .in("status", ["RETURNED_BY_HR", "REOPENED"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (correctionLoadError)
      throw new Error(`Could not load a returned evaluation: ${correctionLoadError.message}`);
    let correctionEvaluation: typeof possibleCorrection = null;
    if (possibleCorrection) {
      const { data: correctionEvent, error: correctionEventError } = await admin
        .from("performance_workflow_events")
        .select("responsible_user_id")
        .eq("employee_evaluation_id", possibleCorrection.id)
        .in("action", ["HR_RETURNED", "EVALUATION_REOPENED"])
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (correctionEventError)
        throw new Error(
          `Could not verify the returned evaluation: ${correctionEventError.message}`,
        );
      if (correctionEvent?.responsible_user_id === context.userId)
        correctionEvaluation = possibleCorrection;
    }

    const period = correctionEvaluation
      ? await admin
          .from("evaluation_periods")
          .select("id, name, starts_on, ends_on, submission_deadline")
          .eq("id", correctionEvaluation.evaluation_period_id)
          .maybeSingle()
          .then(({ data, error }) => {
            if (error) throw new Error(`Could not load the correction period: ${error.message}`);
            return data;
          })
      : (activePeriods?.[0] ?? null);
    const { data: correctionTemplate, error: correctionTemplateError } = correctionEvaluation
      ? await admin
          .from("evaluation_templates")
          .select("id, name, job_position_id, version, effective_from, effective_to, status")
          .eq("id", correctionEvaluation.template_id)
          .maybeSingle()
      : { data: null, error: null };
    if (correctionTemplateError)
      throw new Error(`Could not load the correction profile: ${correctionTemplateError.message}`);
    const templateRow =
      correctionTemplate ??
      templates?.find(
        (template) =>
          template.effective_from !== null &&
          template.effective_from <= today &&
          (template.effective_to === null || template.effective_to >= today),
      ) ??
      null;

    if (!templateRow) {
      const { data: evaluation, error: evaluationError } = correctionEvaluation
        ? { data: correctionEvaluation, error: null }
        : period
          ? await admin
              .from("employee_evaluations")
              .select("id, status, weighted_score, submitted_at")
              .eq("employee_id", employee.id)
              .eq("evaluation_period_id", period.id)
              .maybeSingle()
          : { data: null, error: null };
      if (evaluationError)
        throw new Error(`Could not load your current evaluation: ${evaluationError.message}`);
      return {
        template: null,
        period: period
          ? {
              id: period.id,
              name: period.name,
              startsOn: period.starts_on,
              endsOn: period.ends_on,
              submissionDeadline: period.submission_deadline,
            }
          : null,
        position: positionName || "Not specified",
        evaluation: evaluation
          ? {
              id: evaluation.id,
              status: evaluation.status,
              weightedScore: evaluation.weighted_score,
              submittedAt: evaluation.submitted_at,
              ratings: {},
              comments: {},
              evidence: {},
            }
          : null,
      };
    }

    const { data: categories, error: categoryError } = await admin
      .from("evaluation_template_categories")
      .select("id, name, weight, position")
      .eq("template_id", templateRow.id)
      .order("position", { ascending: true });
    if (categoryError)
      throw new Error(`Could not load evaluation categories: ${categoryError.message}`);
    if (!categories || categories.length !== 8)
      throw new Error(
        "The active Driver evaluation template must contain exactly eight categories.",
      );

    const categoryIds = categories.map((category) => category.id);
    const [
      { data: indicators, error: indicatorError },
      { data: evidence, error: evidenceError },
      { data: ratingScale, error: ratingError },
    ] = await Promise.all([
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
      admin.from("evaluation_rating_scale").select("rating, label, description").order("rating"),
    ]);
    if (indicatorError)
      throw new Error(`Could not load performance indicators: ${indicatorError.message}`);
    if (evidenceError)
      throw new Error(`Could not load evidence requirements: ${evidenceError.message}`);
    if (ratingError) throw new Error(`Could not load rating definitions: ${ratingError.message}`);
    if (
      ratingScale?.length !== 5 ||
      ratingScale.some((rating) => rating.rating < 1 || rating.rating > 5)
    )
      throw new Error("The evaluation rating scale must contain ratings 1 through 5.");

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
      throw new Error("The active evaluation template categories must total exactly 100%.");

    const { data: evaluation, error: evaluationError } = correctionEvaluation
      ? { data: correctionEvaluation, error: null }
      : period
        ? await admin
            .from("employee_evaluations")
            .select("id, status, weighted_score, submitted_at")
            .eq("employee_id", employee.id)
            .eq("evaluation_period_id", period.id)
            .maybeSingle()
        : { data: null, error: null };
    if (evaluationError)
      throw new Error(`Could not load your current evaluation: ${evaluationError.message}`);

    const { data: savedRatings, error: savedRatingsError } = evaluation
      ? await admin
          .from("employee_evaluation_ratings")
          .select("category_id, rating, comments, evidence")
          .eq("employee_evaluation_id", evaluation.id)
      : { data: [], error: null };
    if (savedRatingsError)
      throw new Error(`Could not load your saved ratings: ${savedRatingsError.message}`);

    const ratingByCategory = new Map(
      (savedRatings ?? []).map((rating) => [rating.category_id, rating]),
    );
    return {
      template: {
        id: templateRow.id,
        name: templateRow.name,
        jobPosition: positionName,
        version: templateRow.version,
        effectiveDate: templateRow.effective_from ?? "",
        categories: templateCategories,
      },
      period: period
        ? {
            id: period.id,
            name: period.name,
            startsOn: period.starts_on,
            endsOn: period.ends_on,
            submissionDeadline: period.submission_deadline,
          }
        : null,
      position: positionName || "Not specified",
      evaluation: evaluation
        ? {
            id: evaluation.id,
            status: evaluation.status,
            weightedScore: evaluation.weighted_score,
            submittedAt: evaluation.submitted_at,
            ratings: Object.fromEntries(
              templateCategories.map((category) => [
                category.id,
                ratingByCategory.get(category.id)?.rating ?? null,
              ]),
            ),
            comments: Object.fromEntries(
              templateCategories.map((category) => [
                category.id,
                ratingByCategory.get(category.id)?.comments ?? "",
              ]),
            ),
            evidence: Object.fromEntries(
              templateCategories.map((category) => [
                category.id,
                ratingByCategory.get(category.id)?.evidence ?? "",
              ]),
            ),
          }
        : null,
    };
  });
