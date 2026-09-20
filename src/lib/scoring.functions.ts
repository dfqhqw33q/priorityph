import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  correctionSchema,
  finalizeSchema,
  scoringRuleFormSchema,
  type ScoringRuleFormValues,
} from "./schemas";

export const listScoringRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requirePermissionAny, getAdmin, writeAudit, getActorRoles } =
      await import("./server-core.server");
    const { loadScoringRule } = await import("./scoring.server");
    await requirePermissionAny(context.userId, ["scoring.manage", "scores.view"], "Scoring");

    const admin = await getAdmin();
    const [{ data: rules }, { data: templates }, { data: criteria }] = await Promise.all([
      admin.from("scoring_rules").select("id").order("created_at", { ascending: false }),
      admin.from("evaluation_templates").select("id, name, is_active").order("name"),
      admin.from("evaluation_criteria").select("id, letter, title, template_id").order("position"),
    ]);

    const loaded = await Promise.all((rules ?? []).map((row) => loadScoringRule(row.id)));
    const roles = await getActorRoles(context.userId);
    await writeAudit({
      actorUserId: context.userId,
      actorRole: roles[0] ?? null,
      action: "SCORING_RULES_VIEWED",
      module: "Scoring",
    });

    return {
      rules: loaded.filter((rule): rule is NonNullable<typeof rule> => rule !== null),
      templates: templates ?? [],
      criteria: criteria ?? [],
    };
  });

export const saveScoringRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: ScoringRuleFormValues) => scoringRuleFormSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { requirePermission, getAdmin, writeAudit, getActorRoles, validationError, safeMessage } =
      await import("./server-core.server");
    const { loadScoringRule, validateScoringRule } = await import("./scoring.server");
    await requirePermission(context.userId, "scoring.manage", "Scoring");

    const admin = await getAdmin();
    const roles = await getActorRoles(context.userId);

    try {
      const { count } = await admin
        .from("evaluation_criteria")
        .select("id", { count: "exact", head: true })
        .eq("template_id", data.templateId);
      const problems = validateScoringRule(
        {
          factorWeighting: data.factorWeighting,
          requiredFactorWeightTotal: data.requiredFactorWeightTotal,
          employeeWeight: data.employeeWeight,
          supervisorWeight: data.supervisorWeight,
          weights: data.weights,
          bands: data.bands,
        },
        count ?? 0,
      );
      const evaluatorProblem = problems.find((problem) => problem.includes("total exactly 100"));
      if (evaluatorProblem) throw validationError(evaluatorProblem);

      let ruleId = data.ruleId ?? null;
      const previous = ruleId ? await loadScoringRule(ruleId) : null;
      if (previous && previous.status !== "DRAFT")
        throw validationError("Only draft rules can be edited. Create a new version instead.");

      const payload = {
        name: data.name,
        template_id: data.templateId,
        factor_weighting: data.factorWeighting,
        required_factor_weight_total: data.requiredFactorWeightTotal,
        employee_weight: data.employeeWeight,
        supervisor_weight: data.supervisorWeight,
        rounding_decimals: data.roundingDecimals,
        show_employee_average: data.showEmployeeAverage,
        show_supervisor_average: data.showSupervisorAverage,
        show_president_result: data.showPresidentResult,
        notes: data.notes,
      };

      if (ruleId) {
        const { error } = await admin.from("scoring_rules").update(payload).eq("id", ruleId);
        if (error) throw validationError(error.message);
      } else {
        const { data: versions } = await admin
          .from("scoring_rules")
          .select("version")
          .eq("name", data.name)
          .order("version", { ascending: false })
          .limit(1);
        const nextVersion = (versions?.[0]?.version ?? 0) + 1;
        const { data: created, error } = await admin
          .from("scoring_rules")
          .insert({ ...payload, version: nextVersion, created_by: context.userId })
          .select("id")
          .single();
        if (error || !created) throw validationError(error?.message ?? "Could not create the rule");
        ruleId = created.id;
      }

      await admin.from("scoring_rule_factor_weights").delete().eq("rule_id", ruleId);
      if (data.weights.length > 0) {
        await admin.from("scoring_rule_factor_weights").insert(
          data.weights.map((weight) => ({
            rule_id: ruleId as string,
            criterion_id: weight.criterionId,
            weight: weight.weight,
          })),
        );
      }
      await admin.from("scoring_rule_bands").delete().eq("rule_id", ruleId);
      if (data.bands.length > 0) {
        await admin.from("scoring_rule_bands").insert(
          data.bands.map((band, index) => ({
            rule_id: ruleId as string,
            label: band.label,
            min_score: band.minScore,
            max_score: band.maxScore,
            position: index,
          })),
        );
      }

      await writeAudit({
        actorUserId: context.userId,
        actorRole: roles[0] ?? null,
        action: previous ? "SCORING_RULE_UPDATED" : "SCORING_RULE_CREATED",
        module: "Scoring",
        entityType: "scoring_rule",
        entityId: ruleId,
        previousValue: previous,
        newValue: { ...payload, weights: data.weights, bands: data.bands },
      });

      return { ok: true as const, ruleId, warnings: problems };
    } catch (error) {
      await writeAudit({
        actorUserId: context.userId,
        actorRole: roles[0] ?? null,
        action: "SCORING_RULE_SAVE_FAILED",
        module: "Scoring",
        result: "FAILURE",
        reason: safeMessage(error, "Save failed"),
      });
      throw error;
    }
  });

export const activateScoringRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { ruleId: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    const { requirePermission, getAdmin, writeAudit, getActorRoles, validationError } =
      await import("./server-core.server");
    const { loadScoringRule, validateScoringRule } = await import("./scoring.server");
    await requirePermission(context.userId, "scoring.manage", "Scoring");

    const admin = await getAdmin();
    const roles = await getActorRoles(context.userId);
    const rule = await loadScoringRule(data.ruleId);
    if (!rule) throw validationError("Scoring rule not found");
    if (rule.status === "ACTIVE") return { ok: true as const };

    const { count } = await admin
      .from("evaluation_criteria")
      .select("id", { count: "exact", head: true })
      .eq("template_id", rule.templateId);
    const problems = validateScoringRule(rule, count ?? 0);
    if (problems.length > 0) throw validationError(problems.join(" "));

    await admin
      .from("scoring_rules")
      .update({ status: "RETIRED" })
      .eq("template_id", rule.templateId)
      .eq("status", "ACTIVE");
    const { error } = await admin
      .from("scoring_rules")
      .update({
        status: "ACTIVE",
        activated_at: new Date().toISOString(),
        activated_by: context.userId,
      })
      .eq("id", rule.id);
    if (error) throw validationError(error.message);

    await writeAudit({
      actorUserId: context.userId,
      actorRole: roles[0] ?? null,
      action: "SCORING_RULE_ACTIVATED",
      module: "Scoring",
      entityType: "scoring_rule",
      entityId: rule.id,
      previousValue: { status: rule.status },
      newValue: { status: "ACTIVE", version: rule.version },
      reason: data.reason,
    });

    return { ok: true as const };
  });

export const getEvaluationScore = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { evaluationId: string }) => input)
  .handler(async ({ data, context }) => {
    const { requirePermissionAny } = await import("./server-core.server");
    const { loadScore, checkFinalizationEligibility, computeScore } =
      await import("./scoring.server");
    await requirePermissionAny(context.userId, ["scores.view", "president.view"], "Scoring");

    const [storedScore, eligibility] = await Promise.all([
      loadScore(data.evaluationId),
      checkFinalizationEligibility(data.evaluationId),
    ]);

    let score = storedScore ?? eligibility.score;
    if (!score) {
      try {
        score = await computeScore(data.evaluationId);
      } catch {
        score = null;
      }
    }

    return { score, blockers: eligibility.blockers, eligible: eligibility.eligible };
  });

export const recalculateScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { evaluationId: string }) => input)
  .handler(async ({ data, context }) => {
    const { requirePermission, writeAudit, getActorRoles } = await import("./server-core.server");
    const { computeScore, persistScore, loadScore } = await import("./scoring.server");
    await requirePermission(context.userId, "scoring.manage", "Scoring");

    const previous = await loadScore(data.evaluationId);
    const result = await computeScore(data.evaluationId);
    await persistScore(data.evaluationId, result, context.userId);
    const roles = await getActorRoles(context.userId);
    await writeAudit({
      actorUserId: context.userId,
      actorRole: roles[0] ?? null,
      action: "SCORE_RECALCULATED",
      module: "Scoring",
      entityType: "evaluation",
      entityId: data.evaluationId,
      evaluationId: data.evaluationId,
      previousValue: previous,
      newValue: result,
    });
    return { ok: true as const, score: await loadScore(data.evaluationId) };
  });

export async function processFinalizedEvaluationSupportModules(
  evaluationId: string,
): Promise<void> {
  const { ensureDevelopmentRecordsForEvaluation } =
    await import("@/features/learning-management/development.functions");
  const { ensureTrainingRecommendationsForEvaluation } =
    await import("@/features/training-management/training.functions");
  const { ensureSuccessionProfileForEvaluation } =
    await import("@/features/succession-planning/succession.functions");
  const { ensureRecognitionCandidatesForEvaluation } =
    await import("@/features/social-recognition/recognition.functions");

  await Promise.all([
    ensureDevelopmentRecordsForEvaluation(evaluationId),
    ensureTrainingRecommendationsForEvaluation(evaluationId),
    ensureSuccessionProfileForEvaluation(evaluationId),
    ensureRecognitionCandidatesForEvaluation(evaluationId),
  ]);
}

export const reprocessFinalizedEvaluationSupportModules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ evaluationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { requirePermission, getAdmin, validationError } = await import("./server-core.server");
    await requirePermission(context.userId, "evaluations.finalize", "Evaluations");
    const admin = await getAdmin();
    const { data: evaluation } = await admin
      .from("evaluations")
      .select("id, status, is_finalized")
      .eq("id", data.evaluationId)
      .maybeSingle();
    if (!evaluation) throw validationError("Evaluation not found");
    if (!(evaluation.is_finalized || evaluation.status === "FINALIZED"))
      throw validationError("Only finalized evaluations can be reprocessed");
    await processFinalizedEvaluationSupportModules(data.evaluationId);
    return { ok: true as const };
  });

export const finalizeEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { evaluationId: string; version: number; reason: string }) =>
    finalizeSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    const {
      requirePermission,
      getAdmin,
      writeAudit,
      getActorRoles,
      validationError,
      assertVersion,
      safeMessage,
    } = await import("./server-core.server");
    const { checkFinalizationEligibility, persistScore, emitNotification } =
      await import("./scoring.server");
    await requirePermission(context.userId, "evaluations.finalize", "Evaluations");

    const admin = await getAdmin();
    const roles = await getActorRoles(context.userId);
    try {
      await assertVersion(data.evaluationId, data.version);
      const { eligible, blockers, score } = await checkFinalizationEligibility(data.evaluationId);
      if (!eligible || !score) throw validationError(blockers.join(" "));

      await persistScore(data.evaluationId, score, context.userId);

      const now = new Date().toISOString();
      const { data: finalizedEvaluation, error } = await admin
        .from("evaluations")
        .update({
          status: "FINALIZED",
          is_finalized: true,
          version: data.version + 1,
          finalized_at: now,
          finalized_by: context.userId,
          finalization_reason: data.reason,
        })
        .eq("id", data.evaluationId)
        .eq("version", data.version)
        .select("id")
        .maybeSingle();
      if (error || !finalizedEvaluation)
        throw validationError(
          "This evaluation changed while you were working. Reload and try again.",
        );

      await Promise.all([
        admin
          .from("evaluation_scores")
          .update({ is_locked: true })
          .eq("evaluation_id", data.evaluationId),
        admin
          .from("evaluation_ratings")
          .update({ is_locked: true })
          .eq("evaluation_id", data.evaluationId),
        admin
          .from("president_responses")
          .update({ is_locked: true })
          .eq("evaluation_id", data.evaluationId),
      ]);

      await admin.from("evaluation_events").insert({
        evaluation_id: data.evaluationId,
        event_type: "FINALIZED",
        to_status: "FINALIZED",
        actor_user_id: context.userId,
        reason: data.reason,
      });

      await writeAudit({
        actorUserId: context.userId,
        actorRole: roles[0] ?? null,
        action: "EVALUATION_FINALIZED",
        module: "Evaluations",
        entityType: "evaluation",
        entityId: data.evaluationId,
        evaluationId: data.evaluationId,
        newValue: { finalScore: score.finalScore, finalRating: score.finalRatingLabel },
        reason: data.reason,
      });

      void (async () => {
        const { createFinalEvaluationDocument } = await import("./documents.server");
        const { queueEmployeeFinalizedStep1Email } = await import("./public.functions");
        await Promise.all([
          createFinalEvaluationDocument(data.evaluationId, context.userId),
          processFinalizedEvaluationSupportModules(data.evaluationId),
          queueEmployeeFinalizedStep1Email(data.evaluationId),
          emitNotification({
            evaluationId: data.evaluationId,
            eventType: "EVALUATION_FINALIZED",
            audiencePermission: "reports.view",
            title: "Performance Evaluation Finalized",
            body: "Your performance evaluation has been finalized and is now complete.",
            dedupeKey: `finalized:${data.evaluationId}`,
          }),
        ]);
      })().catch((error) => {
        console.error("[finalization] asynchronous downstream processing failed", error);
      });

      return { ok: true as const };
    } catch (error) {
      await writeAudit({
        actorUserId: context.userId,
        actorRole: roles[0] ?? null,
        action: "EVALUATION_FINALIZE_FAILED",
        module: "Evaluations",
        entityType: "evaluation",
        entityId: data.evaluationId,
        evaluationId: data.evaluationId,
        result: "FAILURE",
        reason: safeMessage(error, "Finalization failed"),
      });
      throw error;
    }
  });

export const returnForCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { evaluationId: string; version: number; reason: string }) =>
    correctionSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    const { requirePermission, getAdmin, writeAudit, getActorRoles, validationError } =
      await import("./server-core.server");
    const { emitNotification } = await import("./scoring.server");
    await requirePermission(context.userId, "evaluations.correct", "Evaluations");

    const admin = await getAdmin();
    const roles = await getActorRoles(context.userId);
    const { data: evaluation } = await admin
      .from("evaluations")
      .select("id, status, is_finalized, version")
      .eq("id", data.evaluationId)
      .maybeSingle();
    if (!evaluation) throw validationError("Evaluation not found");
    if (evaluation.version !== data.version)
      throw validationError("This record changed while you were working. Reload and try again.");

    await admin
      .from("evaluation_scores")
      .update({ is_locked: false })
      .eq("evaluation_id", data.evaluationId);
    await admin
      .from("evaluation_ratings")
      .update({ is_locked: false })
      .eq("evaluation_id", data.evaluationId);
    await admin
      .from("president_responses")
      .update({ is_locked: false })
      .eq("evaluation_id", data.evaluationId);

    const { error } = await admin
      .from("evaluations")
      .update({
        status: "RETURNED",
        is_finalized: false,
        correction_reason: data.reason,
      })
      .eq("id", data.evaluationId);
    if (error) throw validationError(error.message);

    await admin.from("evaluation_events").insert({
      evaluation_id: data.evaluationId,
      event_type: "RETURNED",
      from_status: evaluation.status,
      to_status: "RETURNED",
      actor_user_id: context.userId,
      reason: data.reason,
    });

    await emitNotification({
      evaluationId: data.evaluationId,
      eventType: "EVALUATION_RETURNED",
      audiencePermission: "evaluations.view_step1",
      title: "Evaluation Returned",
      body: "A performance evaluation has been returned for further review and correction.",
      dedupeKey: `returned:${data.evaluationId}:${Date.now()}`,
    });

    await writeAudit({
      actorUserId: context.userId,
      actorRole: roles[0] ?? null,
      action: "EVALUATION_RETURNED",
      module: "Evaluations",
      entityType: "evaluation",
      entityId: data.evaluationId,
      evaluationId: data.evaluationId,
      previousValue: { status: evaluation.status, isFinalized: evaluation.is_finalized },
      newValue: { status: "RETURNED" },
      reason: data.reason,
    });

    return { ok: true as const };
  });
