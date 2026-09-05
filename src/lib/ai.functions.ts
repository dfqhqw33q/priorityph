import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AiSuggestionResult } from "@/lib/ai-suggestions";

const requestSchema = z.object({
  evaluationId: z.string().uuid(),
  version: z.number().int().positive(),
});
const saveSchema = requestSchema.extend({ analysis: z.record(z.unknown()), approved: z.boolean() });
const suggestionSchema = requestSchema.extend({
  itemId: z.string().uuid(),
  step: z.union([z.literal(2), z.literal(3)]),
  currentValue: z.string().max(4000),
});
const decisionSchema = requestSchema.extend({
  itemId: z.string().uuid(),
  step: z.union([z.literal(2), z.literal(3)]),
  decision: z.enum(["ACCEPTED", "DISMISSED"]),
  edited: z.boolean(),
});
const raterSuggestionSchema = requestSchema.extend({
  supervisorRatings: z
    .array(z.object({ criterionId: z.string().uuid(), rating: z.number().int().min(1).max(5) }))
    .max(10)
    .default([]),
  currentValues: z.object({
    strengths: z.string().max(4000),
    weaknesses: z.string().max(4000),
    effectiveness: z.string().max(4000),
    growthSuggestions: z.string().max(4000),
    otherComments: z.string().max(4000),
  }),
  actionId: z.string().uuid(),
  regenerate: z.boolean().default(false),
});
const raterActionSchema = requestSchema.extend({
  field: z.enum(["strengths", "weaknesses", "effectiveness", "growthSuggestions", "otherComments"]),
  action: z.enum(["ACCEPTED", "DISMISSED"]),
  actionId: z.string().uuid(),
  edited: z.boolean().default(false),
});

export type EvaluationAiAnalysis = {
  performanceSummary: string;
  strengths: string[];
  areasForImprovement: string[];
  developmentRecommendations: string[];
  trainingRecommendations: string[];
  coachingSuggestions: string[];
};

export type RaterAiSuggestion = {
  provider: "openrouter" | "development-mock";
  suggestions: Record<
    "strengths" | "weaknesses" | "effectiveness" | "growthSuggestions" | "otherComments",
    string
  >;
  evidence: {
    factors: Array<{
      letter: string;
      title: string;
      employeeRating: number | null;
      supervisorRating: number | null;
    }>;
    cycle: string;
  };
  generatedAt: string;
};

export const suggestRaterFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => raterSuggestionSchema.parse(input))
  .handler(async ({ data, context }): Promise<RaterAiSuggestion> => {
    const {
      getAdmin,
      requirePermission,
      writeAudit,
      getActorRoles,
      validationError,
      loadEvaluationDetail,
    } = await import("./server-core.server");
    await requirePermission(context.userId, "evaluations.step2", "Rater Step 2");
    const detail = await loadEvaluationDetail(data.evaluationId);
    if (!detail) throw validationError("Evaluation not found");
    if (detail.is_finalized)
      throw validationError("This evaluation is finalized. AI drafting is disabled.");
    if (detail.version !== data.version)
      throw validationError("This evaluation changed in another session. Reload and try again.");
    if (detail.supervisor_user_id && detail.supervisor_user_id !== context.userId)
      throw validationError("This evaluation is assigned to another supervisor.");
    if (!["EMPLOYEE_SUBMITTED", "SUPERVISOR_DRAFT"].includes(detail.status))
      throw validationError("This evaluation is not available for Rater Step 2.");
    const admin = await getAdmin();
    const { data: priorAction } = await admin
      .from("audit_logs")
      .select("id")
      .eq("correlation_id", data.actionId)
      .maybeSingle();
    if (priorAction) throw validationError("This AI action was already processed.");

    const submittedRatings = new Map(
      data.supervisorRatings.map((rating) => [rating.criterionId, rating.rating]),
    );
    const validCriterionIds = new Set(detail.criteria.map((criterion) => criterion.id));
    if ([...submittedRatings.keys()].some((criterionId) => !validCriterionIds.has(criterionId)))
      throw validationError("The submitted Supervisor ratings do not belong to this evaluation.");

    const factorRatings = detail.criteria.map((criterion) => ({
      letter: criterion.letter,
      title: criterion.title,
      description: criterion.description,
      employeeRating:
        detail.ratings.find(
          (rating) => rating.criterion_id === criterion.id && rating.evaluator_type === "EMPLOYEE",
        )?.rating ?? null,
      supervisorRating:
        submittedRatings.get(criterion.id) ??
        detail.ratings.find(
          (rating) =>
            rating.criterion_id === criterion.id && rating.evaluator_type === "SUPERVISOR",
        )?.rating ??
        null,
    }));
    const factorsWithDifferences = factorRatings.map((factor) => ({
      ...factor,
      employeeSupervisorDifference:
        factor.employeeRating !== null && factor.supervisorRating !== null
          ? factor.supervisorRating - factor.employeeRating
          : null,
    }));
    const supervisorRatingsComplete = factorRatings.every(
      (factor) => factor.supervisorRating !== null,
    );
    const analysisContext = {
      cycle: `${detail.cycle_name} (${detail.cycle_year})`,
      factors: factorsWithDifferences,
      existingFields: data.currentValues,
      purposes: {
        strengths:
          "Principal Strengths: summarize strengths primarily supported by the Supervisor's current ratings.",
        weaknesses:
          "Principal Weakness: identify supported areas needing improvement from lower Supervisor ratings, differences, and context.",
        effectiveness:
          "Present-job effectiveness: answer what the employee should do to be more effective in the present job with practical actions.",
        growthSuggestions:
          "Growth and development: suggest practical coaching, mentoring, job-specific training, guided practice, or targeted skill development.",
        otherComments:
          "Other comments and recommendations: provide concise Supervisor comments and career/development considerations only when supported by the evaluation.",
      },
      supervisorRatingsComplete,
    };
    const { generateAiText, AiUnavailableError, stripJsonFence, getAiProviderName } =
      await import("./ai-provider.server");
    const prompt = [
      "You are an advisory assistant embedded in an annual performance evaluation.",
      "You are assisting the Immediate Supervisor/Rater, not the Employee/Ratee.",
      "Return JSON with exactly these string keys: strengths, weaknesses, effectiveness, growthSuggestions, otherComments.",
      "Generate all five fields together from the same evidence and avoid repeating sentences or recommendations across fields.",
      "The current Supervisor/Rater ratings are the primary current assessment. Use Employee/Ratee ratings only as comparison context.",
      "When Supervisor ratings are present, never say that supervisor ratings are missing, unavailable, or not yet recorded.",
      "Do not call the Supervisor assessment a self-assessment or self-rating. Do not write generic system disclaimers.",
      "Interpret meaningful Employee-versus-Supervisor differences explicitly when relevant, without treating a difference alone as a confirmed competency gap.",
      "If Supervisor ratings are incomplete, state only that the Supervisor assessment is incomplete and use available evidence; do not invent missing ratings.",
      "Use only the structured evidence below. Do not invent achievements, incidents, qualifications, or personal facts.",
      "Do not change ratings, assign scores, approve training, promotion, salary, or any HR decision.",
      `Evaluation context: ${JSON.stringify(analysisContext)}`,
      "Strengths must primarily reflect the Supervisor ratings. Weaknesses and development fields must use lower Supervisor ratings, meaningful rating differences, and the available evidence. Keep each field concise and directly answer its evaluation question. Return only valid JSON, with no markdown fences.",
    ].join("\n");
    let suggestion: string;
    try {
      suggestion = stripJsonFence(await generateAiText(prompt, { json: true }));
    } catch (error) {
      throw validationError(
        error instanceof AiUnavailableError ? error.message : "AI suggestion is unavailable.",
      );
    }
    let suggestions: RaterAiSuggestion["suggestions"];
    try {
      const parsed = JSON.parse(suggestion) as Record<string, unknown>;
      const fields = [
        "strengths",
        "weaknesses",
        "effectiveness",
        "growthSuggestions",
        "otherComments",
      ] as const;
      if (fields.some((field) => typeof parsed[field] !== "string"))
        throw new Error("Invalid field output");
      suggestions = Object.fromEntries(
        fields.map((field) => [field, String(parsed[field]).slice(0, 4000)]),
      ) as RaterAiSuggestion["suggestions"];
    } catch {
      throw validationError("AI returned invalid field suggestions.");
    }
    const generatedAt = new Date().toISOString();
    await writeAudit(
      {
        actorUserId: context.userId,
        actorRole: (await getActorRoles(context.userId)).join(","),
        action: data.regenerate
          ? "AI_RATER_SUGGESTION_REGENERATED"
          : "AI_RATER_SUGGESTION_GENERATED",
        module: "Rater Step 2",
        entityType: "evaluation",
        entityId: data.evaluationId,
        evaluationId: data.evaluationId,
        newValue: { fields: Object.keys(suggestions), generatedAt },
      },
      { ip: null, userAgent: null, correlationId: data.actionId },
    );
    return {
      suggestions,
      evidence: { factors: factorsWithDifferences, cycle: analysisContext.cycle },
      generatedAt,
      provider: getAiProviderName() === "openrouter" ? "openrouter" : "development-mock",
    };
  });

export const recordRaterAiAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => raterActionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const {
      getAdmin,
      requirePermission,
      writeAudit,
      getActorRoles,
      validationError,
      loadEvaluationDetail,
    } = await import("./server-core.server");
    await requirePermission(context.userId, "evaluations.step2", "Rater Step 2");
    const detail = await loadEvaluationDetail(data.evaluationId);
    if (
      !detail ||
      detail.is_finalized ||
      detail.version !== data.version ||
      !["EMPLOYEE_SUBMITTED", "SUPERVISOR_DRAFT"].includes(detail.status)
    )
      throw validationError("This evaluation is not available for Rater Step 2.");
    if (detail.supervisor_user_id && detail.supervisor_user_id !== context.userId)
      throw validationError("This evaluation is assigned to another supervisor.");
    const admin = await getAdmin();
    const { data: priorAction } = await admin
      .from("audit_logs")
      .select("id")
      .eq("correlation_id", data.actionId)
      .maybeSingle();
    if (priorAction) return { ok: true, duplicate: true };
    await writeAudit(
      {
        actorUserId: context.userId,
        actorRole: (await getActorRoles(context.userId)).join(","),
        action:
          data.action === "ACCEPTED"
            ? "AI_RATER_SUGGESTION_ACCEPTED"
            : "AI_RATER_SUGGESTION_DISCARDED",
        module: "Rater Step 2",
        entityType: "evaluation",
        entityId: data.evaluationId,
        evaluationId: data.evaluationId,
        newValue: { field: data.field, edited: data.edited },
      },
      { ip: null, userAgent: null, correlationId: data.actionId },
    );
    return { ok: true, duplicate: false };
  });

export const generateEvaluationAiAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const {
      getAdmin,
      requirePermission,
      writeAudit,
      getActorRoles,
      validationError,
      loadEvaluationDetail,
    } = await import("./server-core.server");
    await requirePermission(context.userId, "president.view", "President Review");
    const { generateAiText, AiUnavailableError, stripJsonFence } =
      await import("./ai-provider.server");
    const detail = await loadEvaluationDetail(data.evaluationId);
    if (!detail) throw validationError("Evaluation not found");
    const admin = await getAdmin();
    const { data: score } = await admin
      .from("evaluation_scores")
      .select("final_score, final_rating_label, president_average")
      .eq("evaluation_id", data.evaluationId)
      .maybeSingle();
    const prompt = [
      "You are an advisory performance evaluation assistant. Do not make decisions, change ratings, or finalize anything.",
      "Return JSON with keys performanceSummary, strengths, areasForImprovement, developmentRecommendations, trainingRecommendations, coachingSuggestions.",
      "Each list must contain concise strings. Analyze only this structured evaluation:",
      JSON.stringify({
        employee: {
          number: detail.employee_number_snapshot,
          name: detail.full_name_snapshot,
          title: detail.job_title_snapshot,
          division: detail.division_snapshot,
          section: detail.section_snapshot,
        },
        ratings: detail.ratings,
        score,
        supervisorRemarks: detail.supervisor_remarks,
        cycle: detail.cycle_name,
        year: detail.cycle_year,
      }),
    ].join("\n");
    let text: string;
    try {
      text = stripJsonFence(await generateAiText(prompt, { json: true }));
    } catch (error) {
      throw validationError(
        error instanceof AiUnavailableError ? error.message : "AI analysis is unavailable.",
      );
    }
    let analysis: EvaluationAiAnalysis;
    try {
      analysis = JSON.parse(text) as EvaluationAiAnalysis;
    } catch {
      throw validationError("AI returned invalid analysis data.");
    }
    const generatedAt = new Date().toISOString();
    const { error } = await admin
      .from("evaluations")
      .update({
        ai_analysis: analysis,
        ai_generated_at: generatedAt,
        ai_approved: false,
        ai_source_version: data.version,
      } as never)
      .eq("id", data.evaluationId)
      .eq("version", data.version);
    if (error) throw validationError(error.message);
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "AI_ANALYSIS_GENERATED",
      module: "President Review",
      entityType: "evaluation",
      entityId: data.evaluationId,
      evaluationId: data.evaluationId,
      newValue: { generatedAt, sourceVersion: data.version },
    });
    return { analysis, generatedAt };
  });

/**
 * Generates an advisory draft for one mapped Step 2 / Step 3 text field.
 *
 * The suggestion is returned to the caller only — it is never written to the
 * database, never inserted into an answer, and never submitted. The President
 * must explicitly accept it in the UI.
 */
export const suggestPresidentField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => suggestionSchema.parse(input))
  .handler(async ({ data, context }): Promise<AiSuggestionResult> => {
    const {
      getAdmin,
      requirePermission,
      writeAudit,
      getActorRoles,
      validationError,
      loadEvaluationDetail,
    } = await import("./server-core.server");
    await requirePermission(
      context.userId,
      data.step === 2 ? "president.step2" : "president.step3",
      "President Review",
    );
    const { AI_FIELD_MAPPINGS } = await import("./ai-suggestions");
    const { generateAiText, AiUnavailableError } = await import("./ai-provider.server");

    const detail = await loadEvaluationDetail(data.evaluationId);
    if (!detail) throw validationError("Evaluation not found");
    if (detail.is_finalized)
      throw validationError("This evaluation is finalized. AI drafting is disabled.");

    const admin = await getAdmin();
    const { data: item } = await admin
      .from("president_step_items")
      .select("id, code, label, input_type")
      .eq("id", data.itemId)
      .maybeSingle();
    if (!item) throw validationError("Unknown Step field");
    const mapping = AI_FIELD_MAPPINGS[item.code];
    if (!mapping) throw validationError("AI drafting is not available for this field.");

    const { data: score } = await admin
      .from("evaluation_scores")
      .select("final_score, final_rating_label")
      .eq("evaluation_id", data.evaluationId)
      .maybeSingle();

    const criteria = (detail.criteria ?? []) as { id: string; letter: string; title: string }[];
    const ratings = (detail.ratings ?? []) as {
      criterion_id: string;
      evaluator_type: "EMPLOYEE" | "SUPERVISOR" | "PRESIDENT";
      rating: number;
    }[];
    const ratingFor = (criterionId: string, type: "EMPLOYEE" | "SUPERVISOR" | "PRESIDENT") =>
      ratings.find((r) => r.criterion_id === criterionId && r.evaluator_type === type)?.rating ??
      null;

    const allFactors = criteria.map((criterion) => ({
      letter: criterion.letter,
      title: criterion.title,
      employeeRating: ratingFor(criterion.id, "EMPLOYEE"),
      supervisorRating: ratingFor(criterion.id, "SUPERVISOR"),
      presidentRating: ratingFor(criterion.id, "PRESIDENT"),
    }));

    const effective = (factor: (typeof allFactors)[number]) =>
      factor.presidentRating ?? factor.supervisorRating ?? factor.employeeRating ?? 0;
    const sorted = [...allFactors].sort((a, b) => effective(b) - effective(a));
    const selected =
      mapping.factors === "ALL"
        ? allFactors
        : mapping.factors === "STRENGTHS"
          ? sorted.slice(0, 4)
          : sorted.slice(-4).reverse();

    const disagreements = allFactors.filter(
      (factor) =>
        factor.employeeRating !== null &&
        factor.supervisorRating !== null &&
        Math.abs(factor.employeeRating - factor.supervisorRating) >= 2,
    );
    const disagreementWarning =
      disagreements.length > 0
        ? `Employee and supervisor ratings differ by 2 or more points on: ${disagreements
            .map((factor) => `${factor.letter} (${factor.title})`)
            .join(", ")}. Review these factors before accepting this draft.`
        : null;

    const evidence = {
      employeeName: detail.full_name_snapshot,
      cycle: `${detail.cycle_name} (${detail.cycle_year})`,
      purpose: mapping.purpose,
      factors: selected,
      supervisorRemarks: detail.supervisor_remarks ?? "",
      finalScore: score?.final_score ?? null,
      finalRatingLabel: score?.final_rating_label ?? null,
    };

    const prompt = [
      "You are an advisory writing assistant for a performance evaluation form.",
      "You must not make decisions, change ratings, recommend a final score, or finalize anything.",
      "Use ONLY the evidence provided below. Never invent incidents, dates, names or facts.",
      `Task: ${mapping.purpose}`,
      `Field label: ${item.label}`,
      "Write 2-4 professional sentences in plain prose. Reply with the draft text only, no preamble, no markdown.",
      `The President's current draft (for tone only, may be empty): ${data.currentValue || "(empty)"}`,
      `Evidence: ${JSON.stringify(evidence)}`,
    ].join("\n");

    let suggestion: string;
    try {
      suggestion = (await generateAiText(prompt)).trim();
    } catch (error) {
      throw validationError(
        error instanceof AiUnavailableError ? error.message : "AI suggestion is unavailable.",
      );
    }
    if (!suggestion) throw validationError("AI returned an empty suggestion.");
    if (suggestion.length > 4000) suggestion = suggestion.slice(0, 4000);

    const generatedAt = new Date().toISOString();
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "AI_SUGGESTION_GENERATED",
      module: "President Review",
      entityType: "evaluation",
      entityId: data.evaluationId,
      evaluationId: data.evaluationId,
      newValue: { step: data.step, itemId: data.itemId, itemCode: item.code, generatedAt },
    });

    return {
      itemId: data.itemId,
      step: data.step,
      suggestion,
      evidence,
      disagreementWarning,
      generatedAt,
      model: "lovable-ai",
    };
  });

/** Records that the President explicitly accepted or dismissed a suggestion. */
export const recordAiSuggestionDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => decisionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { requirePermission, writeAudit, getActorRoles } = await import("./server-core.server");
    await requirePermission(
      context.userId,
      data.step === 2 ? "president.step2" : "president.step3",
      "President Review",
    );
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: data.decision === "ACCEPTED" ? "AI_SUGGESTION_ACCEPTED" : "AI_SUGGESTION_DISMISSED",
      module: "President Review",
      entityType: "evaluation",
      entityId: data.evaluationId,
      evaluationId: data.evaluationId,
      newValue: { step: data.step, itemId: data.itemId, edited: data.edited },
    });
    return { ok: true };
  });

export const saveEvaluationAiAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, writeAudit, getActorRoles, validationError } =
      await import("./server-core.server");
    await requirePermission(context.userId, "president.view", "President Review");
    const admin = await getAdmin();
    const { error } = await admin
      .from("evaluations")
      .update({ ai_analysis: data.analysis, ai_approved: data.approved } as never)
      .eq("id", data.evaluationId)
      .eq("version", data.version)
      .eq("is_finalized", false);
    if (error) throw validationError(error.message);
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: data.approved ? "AI_RECOMMENDATION_APPROVED" : "AI_RECOMMENDATION_EDITED",
      module: "President Review",
      entityType: "evaluation",
      entityId: data.evaluationId,
      evaluationId: data.evaluationId,
      newValue: { approved: data.approved },
    });
    return { ok: true };
  });
