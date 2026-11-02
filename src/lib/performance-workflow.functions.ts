import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeRole } from "@/lib/domain";
import { calculateWeightedScore, type EvaluationTemplate } from "@/lib/performance-management";

const evaluationInputSchema = z.object({
  periodId: z.string().uuid(),
  action: z.enum(["DRAFT", "SUBMIT"]),
  ratings: z.record(z.string(), z.union([z.number().int().min(1).max(5), z.null()])),
  comments: z.record(z.string(), z.string().max(4000)),
  evidence: z.record(z.string(), z.string().max(4000)),
});

export type EvaluationSaveResult = {
  id: string;
  status: string;
  submittedAt: string | null;
  weightedScore: number | null;
};

export const saveMyEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => evaluationInputSchema.parse(input))
  .handler(async ({ context, data }): Promise<EvaluationSaveResult> => {
    const { getAdmin } = await import("@/lib/server-core.server");
    const admin = await getAdmin();

    const { data: roleRows, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleError) throw new Error(`Could not verify account role: ${roleError.message}`);
    const roles = (roleRows ?? []).map((row) => normalizeRole(row.role));
    if (roles.length !== 1 || roles[0] !== "EMPLOYEE")
      throw new Error("Only an Employee account can save a self-evaluation.");

    const { data: employee, error: employeeError } = await admin
      .from("employees")
      .select(
        "id, job_position_id, job_title, employment_status, assigned_supervisor_user_id, department_id",
      )
      .eq("user_id", context.userId)
      .maybeSingle();
    if (employeeError)
      throw new Error(`Could not load your employee record: ${employeeError.message}`);
    if (
      !employee ||
      employee.employment_status !== "ACTIVE" ||
      !employee.assigned_supervisor_user_id
    ) {
      throw new Error("An active employee record with an assigned supervisor is required.");
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: period, error: periodError } = await admin
      .from("evaluation_periods")
      .select("id, name, starts_on, ends_on, submission_deadline, status")
      .eq("id", data.periodId)
      .maybeSingle();
    if (periodError)
      throw new Error(`Could not verify the evaluation period: ${periodError.message}`);
    if (!period) throw new Error("This evaluation period is not currently open.");

    const { data: existing, error: existingError } = await admin
      .from("employee_evaluations")
      .select("id, status, template_id, weighted_score, submitted_at")
      .eq("employee_id", employee.id)
      .eq("evaluation_period_id", period.id)
      .maybeSingle();
    if (existingError) throw new Error(`Could not load your evaluation: ${existingError.message}`);
    const correctionStatus =
      existing?.status === "RETURNED_BY_HR" || existing?.status === "REOPENED";
    if (
      !period ||
      (!correctionStatus &&
        (period.status !== "ACTIVE" ||
          period.starts_on > today ||
          period.ends_on < today ||
          (period.submission_deadline && period.submission_deadline < today)))
    ) {
      throw new Error("This evaluation period is not currently open.");
    }
    if (existing && correctionStatus) {
      const { data: correctionEvent, error: correctionError } = await admin
        .from("performance_workflow_events")
        .select("responsible_user_id")
        .eq("employee_evaluation_id", existing.id)
        .in("action", ["HR_RETURNED", "EVALUATION_REOPENED"])
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (correctionError)
        throw new Error(`Could not verify the correction assignment: ${correctionError.message}`);
      if (correctionEvent?.responsible_user_id !== context.userId)
        throw new Error("This correction was assigned to a different reviewer.");
    }
    if (
      existing &&
      !["DRAFT", "IN_PROGRESS", "RETURNED_FOR_REVISION", "RETURNED_BY_HR", "REOPENED"].includes(
        existing.status,
      )
    ) {
      throw new Error("This evaluation has been submitted and is locked for employee editing.");
    }

    let templateId = existing?.template_id ?? null;
    if (!templateId) {
      if (!employee.job_position_id)
        throw new Error("Your employee record does not have an assigned job position.");
      const { data: templates, error: templateError } = await admin
        .from("evaluation_templates")
        .select("id, name, job_position_id, version, effective_from, effective_to")
        .eq("job_position_id", employee.job_position_id)
        .eq("status", "ACTIVE")
        .lte("effective_from", period.starts_on)
        .order("version", { ascending: false });
      if (templateError)
        throw new Error(`Could not load your evaluation template: ${templateError.message}`);
      const template = templates?.find(
        (row) => row.effective_to === null || row.effective_to >= period.starts_on,
      );
      if (!template) throw new Error("No active evaluation template is available for this period.");
      templateId = template.id;
    }

    const { data: templateRow, error: templateError } = await admin
      .from("evaluation_templates")
      .select("id, name, job_position_id, version, effective_from")
      .eq("id", templateId)
      .maybeSingle();
    if (templateError)
      throw new Error(`Could not load the saved evaluation template: ${templateError.message}`);
    if (!templateRow) throw new Error("The saved evaluation template is no longer available.");

    const { data: categories, error: categoryError } = await admin
      .from("evaluation_template_categories")
      .select("id, name, weight, position")
      .eq("template_id", templateId)
      .order("position", { ascending: true });
    if (categoryError)
      throw new Error(`Could not load evaluation categories: ${categoryError.message}`);
    if (!categories || categories.length !== 8)
      throw new Error("The evaluation template must contain exactly eight categories.");

    const categoryIds = new Set(categories.map((category) => category.id));
    const inputCategoryIds = new Set([
      ...Object.keys(data.ratings),
      ...Object.keys(data.comments),
      ...Object.keys(data.evidence),
    ]);
    if ([...inputCategoryIds].some((id) => !categoryIds.has(id)))
      throw new Error("The evaluation contains an unknown category.");

    const evaluationTemplate: EvaluationTemplate = {
      id: templateRow.id,
      name: templateRow.name,
      jobPosition: employee.job_title ?? "",
      version: templateRow.version,
      effectiveDate: templateRow.effective_from ?? "",
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        weight: Number(category.weight),
        indicators: [],
        evidence: [],
      })),
    };

    const { data: priorRatings, error: priorRatingsError } = existing
      ? await admin
          .from("employee_evaluation_ratings")
          .select("category_id, rating, comments, evidence")
          .eq("employee_evaluation_id", existing.id)
      : { data: [], error: null };
    if (priorRatingsError)
      throw new Error(`Could not load your saved ratings: ${priorRatingsError.message}`);
    const priorByCategory = new Map(
      (priorRatings ?? []).map((rating) => [rating.category_id, rating]),
    );
    const mergedRatings = Object.fromEntries(
      categories.map((category) => [
        category.id,
        data.ratings[category.id] ?? priorByCategory.get(category.id)?.rating ?? null,
      ]),
    );
    const score = calculateWeightedScore(evaluationTemplate, mergedRatings);
    if (!score.templateValid) throw new Error("The evaluation category weights are invalid.");
    if (data.action === "SUBMIT" && score.score === null)
      throw new Error(
        "Select a valid rating from 1 to 5 for all eight categories before submitting.",
      );

    let evaluationId = existing?.id;
    if (!evaluationId) {
      const { data: inserted, error: insertError } = await admin
        .from("employee_evaluations")
        .insert({
          employee_id: employee.id,
          evaluation_period_id: period.id,
          template_id: templateId,
          assigned_supervisor_user_id: employee.assigned_supervisor_user_id,
          department_id: employee.department_id,
        })
        .select("id")
        .single();
      if (insertError) {
        if (insertError.code === "23505")
          throw new Error(
            "An evaluation for this period already exists. Refresh and continue editing it.",
          );
        throw new Error(`Could not create your evaluation: ${insertError.message}`);
      }
      evaluationId = inserted.id;
    }

    const ratingRows = categories.map((category) => {
      const previous = priorByCategory.get(category.id);
      return {
        employee_evaluation_id: evaluationId,
        category_id: category.id,
        rating: data.ratings[category.id] ?? previous?.rating ?? null,
        comments: data.comments[category.id] ?? previous?.comments ?? "",
        evidence: data.evidence[category.id] ?? previous?.evidence ?? "",
      };
    });
    const { error: ratingsError } = await admin
      .from("employee_evaluation_ratings")
      .upsert(ratingRows, { onConflict: "employee_evaluation_id,category_id" });
    if (ratingsError)
      throw new Error(`Could not save your evaluation ratings: ${ratingsError.message}`);

    const previousStatus = existing?.status ?? "DRAFT";
    if (data.action === "SUBMIT") {
      const { data: submittedStatus, error: submissionError } = await admin.rpc(
        "submit_employee_performance",
        { _evaluation_id: evaluationId, _actor_user_id: context.userId },
      );
      if (submissionError)
        throw new Error(`Could not submit your self-evaluation: ${submissionError.message}`);
      if (submittedStatus !== "SUBMITTED")
        throw new Error("The self-evaluation submission returned an unexpected status.");
      const { data: submittedEvaluation, error: submittedEvaluationError } = await admin
        .from("employee_evaluations")
        .select("status, submitted_at, weighted_score")
        .eq("id", evaluationId)
        .single();
      if (submittedEvaluationError)
        throw new Error(
          `The evaluation was submitted, but its final status could not be loaded: ${submittedEvaluationError.message}`,
        );
      return {
        id: evaluationId,
        status: submittedEvaluation.status,
        submittedAt: submittedEvaluation.submitted_at,
        weightedScore: submittedEvaluation.weighted_score,
      };
    }

    const nextStatus =
      previousStatus === "DRAFT" || previousStatus === "REOPENED" ? "IN_PROGRESS" : previousStatus;
    const { error: updateError } = await admin
      .from("employee_evaluations")
      .update({ status: nextStatus, weighted_score: score.score })
      .eq("id", evaluationId);
    if (updateError)
      throw new Error(`Could not save your evaluation draft: ${updateError.message}`);
    const { error: auditError } = await admin.from("evaluation_audit_logs").insert({
      employee_evaluation_id: evaluationId,
      actor_user_id: context.userId,
      action: "SELF_EVALUATION_DRAFT_SAVED",
      previous_value: { status: previousStatus },
      new_value: { status: nextStatus, weighted_score: score.score },
    });
    if (auditError)
      throw new Error(`Your draft was saved, but its audit event failed: ${auditError.message}`);

    return {
      id: evaluationId,
      status: nextStatus,
      submittedAt: existing?.submitted_at ?? null,
      weightedScore: score.score,
    };
  });
