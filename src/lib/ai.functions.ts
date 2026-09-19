import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AiSuggestionResult } from "@/lib/ai-suggestions";

const raterSuggestionCache = new Map<string, { expiresAt: number; value: RaterAiSuggestion }>();
const RATER_CACHE_TTL = 5 * 60_000;

function readRaterSuggestionCache(key: string): RaterAiSuggestion | null {
  const cached = raterSuggestionCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    raterSuggestionCache.delete(key);
    return null;
  }
  return cached.value;
}

function writeRaterSuggestionCache(key: string, value: RaterAiSuggestion): void {
  if (raterSuggestionCache.size >= 100) {
    const oldestKey = raterSuggestionCache.keys().next().value;
    if (oldestKey) raterSuggestionCache.delete(oldestKey);
  }
  raterSuggestionCache.set(key, { expiresAt: Date.now() + RATER_CACHE_TTL, value });
}

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
    overallExplanation: z.string().max(4000),
    strengths: z.string().max(4000),
    weaknesses: z.string().max(4000),
    effectiveness: z.string().max(4000),
    developmentPotential: z.string().max(4000),
    advancementOutlook: z.string().max(4000),
    growthSuggestions: z.string().max(4000),
    transferInterest: z.string().max(100),
    transferJob: z.string().max(1000),
    transferWhere: z.string().max(1000),
    transferQualified: z.string().max(1000),
    otherComments: z.string().max(4000),
  }),
  actionId: z.string().uuid(),
  regenerate: z.boolean().default(false),
});
const raterActionSchema = requestSchema.extend({
  field: z.enum([
    "overallExplanation",
    "strengths",
    "weaknesses",
    "effectiveness",
    "developmentPotential",
    "advancementOutlook",
    "growthSuggestions",
    "otherComments",
  ]),
  action: z.enum(["ACCEPTED", "DISMISSED"]),
  actionId: z.string().uuid(),
  edited: z.boolean().default(false),
});
const reviewingSuggestionSchema = requestSchema.extend({
  reviewingRatings: z
    .array(z.object({ criterionId: z.string().uuid(), rating: z.number().int().min(1).max(5) }))
    .max(10)
    .default([]),
  currentValues: z.object({
    comments: z.string().max(4000),
    recommendations: z.string().max(4000),
  }),
  actionId: z.string().uuid(),
  regenerate: z.boolean().default(false),
});
const reviewingActionSchema = requestSchema.extend({
  field: z.enum(["comments", "recommendations"]),
  action: z.enum(["ACCEPTED", "DISMISSED"]),
  actionId: z.string().uuid(),
  edited: z.boolean().default(false),
});
const committeeTrainingSuggestionSchema = requestSchema.extend({
  currentValues: z.object({
    actionDetails: z.string().max(2000),
    recommendation: z.string().max(4000),
  }),
  actionId: z.string().uuid(),
  regenerate: z.boolean().default(false),
});
const committeeTrainingActionSchema = requestSchema.extend({
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
  q1Explanation: string | null;
  suggestions: Record<
    "strengths" | "weaknesses" | "effectiveness" | "growthSuggestions" | "otherComments",
    string
  >;
  developmentPotential: { recommendedOption: string; reason: string } | null;
  advancementOutlook: { recommendedOption: string; reason: string } | null;
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
  .validator((input: unknown) => raterSuggestionSchema.parse(input))
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
    if (!["SUBMITTED", "DRAFT"].includes(detail.status))
      throw validationError("This evaluation is not available for Rater Step 2.");
    const admin = await getAdmin();
    const { data: priorAction } = await admin
      .from("audit_logs")
      .select("id")
      .eq("correlation_id", data.actionId)
      .maybeSingle();
    if (priorAction) throw validationError("This AI action was already processed.");
    const { data: optionItems } = await admin
      .from("president_step_items")
      .select("code, options")
      .in("code", ["S2_DEVELOPMENT_POTENTIAL", "S2_ADVANCEMENT_OUTLOOK"]);
    const optionsByCode = new Map(
      (optionItems ?? []).map((item) => [
        item.code,
        Array.isArray(item.options)
          ? item.options.filter((option): option is string => typeof option === "string")
          : [],
      ]),
    );
    const developmentOptions = optionsByCode.get("S2_DEVELOPMENT_POTENTIAL") ?? [];
    const advancementOptions = optionsByCode.get("S2_ADVANCEMENT_OUTLOOK") ?? [];
    if (developmentOptions.length === 0 || advancementOptions.length === 0)
      throw validationError("The official development options are unavailable.");

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
    const supervisorValues = factorRatings
      .map((factor) => factor.supervisorRating)
      .filter((rating): rating is number => rating !== null);
    const supervisorAverage = supervisorValues.length
      ? supervisorValues.reduce((sum, rating) => sum + rating, 0) / supervisorValues.length
      : null;
    const analysisContext = {
      cycle: `${detail.cycle_name} (${detail.cycle_year})`,
      factors: factorsWithDifferences,
      existingFields: data.currentValues,
      q1Applies:
        supervisorAverage !== null && (supervisorAverage <= 1.5 || supervisorAverage >= 4.5),
      officialOptions: {
        developmentPotential: developmentOptions,
        advancementOutlook: advancementOptions,
      },
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
    const cacheKey = JSON.stringify({
      evaluationId: data.evaluationId,
      version: data.version,
      supervisorRatings: data.supervisorRatings,
      currentValues: data.currentValues,
      officialOptions: analysisContext.officialOptions,
    });
    if (!data.regenerate) {
      const cached = readRaterSuggestionCache(cacheKey);
      if (cached) return cached;
    }
    const {
      generateAiText,
      AiUnavailableError,
      stripJsonFence,
      getAiProviderName,
      rewriteEvaluationText,
      containsEvaluationMetaLanguage,
    } = await import("./ai-provider.server");
    const prompt = [
      "You are an advisory assistant embedded in an annual performance evaluation.",
      "Write the actual evaluation content directly about the employee and their performance.",
      "Return JSON with exactly these keys: q1Explanation, strengths, weaknesses, effectiveness, developmentPotential, advancementOutlook, growthSuggestions, otherComments.",
      "q1Explanation must be null when q1Applies is false; otherwise return a concise Q1 justification grounded in the evidence. Do not invent incidents.",
      "developmentPotential and advancementOutlook must each be objects with exactly recommendedOption and reason. recommendedOption must exactly match one of the official options supplied in the context.",
      "Generate all five fields together from the same evidence and avoid repeating sentences or recommendations across fields.",
      "The JSON values are the final text that will be placed directly into the PHLI performance evaluation form. Write about the employee, never about the person completing the form.",
      "Use natural professional evaluation prose about the employee. Do not mention the Supervisor assessment, Supervisor ratings, Immediate Supervisor, Reviewing Supervisor, evaluator, evaluation process, system, AI, or model unless attribution is genuinely required by the field.",
      "Do not explain your reasoning, the workflow, the AI, the data sources, or the role generating the text. Do not include disclaimers or meta-analysis in any returned field.",
      "The current Supervisor/Rater ratings are the primary current assessment. Use Employee/Ratee ratings only as comparison context.",
      "When Supervisor ratings are present, never say that supervisor ratings are missing, unavailable, or not yet recorded.",
      "Do not call the Supervisor assessment a self-assessment or self-rating. Do not write generic system disclaimers.",
      "Interpret meaningful Employee-versus-Supervisor differences explicitly when relevant, without treating a difference alone as a confirmed competency gap.",
      "If ratings are incomplete, use only the available evidence without describing the missing data or the evaluation process.",
      "Use only the structured evidence below. Do not invent achievements, incidents, qualifications, or personal facts.",
      "Do not invent incidents or behaviors from a rating alone. Use cautious wording such as 'may benefit from further development' when the rating identifies an area without supporting evidence.",
      "Do not make promotion, salary, transfer, succession, advancement, or training-approval decisions unless the actual field and explicit evaluation evidence require it.",
      "Q6 transfer interest and its job/location/qualification details are factual and manual. Never return, infer, or select Q6 values.",
      `Evaluation context: ${JSON.stringify(analysisContext)}`,
      "Field writing rules: strengths summarize supported strengths; weaknesses identify supported development areas; effectiveness gives practical present-job actions; growthSuggestions gives distinct practical development actions; otherComments gives a concise overall conclusion. Do not repeat the same factors or recommendation in every field. Keep each value concise and directly answer its field question. Return only valid JSON, with no markdown fences.",
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
    let q1Explanation: string | null;
    let developmentPotential: RaterAiSuggestion["developmentPotential"];
    let advancementOutlook: RaterAiSuggestion["advancementOutlook"];
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
        fields.map((field) => {
          const value = rewriteEvaluationText(String(parsed[field]));
          if (containsEvaluationMetaLanguage(value))
            throw new Error("Meta-language in field output");
          return [field, value.slice(0, 4000)];
        }),
      ) as RaterAiSuggestion["suggestions"];
      if (!analysisContext.q1Applies && parsed["q1Explanation"] !== null)
        throw new Error("Q1 is not applicable");
      if (analysisContext.q1Applies && typeof parsed["q1Explanation"] !== "string")
        throw new Error("Q1 explanation is required");
      q1Explanation = analysisContext.q1Applies
        ? rewriteEvaluationText(String(parsed["q1Explanation"])).slice(0, 4000)
        : null;
      if (q1Explanation && containsEvaluationMetaLanguage(q1Explanation))
        throw new Error("Meta-language in Q1 output");
      const parseRecommendation = (value: unknown, options: string[]) => {
        if (!value || typeof value !== "object") throw new Error("Invalid recommendation");
        const recommendation = value as { recommendedOption?: unknown; reason?: unknown };
        if (
          typeof recommendation.recommendedOption !== "string" ||
          !options.includes(recommendation.recommendedOption) ||
          typeof recommendation.reason !== "string"
        )
          throw new Error("Invalid recommendation option");
        const reason = rewriteEvaluationText(recommendation.reason);
        if (containsEvaluationMetaLanguage(reason))
          throw new Error("Meta-language in recommendation");
        return {
          recommendedOption: recommendation.recommendedOption,
          reason: reason.slice(0, 1000),
        };
      };
      developmentPotential = parseRecommendation(
        parsed["developmentPotential"],
        developmentOptions,
      );
      advancementOutlook = parseRecommendation(parsed["advancementOutlook"], advancementOptions);
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
        newValue: {
          fields: [
            "q1Explanation",
            ...Object.keys(suggestions),
            "developmentPotential",
            "advancementOutlook",
          ],
          generatedAt,
        },
      },
      { ip: null, userAgent: null, correlationId: data.actionId },
    );
    const result: RaterAiSuggestion = {
      suggestions,
      q1Explanation,
      developmentPotential,
      advancementOutlook,
      evidence: { factors: factorsWithDifferences, cycle: analysisContext.cycle },
      generatedAt,
      provider: getAiProviderName() === "openrouter" ? "openrouter" : "development-mock",
    };
    writeRaterSuggestionCache(cacheKey, result);
    return result;
  });

export const recordRaterAiAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => raterActionSchema.parse(input))
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
      !["SUBMITTED", "DRAFT"].includes(detail.status)
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

export const suggestReviewingSupervisorFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => reviewingSuggestionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const {
      getAdmin,
      requirePermission,
      writeAudit,
      getActorRoles,
      validationError,
      loadEvaluationDetail,
    } = await import("./server-core.server");
    await requirePermission(context.userId, "evaluations.review_step3", "Reviewing Supervisor");
    const detail = await loadEvaluationDetail(data.evaluationId);
    if (!detail) throw validationError("Evaluation not found");
    if (detail.is_finalized || detail.version !== data.version)
      throw validationError("This evaluation changed or is no longer editable.");
    if (!["FOR_REVIEW"].includes(detail.status))
      throw validationError("This evaluation is not available for Reviewing Supervisor review.");
    const admin = await getAdmin();
    const { data: review } = await admin
      .from("reviewing_supervisor_reviews")
      .select("reviewer_user_id")
      .eq("evaluation_id", data.evaluationId)
      .maybeSingle();
    if (review?.reviewer_user_id && review.reviewer_user_id !== context.userId)
      throw validationError("This evaluation is assigned to another Reviewing Supervisor.");
    const { data: priorAction } = await admin
      .from("audit_logs")
      .select("id")
      .eq("correlation_id", data.actionId)
      .maybeSingle();
    if (priorAction) throw validationError("This AI action was already processed.");
    const submittedRatings = new Map(
      data.reviewingRatings.map((rating) => [rating.criterionId, rating.rating]),
    );
    const validCriterionIds = new Set(detail.criteria.map((criterion) => criterion.id));
    if ([...submittedRatings.keys()].some((criterionId) => !validCriterionIds.has(criterionId)))
      throw validationError(
        "The submitted Reviewing Supervisor ratings do not belong to this evaluation.",
      );
    const factors = detail.criteria.map((criterion) => {
      const employee =
        detail.ratings.find(
          (rating) => rating.criterion_id === criterion.id && rating.evaluator_type === "EMPLOYEE",
        )?.rating ?? null;
      const supervisor =
        detail.ratings.find(
          (rating) =>
            rating.criterion_id === criterion.id && rating.evaluator_type === "SUPERVISOR",
        )?.rating ?? null;
      const reviewing =
        submittedRatings.get(criterion.id) ??
        detail.ratings.find(
          (rating) =>
            rating.criterion_id === criterion.id &&
            rating.evaluator_type === "REVIEWING_SUPERVISOR",
        )?.rating ??
        null;
      return {
        letter: criterion.letter,
        title: criterion.title,
        description: criterion.description,
        employeeRating: employee,
        supervisorRating: supervisor,
        reviewingSupervisorRating: reviewing,
        supervisorDifference:
          employee !== null && supervisor !== null ? supervisor - employee : null,
        reviewingDifference:
          supervisor !== null && reviewing !== null ? reviewing - supervisor : null,
      };
    });
    const accumulated =
      (detail as typeof detail & { accumulatedStages?: unknown }).accumulatedStages ?? null;
    const source = detail as typeof detail & Record<string, string | null>;
    const analysisContext = {
      cycle: `${detail.cycle_name} (${detail.cycle_year})`,
      factors,
      currentReviewFields: data.currentValues,
      immediateSupervisorContext: {
        remarks: detail.supervisor_remarks ?? "",
        overallExplanation: source["supervisor_step2_overall_explanation"] ?? "",
        strengths: source["supervisor_step2_strengths"] ?? "",
        weaknesses: source["supervisor_step2_weaknesses"] ?? "",
        effectiveness: source["supervisor_step2_effectiveness"] ?? "",
        developmentPotential: source["supervisor_step2_development_potential"] ?? "",
        advancementOutlook: source["supervisor_step2_advancement_outlook"] ?? "",
        growthSuggestions: source["supervisor_step2_growth_suggestions"] ?? "",
        transferInterest: source["supervisor_step2_transfer_interest"] ?? "",
        otherComments: source["supervisor_step2_other_comments"] ?? "",
      },
      accumulatedEvaluationContext: accumulated,
    };
    const {
      generateAiText,
      AiUnavailableError,
      stripJsonFence,
      getAiProviderName,
      rewriteEvaluationText,
      containsEvaluationMetaLanguage,
    } = await import("./ai-provider.server");
    const prompt = [
      "You are assisting the Reviewing Supervisor / Division Head in completing the existing Step 3 review fields.",
      "Return JSON with exactly these string keys: comments, recommendations.",
      "The JSON values are the final text that will be placed directly into the PHLI form. Write the actual evaluation content about the employee, never about the person completing the form.",
      "Use natural professional evaluation prose about the employee. Do not mention the Supervisor assessment, Supervisor ratings, Immediate Supervisor, Reviewing Supervisor, evaluator, evaluation process, system, AI, or model unless attribution is genuinely required by the field.",
      "Do not explain your reasoning, workflow, AI, data sources, or evaluator role. Do not include disclaimers or meta-analysis in the returned comments or recommendations.",
      "The current Reviewing Supervisor ratings are the primary current assessment. Employee and Immediate Supervisor ratings are comparison context.",
      "Use the existing factor descriptions and accumulated evaluation context. Do not copy or rewrite the Immediate Supervisor's Step 2 comments.",
      "Treat rating differences as analytical indicators, not proof of incidents or specific behavior. Make specific behavioral claims only when supported by evaluation evidence; otherwise use cautious development wording.",
      "Comments must give a concise current overall assessment with important strengths and areas requiring attention. Recommendations must give practical, evidence-based next steps. Do not repeat the Immediate Supervisor's Step 2 comments or produce a long report.",
      "Do not infer career ambitions, qualifications, promotion readiness, salary decisions, training approval, or missing values.",
      "Do not describe missing data, the evaluation process, or the person completing the form.",
      `Evaluation context: ${JSON.stringify(analysisContext)}`,
      "Return only valid JSON without markdown or system disclaimers.",
    ].join("\n");
    let parsed: Record<string, unknown>;
    try {
      const text = stripJsonFence(await generateAiText(prompt, { json: true }));
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch (error) {
      throw validationError(
        error instanceof AiUnavailableError
          ? error.message
          : "AI assistance is unavailable. You can complete these fields manually.",
      );
    }
    if (typeof parsed["comments"] !== "string" || typeof parsed["recommendations"] !== "string")
      throw validationError("AI returned invalid Reviewing Supervisor suggestions.");
    const comments = rewriteEvaluationText(String(parsed["comments"]));
    const recommendations = rewriteEvaluationText(String(parsed["recommendations"]));
    if (containsEvaluationMetaLanguage(comments) || containsEvaluationMetaLanguage(recommendations))
      throw validationError(
        "AI returned evaluator-focused text. Please regenerate the suggestion.",
      );
    const generatedAt = new Date().toISOString();
    await writeAudit(
      {
        actorUserId: context.userId,
        actorRole: (await getActorRoles(context.userId)).join(","),
        action: data.regenerate
          ? "AI_REVIEWING_SUGGESTION_REGENERATED"
          : "AI_REVIEWING_SUGGESTION_GENERATED",
        module: "Reviewing Supervisor",
        entityType: "evaluation",
        entityId: data.evaluationId,
        evaluationId: data.evaluationId,
        newValue: { fields: ["comments", "recommendations"], generatedAt },
      },
      { ip: null, userAgent: null, correlationId: data.actionId },
    );
    return {
      suggestions: {
        comments: comments.slice(0, 4000),
        recommendations: recommendations.slice(0, 4000),
      },
      provider: getAiProviderName() === "openrouter" ? "openrouter" : "development-mock",
      generatedAt,
    };
  });

export const recordReviewingSupervisorAiAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => reviewingActionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const {
      getAdmin,
      requirePermission,
      writeAudit,
      getActorRoles,
      validationError,
      loadEvaluationDetail,
    } = await import("./server-core.server");
    await requirePermission(context.userId, "evaluations.review_step3", "Reviewing Supervisor");
    const detail = await loadEvaluationDetail(data.evaluationId);
    if (!detail || detail.is_finalized || detail.version !== data.version)
      throw validationError("This evaluation is no longer editable.");
    const admin = await getAdmin();
    const { data: review } = await admin
      .from("reviewing_supervisor_reviews")
      .select("reviewer_user_id")
      .eq("evaluation_id", data.evaluationId)
      .maybeSingle();
    if (review?.reviewer_user_id && review.reviewer_user_id !== context.userId)
      throw validationError("This evaluation is assigned to another Reviewing Supervisor.");
    if (
      (
        await admin
          .from("audit_logs")
          .select("id")
          .eq("correlation_id", data.actionId)
          .maybeSingle()
      ).data
    )
      return { ok: true, duplicate: true };
    await writeAudit(
      {
        actorUserId: context.userId,
        actorRole: (await getActorRoles(context.userId)).join(","),
        action:
          data.action === "ACCEPTED"
            ? "AI_REVIEWING_SUGGESTION_ACCEPTED"
            : "AI_REVIEWING_SUGGESTION_DISCARDED",
        module: "Reviewing Supervisor",
        entityType: "evaluation",
        entityId: data.evaluationId,
        evaluationId: data.evaluationId,
        newValue: { field: data.field, edited: data.edited },
      },
      { ip: null, userAgent: null, correlationId: data.actionId },
    );
    return { ok: true, duplicate: false };
  });

export type CommitteeTrainingRecommendation = {
  recommendedTraining: string | null;
  relatedCompetency: string | null;
  rationale: string | null;
  trainingFocus: string | null;
  details: string | null;
  provider: "openrouter" | "development-mock";
  generatedAt: string;
};

export const suggestCommitteeTrainingRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => committeeTrainingSuggestionSchema.parse(input))
  .handler(async ({ data, context }): Promise<CommitteeTrainingRecommendation> => {
    const {
      getAdmin,
      requirePermission,
      writeAudit,
      getActorRoles,
      validationError,
      loadEvaluationDetail,
    } = await import("./server-core.server");
    await requirePermission(context.userId, "committee.review", "Committee Review");
    const detail = await loadEvaluationDetail(data.evaluationId);
    if (!detail) throw validationError("Evaluation not found");
    if (detail.is_finalized || detail.version !== data.version)
      throw validationError("This evaluation changed or is no longer editable.");
    if (!["FOR_REVIEW", "RETURNED"].includes(detail.status))
      throw validationError("This evaluation is not available for Committee review.");
    const admin = await getAdmin();
    const { data: committee } = await admin
      .from("committee_reviews")
      .select("committee_user_id")
      .eq("evaluation_id", data.evaluationId)
      .maybeSingle();
    if (committee?.committee_user_id && committee.committee_user_id !== context.userId)
      throw validationError("This evaluation is assigned to another Committee user.");

    const factors = detail.criteria.map((criterion) => ({
      letter: criterion.letter,
      title: criterion.title,
      description: criterion.description,
      employeeRating:
        detail.ratings.find(
          (rating) => rating.criterion_id === criterion.id && rating.evaluator_type === "EMPLOYEE",
        )?.rating ?? null,
      supervisorRating:
        detail.ratings.find(
          (rating) =>
            rating.criterion_id === criterion.id && rating.evaluator_type === "SUPERVISOR",
        )?.rating ?? null,
      reviewingSupervisorRating:
        detail.ratings.find(
          (rating) =>
            rating.criterion_id === criterion.id &&
            rating.evaluator_type === "REVIEWING_SUPERVISOR",
        )?.rating ?? null,
    }));
    const source = detail as typeof detail & Record<string, string | null>;
    const evaluationContext = {
      employee: {
        jobTitle: detail.job_title_snapshot,
        division: detail.division_snapshot,
        section: detail.section_snapshot,
      },
      cycle: `${detail.cycle_name} (${detail.cycle_year})`,
      factors,
      step2: {
        strengths: source["supervisor_step2_strengths"] ?? "",
        weaknesses: source["supervisor_step2_weaknesses"] ?? "",
        effectiveness: source["supervisor_step2_effectiveness"] ?? "",
        developmentPotential: source["supervisor_step2_development_potential"] ?? "",
        growthSuggestions: source["supervisor_step2_growth_suggestions"] ?? "",
        otherComments: source["supervisor_step2_other_comments"] ?? "",
      },
      currentCommitteeFields: data.currentValues,
    };
    const { generateAiText, AiUnavailableError, stripJsonFence, getAiProviderName } =
      await import("./ai-provider.server");
    const prompt = [
      "You are an advisory assistant helping the Performance Evaluation Committee consider training.",
      "Return JSON with exactly these nullable string keys: recommendedTraining, relatedCompetency, rationale, trainingFocus, details.",
      "Use only the actual evaluation evidence below. Do not invent employee facts, providers, certifications, courses, or competency gaps.",
      "Do not assume every low rating requires training. Recommend training only when the evidence supports a practical development need; otherwise recommendedTraining may be null.",
      "relatedCompetency must be null unless one existing factor title is a reliable match for the supported development need; when used, copy that factor title exactly.",
      "The recommendation is advisory only. Do not select Final Action, approve training, schedule training, assign a provider, enroll the employee, or change any rating.",
      "Keep recommendedTraining suitable for Committee Action Details, and keep rationale suitable for the separate Committee Recommendation field. Do not repeat the same sentence in both.",
      "Use null for any field not supported by the evidence. Return only valid JSON without markdown.",
      `Evaluation context: ${JSON.stringify(evaluationContext)}`,
    ].join("\n");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(stripJsonFence(await generateAiText(prompt, { json: true }))) as Record<
        string,
        unknown
      >;
    } catch (error) {
      throw validationError(
        error instanceof AiUnavailableError
          ? error.message
          : "AI training recommendation is unavailable. You can complete the Committee fields manually.",
      );
    }
    const nullableText = (key: string, max: number) => {
      const value = parsed[key];
      if (value !== null && typeof value !== "string") throw new Error("Invalid recommendation");
      return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
    };
    let recommendation: Omit<CommitteeTrainingRecommendation, "provider" | "generatedAt">;
    try {
      recommendation = {
        recommendedTraining: nullableText("recommendedTraining", 2000),
        relatedCompetency: nullableText("relatedCompetency", 500),
        rationale: nullableText("rationale", 4000),
        trainingFocus: nullableText("trainingFocus", 2000),
        details: nullableText("details", 4000),
      };
      if (
        recommendation.relatedCompetency &&
        !detail.criteria.some((criterion) => criterion.title === recommendation.relatedCompetency)
      )
        throw new Error("Unknown competency");
    } catch {
      throw validationError("AI returned invalid training recommendation data.");
    }
    const generatedAt = new Date().toISOString();
    await writeAudit(
      {
        actorUserId: context.userId,
        actorRole: (await getActorRoles(context.userId)).join(","),
        action: data.regenerate
          ? "AI_COMMITTEE_TRAINING_RECOMMENDATION_REGENERATED"
          : "AI_COMMITTEE_TRAINING_RECOMMENDATION_GENERATED",
        module: "Committee Review",
        entityType: "evaluation",
        entityId: data.evaluationId,
        evaluationId: data.evaluationId,
        newValue: { fields: Object.keys(recommendation), generatedAt },
      },
      { ip: null, userAgent: null, correlationId: data.actionId },
    );
    return {
      ...recommendation,
      provider: getAiProviderName() === "openrouter" ? "openrouter" : "development-mock",
      generatedAt,
    };
  });

export const recordCommitteeTrainingRecommendationAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => committeeTrainingActionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { requirePermission, writeAudit, getActorRoles } = await import("./server-core.server");
    await requirePermission(context.userId, "committee.review", "Committee Review");
    await writeAudit(
      {
        actorUserId: context.userId,
        actorRole: (await getActorRoles(context.userId)).join(","),
        action:
          data.action === "ACCEPTED"
            ? "AI_COMMITTEE_TRAINING_RECOMMENDATION_ACCEPTED"
            : "AI_COMMITTEE_TRAINING_RECOMMENDATION_DISMISSED",
        module: "Committee Review",
        entityType: "evaluation",
        entityId: data.evaluationId,
        evaluationId: data.evaluationId,
        newValue: { edited: data.edited },
      },
      { ip: null, userAgent: null, correlationId: data.actionId },
    );
    return { ok: true };
  });

export const generateEvaluationAiAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => requestSchema.parse(input))
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
  .validator((input: unknown) => suggestionSchema.parse(input))
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
    const {
      generateAiText,
      AiUnavailableError,
      rewriteEvaluationText,
      containsEvaluationMetaLanguage,
    } = await import("./ai-provider.server");

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
      "Write the actual evaluation content directly about the employee and their performance.",
      "Use ONLY the evidence provided below. Never invent incidents, dates, names or facts.",
      `Task: ${mapping.purpose}`,
      `Field label: ${item.label}`,
      "Write 2-4 professional sentences in plain prose. Reply with the draft text only, no preamble, no markdown.",
      "Do not mention the Supervisor assessment, Supervisor ratings, Immediate Supervisor, Reviewing Supervisor, evaluator, evaluation process, system, AI, or model unless attribution is genuinely required by the field.",
      `The President's current draft (for tone only, may be empty): ${data.currentValue || "(empty)"}`,
      `Evidence: ${JSON.stringify(evidence)}`,
    ].join("\n");

    let suggestion: string;
    try {
      suggestion = rewriteEvaluationText(await generateAiText(prompt));
    } catch (error) {
      throw validationError(
        error instanceof AiUnavailableError ? error.message : "AI suggestion is unavailable.",
      );
    }
    if (!suggestion) throw validationError("AI returned an empty suggestion.");
    if (containsEvaluationMetaLanguage(suggestion))
      throw validationError(
        "AI returned evaluator-focused text. Please regenerate the suggestion.",
      );
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
      model: "project-ai",
    };
  });

/** Records that the President explicitly accepted or dismissed a suggestion. */
export const recordAiSuggestionDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => decisionSchema.parse(input))
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
  .validator((input: unknown) => saveSchema.parse(input))
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
